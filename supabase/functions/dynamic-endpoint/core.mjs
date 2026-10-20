import {decodeMedia} from './media-base64.mjs';
export const MAX_MEDIA = 12 * 1024 * 1024;
export function validatePost(body) {
  if (!/^[0-9a-f-]{36}$/i.test(body.requestId || '')) throw Error('Invalid publish request ID.');
  const caption=String(body.caption||'').trim();
  if (!caption || caption.length>3000) throw Error('LinkedIn caption must be 1–3,000 characters.');
  let media=null;
  if(body.media){
    const {mimeType,data}=body.media;
    if(!['image/jpeg','image/png','video/mp4'].includes(mimeType)) throw Error('LinkedIn publishing accepts JPG, PNG or MP4.');
    if(typeof data!=='string'||data.length>MAX_MEDIA*4/3||!data.length||data.length%4) throw Error('Publish media must be under 12 MB.');
    decodeMedia(data);media={mimeType,data};
  }
  return {caption,requestId:body.requestId,media};
}
export function postBody(member, caption, asset, mimeType) {
  if(!/^[A-Za-z0-9_-]+$/.test(member))throw Error('Invalid LinkedIn member.');
  const content={shareCommentary:{text:caption},shareMediaCategory:asset?(mimeType.startsWith('video/')?'VIDEO':'IMAGE'):'NONE'};
  if(asset)content.media=[{status:'READY',media:asset}];
  return {author:`urn:li:person:${member}`,lifecycleState:'PUBLISHED',specificContent:{'com.linkedin.ugc.ShareContent':content},visibility:{'com.linkedin.ugc.MemberNetworkVisibility':'PUBLIC'}};
}
const bytesToBase64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const base64ToBytes=text=>decodeMedia(text);
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function key(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('CreativeRelay LinkedIn tokens:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function encrypt(token,secret){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),new TextEncoder().encode(token));return bytesToBase64(iv)+'.'+bytesToBase64(new Uint8Array(data));}
export async function decrypt(cipher,secret){const [iv,data]=cipher.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv)},await key(secret),base64ToBytes(data)));}
export async function linkedInFetch(path,token,options={}){
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
export async function uploadMedia(member,media,token){
  const recipe=media.mimeType.startsWith('video/')?'feedshare-video':'feedshare-image';
  const response=await linkedInFetch('/v2/assets?action=registerUpload',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({registerUploadRequest:{recipes:['urn:li:digitalmediaRecipe:'+recipe],owner:'urn:li:person:'+member,serviceRelationships:[{relationshipType:'OWNER',identifier:'urn:li:userGeneratedContent'}]}})});
  const {value}=await response.json();const uploadURL=value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const target=new URL(uploadURL);if(target.protocol!=='https:'||!(target.hostname==='linkedin.com'||target.hostname.endsWith('.linkedin.com')))throw Error('Unexpected LinkedIn upload destination.');
  const uploaded=await fetch(target,{method:'PUT',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':media.mimeType},body:base64ToBytes(media.data),signal:AbortSignal.timeout(60000)});
  if(!uploaded.ok)throw Error('LinkedIn media upload failed. Nothing was published.');
  if(typeof value.asset!=='string'||!value.asset.startsWith('urn:li:digitalmediaAsset:'))throw Error('LinkedIn did not return a media asset.');
  return value.asset;
}

