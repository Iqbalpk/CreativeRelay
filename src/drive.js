export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const API='https://www.googleapis.com/drive/v3';
export class DriveStore {
 constructor({fetcher=(...args)=>globalThis.fetch(...args),clock=Date.now,session=globalThis.sessionStorage}={}){this.fetcher=fetcher;this.clock=clock;this.session=session;this.provider=null;this.linked=false;this.restoring=null;this.generation=0;this.owner=null;this.token=null;this.expiry=0;this.folder=null;}
 setOwner(owner){
  if(this.owner===owner)return;
  if(this.owner)this.disconnect();
  this.generation++;this.linked=false;this.restoring=null;this.owner=owner||null;this.token=null;this.expiry=0;this.folder=null;
  if(!this.owner)return;
  try{const saved=JSON.parse(this.session?.getItem('creativerelay-drive-session')||'null');
   if(saved?.owner===this.owner&&typeof saved.token==='string'&&saved.token&&Number.isFinite(saved.expiry)&&this.clock()<saved.expiry-30000){this.token=saved.token;this.expiry=saved.expiry;}
   else this.session?.removeItem('creativerelay-drive-session');
  }catch{try{this.session?.removeItem('creativerelay-drive-session');}catch{}}
 }
 authorize(token,expires=3600){if(!token)throw Error('Google did not return an access token.');const seconds=Number(expires);if(!Number.isFinite(seconds)||seconds<=30)throw Error('Google returned an invalid token expiry.');this.token=token;this.expiry=this.clock()+seconds*1000;this.folder=null;try{if(this.owner)this.session?.setItem('creativerelay-drive-session',JSON.stringify({owner:this.owner,token:this.token,expiry:this.expiry}));}catch{}}
 disconnect(){this.generation++;this.linked=false;this.restoring=null;this.token=null;this.expiry=0;this.folder=null;try{this.session?.removeItem('creativerelay-drive-session');}catch{}}
 setTokenProvider(provider){this.provider=provider;}
 get connected(){return this.linked||Boolean(this.token&&this.clock()<this.expiry-30000);}
 async restore(force=false){
  if(!this.provider||!this.owner||this.owner==='local')return this.connected;
  if(!force&&this.token&&this.clock()<this.expiry-30000)return this.connected;
  if(this.restoring)return this.restoring;
  const generation=this.generation,owner=this.owner;
  const pending=(async()=>{const result=await this.provider(force);if(generation!==this.generation||owner!==this.owner)throw Error('Your Drive account changed.');
   if(!result.connected){this.disconnect();return false;}
   if(typeof result.accessToken!=='string'||!Number.isFinite(result.expiresIn)||result.expiresIn<=30)throw Error('Drive returned an invalid access token.');
   this.token=result.accessToken;this.expiry=this.clock()+result.expiresIn*1000;this.linked=true;return true;
  })();this.restoring=pending;try{return await pending;}finally{if(this.restoring===pending)this.restoring=null;}
 }

 async request(url,options={}){if(this.provider)await this.restore();if(!this.connected)throw Error('Connect Google Drive in Settings.');const send=()=>this.fetcher(url,{...options,headers:{...options.headers,Authorization:`Bearer ${this.token}`}});let response=await send();if(response.status===401&&this.provider){this.expiry=0;await this.restore(true);if(this.connected)response=await send();}if(response.status===401){this.disconnect();throw Error('Google Drive access expired or permission was revoked. Connect in Settings.');}if(!response.ok){let message='Google Drive request failed';try{message=(await response.json()).error?.message||message;}catch{}throw Error(message);}return response;}
 async json(url,options){return (await this.request(url,options)).json();}
 async folderId(){if(this.folder)return this.folder;const q="trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='oneStation' and value='library-v1' }";const data=await this.json(`${API}/files?${new URLSearchParams({q,fields:'files(id,name)',pageSize:'100'})}`);if(data.files?.length)this.folder=data.files[0].id;else this.folder=(await this.json(`${API}/files?fields=id`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'CreativeRelay',mimeType:'application/vnd.google-apps.folder',appProperties:{oneStation:'library-v1'}})})).id;return this.folder;}
 async listDrafts(){const folder=await this.folderId();let result=[],pageToken;do{const params=new URLSearchParams({q:`trashed=false and '${folder}' in parents and appProperties has { key='oneStation' and value='draft-v1' }`,fields:'nextPageToken,files(id,name)',pageSize:'100'});if(pageToken)params.set('pageToken',pageToken);const page=await this.json(`${API}/files?${params}`);result.push(...(page.files||[]));pageToken=page.nextPageToken;}while(pageToken);const drafts=[];for(const f of result){const d=await this.json(`${API}/files/${encodeURIComponent(f.id)}?alt=media`);if(d&&typeof d.title==='string'&&d.captions&&Array.isArray(d.selected))drafts.push({...d,id:f.id,driveDraftId:f.id,storage:'drive'});}return drafts.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));}
 async upload(file,{id,name=file.name||'asset',kind='asset'}={}){const folder=await this.folderId();const metadata={name,appProperties:{oneStation:kind==='draft'?'draft-v1':'asset-v1'}};if(!id)metadata.parents=[folder];const path=id?`/${encodeURIComponent(id)}`:'';const response=await this.request(`https://www.googleapis.com/upload/drive/v3/files${path}?uploadType=resumable&fields=id,name,mimeType`,{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':file.type||'application/octet-stream','X-Upload-Content-Length':String(file.size)},body:JSON.stringify(metadata)});const session=response.headers.get('Location');if(!session||!session.startsWith('https://www.googleapis.com/'))throw Error('Drive did not return a valid upload session.');return this.json(session,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});}
 async saveDraft(draft){const {media,thumb,...payload}=draft;return this.upload(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),{id:draft.driveDraftId,name:`${draft.title.slice(0,100)}.creative-relay.json`,kind:'draft'});}
 async readAsset(id){return (await this.request(`${API}/files/${encodeURIComponent(id)}?alt=media`)).blob();}
}
export async function loadGoogleIdentity(){if(window.google?.accounts?.oauth2)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Could not load Google sign-in. Check your connection.'));};document.head.append(script);});}
export async function connectDrive(store,clientId){if(!clientId)throw Error('Set VITE_GOOGLE_CLIENT_ID first. See GOOGLE-SETUP.md.');await loadGoogleIdentity();return new Promise((resolve,reject)=>{const client=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:DRIVE_SCOPE,callback:response=>{if(response.error)return reject(Error(response.error));if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,DRIVE_SCOPE))return reject(Error('Google Drive permission was not granted.'));store.authorize(response.access_token,response.expires_in);resolve();},error_callback:error=>reject(Error(error.type==='popup_closed'?'Google connection cancelled.':'Google sign-in could not open. Allow the sign-in popup.'))});client.requestAccessToken({prompt:'select_account'});});}

