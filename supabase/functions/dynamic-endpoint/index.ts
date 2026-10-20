import {decodeMedia} from './media-base64.mjs';
import {createClient} from 'npm:@supabase/supabase-js@2';



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

const MAX_MEDIA = 12 * 1024 * 1024;

function validatePost(body) {

  if (!/^[0-9a-f-]{36}$/i.test(body.requestId || '')) throw Error('Invalid publish request ID.');

  const caption=String(body.caption||'').trim();

  if (!caption || caption.length>3000) throw Error('LinkedIn caption must be 1–3,000 characters.');

  const slides=validateSlides(body);let media=null;

  if(body.media){

    const {mimeType,data}=body.media;

    if(!['image/jpeg','image/png','video/mp4'].includes(mimeType)) throw Error('LinkedIn publishing accepts JPG, PNG or MP4.');

    if(typeof data!=='string'||data.length>MAX_MEDIA*4/3||!data.length||data.length%4) throw Error('Publish media must be under 12 MB.');

    decodeMedia(data);media={mimeType,data};

  }

  return {caption,requestId:body.requestId,media,slides};

}

function postBody(member, caption, asset, mimeType) {

  if(!/^[A-Za-z0-9_-]+$/.test(member))throw Error('Invalid LinkedIn member.');

  const content={shareCommentary:{text:caption},shareMediaCategory:asset?(mimeType.startsWith('video/')?'VIDEO':'IMAGE'):'NONE'};

  if(asset)content.media=(Array.isArray(asset)?asset:[asset]).map(media=>({status:'READY',media}));

  return {author:`urn:li:person:${member}`,lifecycleState:'PUBLISHED',specificContent:{'com.linkedin.ugc.ShareContent':content},visibility:{'com.linkedin.ugc.MemberNetworkVisibility':'PUBLIC'}};

}

const bytesToBase64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));

const base64ToBytes=text=>decodeMedia(text);

async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}

async function key(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('CreativeRelay LinkedIn tokens:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}

async function encrypt(token,secret){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),new TextEncoder().encode(token));return bytesToBase64(iv)+'.'+bytesToBase64(new Uint8Array(data));}

async function decrypt(cipher,secret){const [iv,data]=cipher.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv)},await key(secret),base64ToBytes(data)));}

async function linkedInFetch(path,token,options={}){

  const response=await fetch('https://api.linkedin.com'+path,{...options,redirect:'error',headers:{Authorization:'Bearer '+token,'X-Restli-Protocol-Version':'2.0.0',...options.headers},signal:AbortSignal.timeout(45000)});

  if(!response.ok){

    let detail='';try{const data=await response.json();detail=typeof data.message==='string'?data.message:'';}catch{}

    detail=detail.split(token).join('[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/[\r\n]/g,' ').slice(0,400);

    const hint=response.status===401?'Reconnect your LinkedIn account in Channels.':response.status===403?'Your LinkedIn app needs Share on LinkedIn permission. Reconnect after enabling it.':response.status===429?'LinkedIn rate limit reached. Wait before trying again.':'Check your LinkedIn feed before retrying.';

    const error=Error(`LinkedIn HTTP ${response.status}: ${detail||hint}${detail?' '+hint:''}`);

    error.providerStatus=response.status;throw error;

  }

  return response;

}

async function uploadMedia(member,media,token){

  const recipe=media.mimeType.startsWith('video/')?'feedshare-video':'feedshare-image';

  const response=await linkedInFetch('/v2/assets?action=registerUpload',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({registerUploadRequest:{recipes:['urn:li:digitalmediaRecipe:'+recipe],owner:'urn:li:person:'+member,serviceRelationships:[{relationshipType:'OWNER',identifier:'urn:li:userGeneratedContent'}]}})});

  const {value}=await response.json();const uploadURL=value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;

  const target=new URL(uploadURL);if(target.protocol!=='https:'||!(target.hostname==='linkedin.com'||target.hostname.endsWith('.linkedin.com')))throw Error('Unexpected LinkedIn upload destination.');

  const uploaded=await fetch(target,{method:'PUT',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':media.mimeType},body:base64ToBytes(media.data),signal:AbortSignal.timeout(60000)});

  if(!uploaded.ok)throw Error('LinkedIn media upload failed. Nothing was published.');

  if(typeof value.asset!=='string'||!value.asset.startsWith('urn:li:digitalmediaAsset:'))throw Error('LinkedIn did not return a media asset.');

  return value.asset;

}



const origin=Deno.env.get('APP_ORIGIN')||'https://iqbalpk.github.io';

const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};

const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});

// Disable gateway legacy JWT verification. Every POST verifies the user here.

Deno.serve(async req=>{

 if(req.method==='OPTIONS')return new Response('ok',{headers});

 if(req.method!=='POST')return reply({error:'POST required'},405);

 let stage='authenticate';

 try{

  const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!);

  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';

  const {data:{user},error}=await auth.auth.getUser(token);if(error||!user)return reply({error:'Sign in required'},401);

  if(Number(req.headers.get('content-length')||0)>18*1024*1024)return reply({error:'Media too large'},413);

  const body=await req.json();

  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if(body.action==='connect'){

   const clientId=Deno.env.get('LINKEDIN_CLIENT_ID'),redirect=Deno.env.get('LINKEDIN_REDIRECT_URI');if(!clientId||!redirect||!Deno.env.get('LINKEDIN_CLIENT_SECRET'))throw Error('LinkedIn server secrets are missing.');

   const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');

   await db.from('linkedin_oauth_states').delete().lt('expires_at',new Date().toISOString());

   const {error}=await db.from('linkedin_oauth_states').insert({state_hash:await hash(state),user_id:user.id,expires_at:new Date(Date.now()+600000).toISOString()});if(error)throw Error('Apply linkedin.sql before connecting.');

   const url=new URL('https://www.linkedin.com/oauth/v2/authorization');url.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirect,state,scope:'openid profile w_member_social'}).toString();return reply({url:url.href});

  }

  if(body.action==='disconnect'){const {error}=await db.from('linkedin_connections').delete().eq('user_id',user.id);if(error)throw Error('Could not disconnect.');return reply({connected:false});}

  const {data:connection,error:connectionError}=await db.from('linkedin_connections').select('*').eq('user_id',user.id).maybeSingle();if(connectionError)throw Error('Apply linkedin.sql before connecting.');

  const connected=!!connection&&Date.parse(connection.expires_at)>Date.now();

  if(body.action==='status')return reply({connected,name:connected?connection.display_name:null,expiresAt:connection?.expires_at});

  if(body.action!=='publish')return reply({error:'Unknown action'},400);

  if(!connected)return reply({error:'Connect your LinkedIn account first.'},401);

  const input=validatePost(body);

  stage='reserve-publication';

  const {error:claimError}=await db.from('linkedin_publish_attempts').insert({user_id:user.id,request_id:input.requestId});

  if(claimError){if(claimError.code!=='23505')throw Error('Could not reserve publish request.');const {data:previous}=await db.from('linkedin_publish_attempts').select('status,post_id').eq('user_id',user.id).eq('request_id',input.requestId).single();if(previous?.status==='published')return reply({published:true,postId:previous.post_id,url:'https://www.linkedin.com/feed/update/'+encodeURIComponent(previous.post_id)});return reply({error:'This publish attempt was already sent. Check your LinkedIn feed before trying another post.'},409);}

  try{

   stage='decrypt-connection';

   let linkedinToken:string;

   try{linkedinToken=await decrypt(connection.token_cipher,Deno.env.get('LINKEDIN_CLIENT_SECRET')!);}catch{throw Error('Your saved LinkedIn connection cannot be read. Reconnect LinkedIn in Channels.');}

   stage='upload-media';

   const asset=input.slides?await (async()=>{const assets=[];for(const slide of input.slides)assets.push(await uploadMedia(connection.member_id,slide,linkedinToken));return assets;})():input.media?await uploadMedia(connection.member_id,input.media,linkedinToken):null;

   const payload=postBody(connection.member_id,input.caption,asset,input.slides?'image/jpeg':input.media?.mimeType);

   stage='create-post';

   const response=await linkedInFetch('/v2/ugcPosts',linkedinToken,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});

   const postId=response.headers.get('x-restli-id');

   await db.from('linkedin_publish_attempts').update({status:'published',post_id:postId}).eq('user_id',user.id).eq('request_id',input.requestId);

   return reply({published:true,postId,url:postId?'https://www.linkedin.com/feed/update/'+encodeURIComponent(postId):'https://www.linkedin.com/feed/'});

  }catch(e){await db.from('linkedin_publish_attempts').update({status:'unconfirmed'}).eq('user_id',user.id).eq('request_id',input.requestId);throw e;}

 }catch(e){const message=e instanceof Error?e.message:'LinkedIn request failed';console.warn(JSON.stringify({stage,message,providerStatus:(e as {providerStatus?:number})?.providerStatus}));return reply({error:message,stage},400);}

});


