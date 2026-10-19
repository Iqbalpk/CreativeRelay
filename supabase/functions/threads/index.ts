import {decodeMedia} from './media-base64.mjs';
export const THREADS_GRAPH='https://graph.threads.net/v1.0';
export const THREADS_SCOPES='threads_basic,threads_content_publish';
export const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
const encode=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function key(secret){if(!secret)throw Error('Threads is not configured.');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('CreativeRelay Threads:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function encrypt(token,secret){const iv=crypto.getRandomValues(new Uint8Array(12));return encode(iv)+'.'+encode(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),new TextEncoder().encode(token))));}
export async function decrypt(cipher,secret){const [iv,data]=cipher.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},await key(secret),decode(data)));}
export function validateThreadsPost(body){
 if(!uuid(body.requestId))throw Error('Invalid publication request.');
 if(typeof body.caption!=='string'||!body.caption.trim()||Array.from(body.caption).length>500)throw Error('Threads needs a caption between 1 and 500 characters.');
 let media=null;
 if(body.media){
  const {mimeType,data}=body.media;
  if(!['image/jpeg','image/png','video/mp4'].includes(mimeType)||typeof data!=='string'||!data.length||data.length>16*1024*1024||data.length%4)throw Error('Use JPG, PNG or MP4 up to 12 MB.');
  const bytes=decodeMedia(data);if(bytes.length>12*1024*1024)throw Error('Media exceeds 12 MB.');
  if(mimeType==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('Invalid JPG.');
  if(mimeType==='image/png'&&![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))throw Error('Invalid PNG.');
  if(mimeType==='video/mp4'&&String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw Error('Invalid MP4.');
  media={mimeType,data,bytes};
 }
 return {caption:body.caption.trim(),requestId:body.requestId,media};
}
export async function graph(path,token,params={},method='GET',fetcher=fetch){
 const url=new URL(THREADS_GRAPH+path),headers={Authorization:'Bearer '+token};
 const options={method,headers,redirect:'error',signal:AbortSignal.timeout(45000)};
 if(method==='GET')url.search=new URLSearchParams(params).toString();else{headers['Content-Type']='application/x-www-form-urlencoded';options.body=new URLSearchParams(params);}
 const response=await fetcher(url,options);let data;try{data=await response.json();}catch{throw Error('Threads returned an unreadable response. Check your profile before retrying.');}
 if(!response.ok||data.error){const code=data.error?.code;throw Error(code===190?'Threads authorization expired. Reconnect in Channels.':`Threads request failed (${response.status}${code?', code '+code:''}). Check your profile before retrying.`);}
 return data;
}

import {createClient} from 'npm:@supabase/supabase-js@2';
const appURL='https://iqbalpk.github.io/CreativeRelay/',redirect='https://zymtasgzqcnlzqgqigqt.supabase.co/functions/v1/threads-callback';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'https://iqbalpk.github.io','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const checked=({data,error}:any)=>{if(error)throw Error('Threads database operation failed. Check the Threads migration.');return data;};
const secret=()=>{const value=Deno.env.get('THREADS_CLIENT_SECRET');if(!value)throw Error('Threads is not configured.');return value;};
async function oauth(path:string,params:Record<string,string>,method='GET'){
 const url=new URL('https://graph.threads.net'+path),options:any={method,redirect:'error',signal:AbortSignal.timeout(45000)};
 if(method==='GET')url.search=new URLSearchParams(params).toString();else{options.headers={'Content-Type':'application/x-www-form-urlencoded'};options.body=new URLSearchParams(params);}
 const response=await fetch(url,options),data=await response.json();if(!response.ok||data.error||!data.access_token)throw Error('Threads authorization failed.');return data;
}
async function connection(owner:string){
 const row=checked(await db.from('threads_connections').select('*').eq('user_id',owner).maybeSingle());
 if(!row||Date.parse(row.expires_at)<=Date.now())throw Error('Connect Threads in Channels first.');
 let token;try{token=await decrypt(row.token_cipher,secret());}catch{throw Error('Reconnect Threads in Channels.');}
 return {row,token};
}
async function continuePost(owner:string,requestId:string){
 const attempt=checked(await db.from('threads_publish_attempts').select('*').eq('user_id',owner).eq('request_id',requestId).single());
 if(attempt.status==='published')return {published:true,postId:attempt.post_id};
 if(!attempt.container_id||attempt.status!=='processing')throw Error('This attempt is not confirmed. Check your Threads profile before trying again.');
 const {row,token}=await connection(owner);if(attempt.threads_user_id!==row.threads_user_id)throw Error('Your Threads account changed. Review a new publication.');const state=await graph('/'+attempt.container_id,token,{fields:'status,error_message'});
 if(state.status==='IN_PROGRESS')return {pending:true,requestId};
 if(state.status!=='FINISHED')throw Error('Threads could not prepare the media. Check your profile before retrying.');
 // Claim once before the externally visible request. Never retry an ambiguous publish.
 const claimed=checked(await db.from('threads_publish_attempts').update({status:'publishing'}).eq('user_id',owner).eq('request_id',requestId).eq('status','processing').select('request_id').maybeSingle());
 if(!claimed)throw Error('Publication is already running. Check your Threads profile.');
 const post=await graph('/'+row.threads_user_id+'/threads_publish',token,{creation_id:attempt.container_id},'POST');
 if(!post.id)throw Error('Threads did not confirm the post. Check your profile.');
 checked(await db.from('threads_publish_attempts').update({status:'published',post_id:String(post.id)}).eq('user_id',owner).eq('request_id',requestId));
 let link;try{link=(await graph('/'+post.id,token,{fields:'permalink'})).permalink;}catch{}
 if(attempt.media_path)await db.storage.from('threads-media').remove([attempt.media_path]);
 return {published:true,postId:String(post.id),url:link};
}

const finishingThreads=new Map<string,Promise<void>>();
async function autoContinue(owner:string,id:string){
 const result=await continuePost(owner,id);
 if(result.pending&&!finishingThreads.has(owner+id)){
  const task=(async()=>{try{for(let n=0;n<12;n++){await new Promise(resolve=>setTimeout(resolve,5000));const next=await continuePost(owner,id);if(!next.pending)return;}}catch(error){console.info('Threads automatic completion stopped; check the existing request status.');}finally{finishingThreads.delete(owner+id);}})();
  finishingThreads.set(owner+id,task);(globalThis as any).EdgeRuntime.waitUntil(task);
 }
 return result;
}

Deno.serve(async request=>{
 const url=new URL(request.url);
 if(url.pathname.endsWith('/threads-callback')){
  const finish=(result:string)=>Response.redirect(appURL+'?threads='+result,303);
  if(request.method!=='GET')return reply({error:'GET required'},405);
  try{
   const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state||! /^[a-f0-9]{64}$/.test(state)||!code||code.length>4096||url.searchParams.has('error'))return finish('error');
   const pending=checked(await db.from('threads_oauth_states').select('user_id').eq('state_hash',await digest(state)).gt('expires_at',new Date().toISOString()).maybeSingle());if(!pending)return finish('error');
   const short=await oauth('/oauth/access_token',{client_id:Deno.env.get('THREADS_CLIENT_ID')||'',client_secret:secret(),grant_type:'authorization_code',redirect_uri:redirect,code},'POST');
   const long=await oauth('/access_token',{grant_type:'th_exchange_token',client_secret:secret(),access_token:short.access_token});
   const profile=await graph('/me',long.access_token,{fields:'id,username'});if(!/^\d+$/.test(String(profile.id)))return finish('error');
   const saved=checked(await db.rpc('finish_threads_connection',{p_hash:await digest(state),p_member:String(profile.id),p_cipher:await encrypt(long.access_token,secret()),p_name:String(profile.username||'Threads'),p_expiry:new Date(Date.now()+Number(long.expires_in)*1000).toISOString()}));return finish(saved?'connected':'error');
  }catch{return finish('error');}
 }
 if(request.method==='OPTIONS')return new Response('ok',{headers});if(request.method!=='POST')return reply({error:'POST required'},405);
 try{
  const bearer=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'',auth=await db.auth.getUser(bearer);if(auth.error||!auth.data.user)return reply({error:'Sign in required'},401);const owner=auth.data.user.id;
  const raw=await request.text();if(raw.length>18*1024*1024)return reply({error:'Media too large'},413);const body=JSON.parse(raw);
  if(body.action==='connect'){
   const clientId=Deno.env.get('THREADS_CLIENT_ID');if(!clientId)throw Error('Threads is not configured.');secret();
   const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
   checked(await db.from('threads_oauth_states').insert({state_hash:await digest(state),user_id:owner,expires_at:new Date(Date.now()+600000).toISOString()}));
   const authURL=new URL('https://threads.net/oauth/authorize');authURL.search=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:THREADS_SCOPES,state}).toString();return reply({url:authURL.href});
  }
  if(body.action==='disconnect'){checked(await db.from('threads_connections').delete().eq('user_id',owner));checked(await db.from('threads_oauth_states').delete().eq('user_id',owner));return reply({connected:false});}
  if(body.action==='status'){
   const row=checked(await db.from('threads_connections').select('threads_user_id,display_name,expires_at').eq('user_id',owner).maybeSingle());
   return reply({connected:!!row&&Date.parse(row.expires_at)>Date.now(),name:row?.display_name,memberId:row?.threads_user_id,expiresAt:row?.expires_at});
  }
  if(body.action==='continue'){if(!uuid(body.requestId))throw Error('Invalid request.');return reply(await autoContinue(owner,body.requestId));}
  if(body.action!=='publish')return reply({error:'Unknown action'},400);
  const input=validateThreadsPost(body),{row,token}=await connection(owner);if(body.memberId!==row.threads_user_id)throw Error('Your Threads account changed. Review again.');
  const payloadHash=await digest(JSON.stringify({caption:input.caption,media:input.media?.data||null,type:input.media?.mimeType||null,member:row.threads_user_id}));
  const claim=await db.from('threads_publish_attempts').insert({user_id:owner,request_id:input.requestId,threads_user_id:row.threads_user_id,payload_hash:payloadHash});
  if(claim.error){if(claim.error.code!=='23505')throw Error('Could not reserve Threads publication.');const prior=checked(await db.from('threads_publish_attempts').select('payload_hash').eq('user_id',owner).eq('request_id',input.requestId).single());if(prior.payload_hash!==payloadHash)throw Error('Publication content changed. Review again.');return reply(await autoContinue(owner,input.requestId));}
  let mediaURL=null,path=null;
  if(input.media){path=owner+'/'+input.requestId+(input.media.mimeType==='video/mp4'?'.mp4':input.media.mimeType==='image/png'?'.png':'.jpg');checked(await db.storage.from('threads-media').upload(path,input.media.bytes,{contentType:input.media.mimeType}));const signed=checked(await db.storage.from('threads-media').createSignedUrl(path,3600));mediaURL=signed.signedUrl;}
  const params:any={text:input.caption,media_type:input.media?input.media.mimeType==='video/mp4'?'VIDEO':'IMAGE':'TEXT'};
  if(mediaURL)params[input.media!.mimeType==='video/mp4'?'video_url':'image_url']=mediaURL;
  const container=await graph('/'+row.threads_user_id+'/threads',token,params,'POST');if(!container.id)throw Error('Threads did not prepare a container.');
  checked(await db.from('threads_publish_attempts').update({container_id:String(container.id),status:'processing',media_path:path}).eq('user_id',owner).eq('request_id',input.requestId));
  return reply(await autoContinue(owner,input.requestId));
 }catch(e){return reply({error:e instanceof Error?e.message:'Threads request failed.'},400);}
});

