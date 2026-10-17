import {publicationHistory,mapSlides} from './publication-utils.mjs';


function validateSlides(body) {

 if (body.slides === undefined) return null;

 if (body.media || !Array.isArray(body.slides) || body.slides.length < 2 || body.slides.length > 10) throw Error('Choose 2–10 carousel images.');

 let total=0;

 return body.slides.map(item=>{

  if(item?.mimeType!=='image/jpeg'||typeof item.data!=='string'||item.data.length>1400000||item.data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(item.data))throw Error('Use prepared JPG carousel images, up to 1 MB each.');

  const bytes=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));total+=bytes.length;

  if(bytes.length>1024*1024||total>10*1024*1024||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('Invalid carousel image.');

  return {mimeType:'image/jpeg',data:item.data,bytes};

 });

}

import {createClient} from 'npm:@supabase/supabase-js@2';

const MAX_MEDIA = 12 * 1024 * 1024;

function requestId(value) {

  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw Error('Invalid publish request ID.');

  return value;

}

function validatePost(body) {

  const id = requestId(body.requestId), caption = String(body.caption || '').trim();

  if (!caption || caption.length > 2200) throw Error('Instagram caption must be 1–2,200 characters.');

  const slides=validateSlides(body);if(slides)return {requestId:id,caption,slides,mimeType:'image/jpeg'};

  const {mimeType, data} = body.media || {};

  if (!['image/jpeg', 'video/mp4'].includes(mimeType)) throw Error('Attach a JPG image or MP4 video. Instagram cannot publish text alone.');

  if (typeof data !== 'string' || !data.length || data.length > Math.ceil(MAX_MEDIA / 3) * 4 || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw Error('Publishing media must be under 12 MB.');

  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));

  if (bytes.length > MAX_MEDIA) throw Error('Publishing media must be under 12 MB.');

  if (mimeType === 'image/jpeg' && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) throw Error('Invalid JPG image.');

  if (mimeType === 'video/mp4' && String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') throw Error('Invalid MP4 video.');

  return {requestId:id, caption, mimeType, bytes};

}

function containerParams(input, signedURL) {

  return input.mimeType === 'video/mp4'

    ? {media_type:'REELS', video_url:signedURL, caption:input.caption, share_to_feed:'true'}

    : {image_url:signedURL, caption:input.caption};

}

function containerDecision(status) {

  if (status === 'FINISHED') return 'publish';

  if (status === 'IN_PROGRESS') return 'wait';

  if (status === 'PUBLISHED') return 'already-published';

  throw Error('Instagram could not process this media (' + String(status || 'unknown') + '). Check its format and reconnect if needed.');

}

const toBase64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));

const fromBase64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }

async function key(secret) {

  if (!secret) throw Error('Instagram server secret is missing.');

  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode('CreativeRelay Instagram tokens:' + secret)), {name:'AES-GCM'}, false, ['encrypt','decrypt']);

}

async function encrypt(token, secret) { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await key(secret), new TextEncoder().encode(token)); return toBase64(iv) + '.' + toBase64(new Uint8Array(data)); }

async function decrypt(cipher, secret) { const [iv, data] = cipher.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:fromBase64(iv)}, await key(secret), fromBase64(data))); }

async function graph(path, token, params = {}, method = 'GET') {

  if (!/^\/(?:me|[0-9]+)(?:\/(?:media|media_publish))?$/.test(path)) throw Error('Invalid Instagram API path.');

  const endpoint = new URL('https://graph.instagram.com/v24.0' + path);

  const options = {method, headers:{Authorization:'Bearer ' + token}, redirect:'error', signal:AbortSignal.timeout(30000)};

  if (method === 'GET') endpoint.search = new URLSearchParams(params).toString();

  else { options.headers['Content-Type'] = 'application/x-www-form-urlencoded'; options.body = new URLSearchParams(params); }

  const response = await fetch(endpoint, options), data = await response.json();

  if (!response.ok || data.error) {

    if (data.error?.code === 190) throw Error('Instagram authorization expired. Reconnect in Channels.');

    // Return the numeric code, never echo provider text that could contain credentials or signed URLs.

    throw Error('Instagram rejected the request (HTTP ' + response.status + ', code ' + (data.error?.code || 'unknown') + '). Check permissions and media specifications.');

  }

  return data;

}



const headers = {'Access-Control-Allow-Origin':Deno.env.get('APP_ORIGIN') || 'https://iqbalpk.github.io','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};

const reply = (data:unknown, status=200) => new Response(JSON.stringify(data), {status,headers});

const bucket = 'instagram-publishing';

const attemptFilter = (query:any, userId:string, id:string) => query.eq('user_id',userId).eq('request_id',id);

async function removeMedia(db:any, userId:string, id:string) {

  await db.storage.from(bucket).remove([`${userId}/${id}.jpg`,`${userId}/${id}.mp4`,...Array.from({length:10},(_,i)=>`${userId}/${id}-${i}.jpg`)]);

}

async function advance(db:any, connection:any, userId:string, id:string) {

  const {data:attempt,error} = await attemptFilter(db.from('instagram_publish_attempts').select('*'),userId,id).single();

  if (error || !attempt) throw Error('Publishing attempt was not found.');

  if (attempt.status === 'published') return {published:true,postId:attempt.post_id,url:'https://www.instagram.com/' + encodeURIComponent(connection.username) + '/'};

  if (['publishing','unconfirmed'].includes(attempt.status)) throw Error('Publication is unconfirmed. Check your Instagram profile before creating another post.');

  if (attempt.status === 'failed') throw Error('This attempt failed. Select corrected media or edit the caption before trying a new post.');

  if (!attempt.container_id) {
    if(attempt.status==='preparing'&&Date.now()-Date.parse(attempt.created_at)>300000)throw Error('Artwork preparation stopped before a publishable container was saved. This request cannot continue. Review the artwork before starting a new post.');
    return {pending:true,requestId:id};
  }

  const token = await decrypt(connection.token_cipher,Deno.env.get('INSTAGRAM_CLIENT_SECRET'));

  const container = await graph('/' + attempt.container_id,token,{fields:'status_code'});

  let decision;

  try { decision = containerDecision(container.status_code); }

  catch (e) { await attemptFilter(db.from('instagram_publish_attempts').update({status:'failed'}),userId,id); await removeMedia(db,userId,id); throw e; }

  if (decision === 'wait') return {pending:true,requestId:id};

  if (decision === 'already-published') {

    await attemptFilter(db.from('instagram_publish_attempts').update({status:'published'}),userId,id);

    await removeMedia(db,userId,id);

    return {published:true,url:'https://www.instagram.com/' + encodeURIComponent(connection.username) + '/'};

  }

  // Only one request can claim a processed container. Never retry the external publishing POST.

  const {data:claimed,error:claimError} = await attemptFilter(db.from('instagram_publish_attempts').update({status:'publishing'}),userId,id).eq('status','processing').select('request_id');

  if (claimError) throw Error('Could not reserve publication. Try checking status again.');

  if (claimed?.length !== 1) return {pending:true,requestId:id};

  try {

    const published = await graph('/' + connection.instagram_id + '/media_publish',token,{creation_id:attempt.container_id},'POST');

    if (!/^\d+$/.test(String(published.id || ''))) throw Error('Publication is unconfirmed. Check your Instagram profile.');

    const {error:saveError} = await attemptFilter(db.from('instagram_publish_attempts').update({status:'published',post_id:String(published.id)}),userId,id);

    if (saveError) throw Error('Post may be published but its status could not be saved. Check your Instagram profile.');

    await removeMedia(db,userId,id);

    let permalink = 'https://www.instagram.com/' + encodeURIComponent(connection.username) + '/';

    try { const result = await graph('/' + published.id,token,{fields:'permalink'}); const target = new URL(result.permalink); if (target.origin === 'https://www.instagram.com') permalink = target.href; } catch {}

    return {published:true,postId:String(published.id),url:permalink};

  } catch(e) { await attemptFilter(db.from('instagram_publish_attempts').update({status:'unconfirmed'}),userId,id); throw e; }

}

// Gateway legacy JWT verification must be off; every POST verifies the user here.


const finishingInstagram=new Map<string,Promise<void>>();
async function autoAdvance(db:any,connection:any,owner:string,id:string){
 const result=await advance(db,connection,owner,id);
 if(result.pending&&!finishingInstagram.has(owner+id)){
  const task=(async()=>{try{for(let n=0;n<12;n++){await new Promise(resolve=>setTimeout(resolve,5000));const next=await advance(db,connection,owner,id);if(!next.pending)return;}}catch(error){console.info('Instagram automatic completion stopped; check the existing request status.');}finally{finishingInstagram.delete(owner+id);}})();
  finishingInstagram.set(owner+id,task);(globalThis as any).EdgeRuntime.waitUntil(task);
 }
 return result;
}

Deno.serve(async req => {

  if (req.method === 'OPTIONS') return new Response('ok',{headers});

  if (req.method !== 'POST') return reply({error:'POST required'},405);

  try {

    const auth = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!);

    const {data:{user},error} = await auth.auth.getUser(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'') || '');

    if (error || !user) return reply({error:'Sign in required'},401);

    const raw = await req.text(); if (raw.length > 18*1024*1024) return reply({error:'Media too large'},413);

    const body = JSON.parse(raw), db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (body.action === 'connect') {

      const clientId = Deno.env.get('INSTAGRAM_CLIENT_ID'), redirect = Deno.env.get('INSTAGRAM_REDIRECT_URI');

      if (!clientId || !redirect || !Deno.env.get('INSTAGRAM_CLIENT_SECRET')) throw Error('Instagram server secrets are missing.');

      const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');

      await db.from('instagram_oauth_states').delete().lt('expires_at',new Date().toISOString());

      const {error} = await db.from('instagram_oauth_states').insert({state_hash:await hash(state),user_id:user.id,expires_at:new Date(Date.now()+600000).toISOString()});

      if (error) throw Error('Apply instagram.sql before connecting.');

      const endpoint = new URL('https://www.instagram.com/oauth/authorize');

      endpoint.search = new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'instagram_business_basic,instagram_business_content_publish',state,enable_fb_login:'0',force_authentication:'1'}).toString();

      return reply({url:endpoint.href});

    }

    if (body.action === 'disconnect') { const {error} = await db.from('instagram_connections').delete().eq('user_id',user.id); if(error) throw Error('Could not disconnect.'); return reply({connected:false}); }

    const {data:connection,error:connectionError} = await db.from('instagram_connections').select('*').eq('user_id',user.id).maybeSingle();

    if (connectionError) throw Error('Apply instagram.sql before connecting.');

    const connected = !!connection && Date.parse(connection.expires_at)>Date.now();

    if (body.action === 'status') return reply({connected,name:connected?connection.username:null,expiresAt:connection?.expires_at});

    if(body.action==='history'){if(body.userId!==user.id)return reply({error:'Your account changed.'},401);return reply(await publicationHistory(db,user.id,'Instagram',connection?.username));}

    if (!['publish','continue'].includes(body.action)) return reply({error:'Unknown action'},400);

    if (body.userId !== user.id) return reply({error:'Your account changed. Review the post again.'},401);

    if (!connected) return reply({error:'Connect your Instagram account in Channels first.'},401);

    if (body.action === 'continue') return reply(await autoAdvance(db,connection,user.id,requestId(body.requestId)));

    const input = validatePost(body);

    const {error:claimError} = await db.from('instagram_publish_attempts').insert({user_id:user.id,request_id:input.requestId,status:'preparing'});

    if (claimError) { if(claimError.code !== '23505') throw Error('Could not reserve publishing request.'); return reply(await autoAdvance(db,connection,user.id,input.requestId)); }

    const prepare=async()=>{
    try {

      // Bucket is private and has no browser policies. Only this authenticated handler writes to it.

      const {data:existing,error:bucketError} = await db.storage.getBucket(bucket);

      if (!existing) { if(bucketError && !String(bucketError.message).toLowerCase().includes('not found')) throw Error('Could not check publishing storage.'); const {error} = await db.storage.createBucket(bucket,{public:false,fileSizeLimit:12*1024*1024,allowedMimeTypes:['image/jpeg','video/mp4']}); if(error && !String(error.message).toLowerCase().includes('already exists')) throw Error('Could not create private publishing storage.'); }

      if (existing?.public) throw Error('Set the instagram-publishing bucket to private before publishing.');

      const token = await decrypt(connection.token_cipher,Deno.env.get('INSTAGRAM_CLIENT_SECRET'));

      async function uploadImage(bytes,mimeType,path){

       const {error}=await db.storage.from(bucket).upload(path,bytes,{contentType:mimeType,upsert:false});if(error)throw Error('Could not prepare carousel storage.');

       const {data,error:linkError}=await db.storage.from(bucket).createSignedUrl(path,3600);if(linkError||!data)throw Error('Could not prepare temporary media link.');return data.signedUrl;

      }

      let container;

      if(input.slides){

       const children=await mapSlides(input.slides,async(slide,i)=>{
        const url=await uploadImage(slide.bytes,'image/jpeg',`${user.id}/${input.requestId}-${i}.jpg`);
        const child=await graph('/'+connection.instagram_id+'/media',token,{image_url:url,is_carousel_item:'true'},'POST');
        if(!/^\d+$/.test(String(child.id||'')))throw Error('Instagram could not prepare a carousel slide.');
        return String(child.id);
       });

       container=await graph('/'+connection.instagram_id+'/media',token,{media_type:'CAROUSEL',children:children.join(','),caption:input.caption},'POST');

      }else{

       const path=`${user.id}/${input.requestId}.${input.mimeType==='video/mp4'?'mp4':'jpg'}`;

       const url=await uploadImage(input.bytes,input.mimeType,path);

       container=await graph('/'+connection.instagram_id+'/media',token,containerParams(input,url),'POST');

      }

      if (!/^\d+$/.test(String(container.id || ''))) throw Error('Instagram did not return a media container.');

      const {error:saveError} = await attemptFilter(db.from('instagram_publish_attempts').update({status:'processing',container_id:String(container.id)}),user.id,input.requestId);

      if (saveError) throw Error('Could not save media processing status.');

    } catch(e) { await attemptFilter(db.from('instagram_publish_attempts').update({status:'failed'}),user.id,input.requestId); await removeMedia(db,user.id,input.requestId); throw e; }

    return await autoAdvance(db,connection,user.id,input.requestId);
    };
    if((globalThis as any).EdgeRuntime?.waitUntil){
     const task=prepare().catch(()=>console.info('Instagram preparation stopped; check this existing request.'));
     (globalThis as any).EdgeRuntime.waitUntil(task);
     return reply({pending:true,requestId:input.requestId,stage:'preparing'},202);
    }
    return reply(await prepare());

  } catch(e) { return reply({error:e instanceof Error?e.message:'Instagram request failed'},400); }

});


