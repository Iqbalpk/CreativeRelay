import {decodeMedia} from './media-base64.mjs';
import {publicationHistory} from './publication-utils.mjs';
import {createClient} from 'npm:@supabase/supabase-js@2';


const db = () => createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
function setting(name:string) { const value=Deno.env.get(name)?.trim(); if(!value)throw Error('Missing Facebook server setting'); return value; }
async function hash(value:string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''); }
async function seal(token:string) {
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('CreativeRelay Facebook:'+setting('FACEBOOK_CLIENT_SECRET'))),{name:'AES-GCM'},false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token)));
 const base=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
 return base(iv)+'.'+base(cipher);
}
async function unseal(cipher:string) {
 const parts=cipher.split('.');if(parts.length!==2)throw Error('Invalid stored Facebook connection');
 const decode=(value:string)=>decodeMedia(value);
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('CreativeRelay Facebook:'+setting('FACEBOOK_CLIENT_SECRET'))),{name:'AES-GCM'},false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(parts[0])},key,decode(parts[1])));
}
async function graph(path:string,token:string) {
 const url=new URL('https://graph.facebook.com/v24.0/'+path);
 const res=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)}),data=await res.json();
 if(!res.ok||data.error)throw Error('Facebook request failed. Check Page access and reconnect.');
 return data;
}
function redirectURI() {
 const uri=setting('FACEBOOK_REDIRECT_URI');
 if(uri!==setting('SUPABASE_URL')+'/functions/v1/facebook-callback')throw Error('Incorrect Facebook callback setting');
 return uri;
}




function validateSlides(body) {

 if (body.slides === undefined) return null;

 if (body.media || !Array.isArray(body.slides) || body.slides.length < 2 || body.slides.length > 10) throw Error('Choose 2–10 carousel images.');

 let total=0;

 return body.slides.map(item=>{

  if(item?.mimeType!=='image/jpeg'||typeof item.data!=='string'||item.data.length>1400000||item.data.length%4)throw Error('Use prepared JPG carousel images, up to 1 MB each.');

  const bytes=decodeMedia(item.data);total+=bytes.length;

  if(bytes.length>1024*1024||total>10*1024*1024||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('Invalid carousel image.');

  return {mimeType:'image/jpeg',data:item.data,bytes};

 });

}

function validatePost(body){

 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId||''))throw Error('Invalid publish request ID.');

 if(!/^\d+$/.test(body.pageId||''))throw Error('Select a Facebook Page first.');

 const caption=String(body.caption||'').trim();if(!caption||caption.length>10000)throw Error('Write a Facebook caption between 1 and 10,000 characters.');

 const slides=validateSlides(body);let media=null;

 if(body.media){

  const {mimeType,data}=body.media;

  if(!['image/jpeg','image/png','video/mp4'].includes(mimeType))throw Error('Facebook needs a JPG, PNG or MP4.');

  if(typeof data!=='string'||!data.length||data.length>16*1024*1024||data.length%4)throw Error('Facebook media must be under 12 MB.');

  const bytes=decodeMedia(data);if(bytes.length>12*1024*1024)throw Error('Facebook media must be under 12 MB.');

  if(mimeType==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('Invalid JPG image.');

  if(mimeType==='image/png'&&![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))throw Error('Invalid PNG image.');

  if(mimeType==='video/mp4'&&String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw Error('Invalid MP4 video.');

  media={mimeType,bytes};

 }

 return {requestId:body.requestId,pageId:body.pageId,caption,media,slides};

}

function postRequest(input,token){

 const type=input.media?.mimeType,video=type==='video/mp4';

 const path=!type?'feed':video?'videos':'photos';

 const endpoint=`https://${video?'graph-video':'graph'}.facebook.com/v24.0/${input.pageId}/${path}`;

 const body=type?new FormData():new URLSearchParams();

 body.set(video?'description':type?'caption':'message',input.caption);

 if(type){body.set('source',new Blob([input.media.bytes],{type}),video?'artwork.mp4':type==='image/png'?'artwork.png':'artwork.jpg');body.set('published','true');}

 return {endpoint,options:{method:'POST',headers:{Authorization:'Bearer '+token},body,redirect:'error',signal:AbortSignal.timeout(60000)}};

}

async function sendPost(input,token,fetcher=fetch){

 if(input.slides){

  const attached=[];

  for(const slide of input.slides){

   const form=new FormData();form.set('published','false');form.set('source',new Blob([slide.bytes],{type:'image/jpeg'}),'slide.jpg');

   const response=await fetcher(`https://graph.facebook.com/v24.0/${input.pageId}/photos`,{method:'POST',headers:{Authorization:'Bearer '+token},body:form,redirect:'error',signal:AbortSignal.timeout(45000)});

   const data=await response.json();if(!response.ok||data.error||!/^\d+$/.test(String(data.id||'')))throw Error('Facebook could not prepare carousel images. No feed post was confirmed.');

   attached.push({media_fbid:String(data.id)});

  }

  const body=new URLSearchParams({message:input.caption,attached_media:JSON.stringify(attached)});

  const response=await fetcher(`https://graph.facebook.com/v24.0/${input.pageId}/feed`,{method:'POST',headers:{Authorization:'Bearer '+token},body,redirect:'error',signal:AbortSignal.timeout(60000)});

  const data=await response.json();if(!response.ok||data.error||!/^\d+(?:_\d+)?$/.test(String(data.id||'')))throw Error('Facebook carousel publication was not confirmed. Check your Page before retrying.');

  return {published:true,postId:String(data.id),url:'https://www.facebook.com/'+data.id};

 }

 const {endpoint,options}=postRequest(input,token),response=await fetcher(endpoint,options),data=await response.json();

 if(!response.ok||data.error)throw Error('Facebook rejected the post (HTTP '+response.status+', code '+(Number.isInteger(data.error?.code)?data.error.code:'unknown')+'). Check Page permissions and media format.');

 const postId=String(data.post_id||data.id||'');if(!/^\d+(?:_\d+)?$/.test(postId))throw Error('Facebook publication is unconfirmed. Check your Page before trying another post.');

 return {published:true,postId,url:'https://www.facebook.com/'+postId};

}

// Reserve a request before calling Meta. A timeout or saving error must never cause a second POST.

async function publishOnce({client,userId,input,token,send=sendPost,digest}){

 const identity={user_id:userId,request_id:input.requestId,page_id:input.pageId,payload_hash:digest,status:'sending'};

 const {error}=await client.from('facebook_publish_attempts').insert(identity);

 if(error){

  if(error.code!=='23505')throw Error('Apply facebook-publishing.sql before publishing.');

  const {data,error:readError}=await client.from('facebook_publish_attempts').select('*').eq('user_id',userId).eq('request_id',input.requestId).single();

  if(readError||!data)throw Error('Could not check publication status.');

  if(data.page_id!==input.pageId||data.payload_hash!==digest)throw Error('Publish request does not match the reviewed post.');

  if(data.status==='published'&&/^\d+(?:_\d+)?$/.test(data.post_id||''))return {published:true,postId:data.post_id,url:'https://www.facebook.com/'+data.post_id};

  throw Error('Publication is unconfirmed or still sending. Check your Facebook Page before creating another post.');

 }

 try{

  const result=await send(input,token);

  const {error:saveError}=await client.from('facebook_publish_attempts').update({status:'published',post_id:result.postId}).eq('user_id',userId).eq('request_id',input.requestId);

  if(saveError)throw Error('Facebook may have published this post but its status could not be saved. Check your Page.');

  return result;

 }catch(error){await client.from('facebook_publish_attempts').update({status:'unconfirmed'}).eq('user_id',userId).eq('request_id',input.requestId);throw error;}

}



const headers={'Access-Control-Allow-Origin':Deno.env.get('APP_ORIGIN')||'https://iqbalpk.github.io','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});

Deno.serve(async req=>{

 if(req.method==='OPTIONS')return new Response('ok',{headers});

 if(req.method!=='POST')return reply({error:'POST required'},405);

 try {

  const auth=createClient(setting('SUPABASE_URL'),setting('SUPABASE_ANON_KEY'));

  const {data:{user},error}=await auth.auth.getUser(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'');

  if(error||!user)return reply({error:'Sign in required'},401);

  const raw=await req.text();if(raw.length>18*1024*1024)return reply({error:'Request too large'},413);

  const body=JSON.parse(raw),client=db();

  if(body.action==='history'){if(body.userId!==user.id)return reply({error:'Your account changed.'},401);return reply(await publicationHistory(client,user.id,'Facebook'));}

  if(body.action==='publish'){

   if(body.userId!==user.id)return reply({error:'Your account changed. Review the post again.'},401);

   const input=validatePost(body);

   const {data:selected,error:selectedError}=await client.from('facebook_selected_pages').select('page_id').eq('user_id',user.id).maybeSingle();

   if(selectedError||selected?.page_id!==input.pageId)throw Error('The selected Facebook Page changed. Review your post again.');

   const {data:connection,error:connectionError}=await client.from('facebook_connections').select('*').eq('user_id',user.id).eq('page_id',input.pageId).gt('expires_at',new Date().toISOString()).maybeSingle();

   if(connectionError||!connection)throw Error('Reconnect your Facebook Page in Channels first.');

   const digest=await hash(JSON.stringify({pageId:input.pageId,caption:input.caption,media:body.media||null,slides:body.slides||null}));

   return reply(await publishOnce({client,userId:user.id,input,token:await unseal(connection.token_cipher),digest}));

  }

  if(body.action==='connect'){

   setting('FACEBOOK_CLIENT_SECRET');const redirect=redirectURI(),state=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');

   const {error}=await client.from('facebook_oauth_states').insert({state_hash:await hash(state),user_id:user.id,expires_at:new Date(Date.now()+600000).toISOString()});

   if(error)throw Error('Apply facebook.sql before connecting.');

   const url=new URL('https://www.facebook.com/v24.0/dialog/oauth');url.search=new URLSearchParams({client_id:setting('FACEBOOK_CLIENT_ID'),redirect_uri:redirect,state,response_type:'code',scope:'pages_show_list,pages_read_engagement,pages_manage_posts,business_management'}).toString();

   return reply({url:url.href});

  }

  if(body.action==='disconnect'){

   for(const table of ['facebook_oauth_states','facebook_connections']){const {error}=await client.from(table).delete().eq('user_id',user.id);if(error)throw Error('Could not disconnect Facebook.');}

   return reply({connected:false,pages:[]});

  }

  if(body.action==='select'){

   if(!/^\d+$/.test(body.pageId||''))return reply({error:'Invalid Page'},400);

   const {data,error}=await client.from('facebook_connections').select('page_id').eq('user_id',user.id).eq('page_id',body.pageId).maybeSingle();

   if(error||!data)throw Error('Reconnect and select an authorized Page.');

   const {error:save}=await client.from('facebook_selected_pages').upsert({user_id:user.id,page_id:body.pageId});if(save)throw Error('Could not select Page.');

  }else if(body.action!=='status')return reply({error:'Unknown action'},400);

  const {data:pages,error:pageError}=await client.from('facebook_connections').select('page_id,name').eq('user_id',user.id).gt('expires_at',new Date().toISOString());

  if(pageError)throw Error('Apply facebook.sql before connecting.');

  const {data:selected,error:selectedError}=await client.from('facebook_selected_pages').select('page_id').eq('user_id',user.id).maybeSingle();

  if(selectedError)throw Error('Could not read selected Page.');

  return reply({connected:!!pages?.some(p=>p.page_id===selected?.page_id),pageId:selected?.page_id,pages:pages||[]});

 }catch(e){return reply({error:e instanceof Error?e.message:'Facebook connection failed'},400);}

});



