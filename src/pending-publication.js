const isTransportError=error=>/failed to (?:send|fetch)|network|load failed|fetch failed|timed? out/i.test(String(error?.message||''));
// Continue only an existing, reviewed request. This function never creates a
// container, resends artwork, or calls a publish action with a new request ID.
export async function followPending(result,{request,owner,isOwner,onUpdate=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=36}){
 const requestId=result?.requestId;
 if(!result?.pending||!requestId)return result;
 let latest=result;
 onUpdate(latest);
 for(let n=0;n<checks;n++){
  await sleep(5000);
  if(!isOwner(owner))return latest;
  try{latest={...await request({action:'continue',requestId,userId:owner}),requestId};}
  catch(error){latest=isTransportError(error)?{requestId,pending:true,reconnecting:true}:{requestId,error:error.message||'Could not check publication. Check your profile before retrying.',pending:false};}
  if(!isOwner(owner))return latest;
  onUpdate(latest);
  if(!latest.pending)return latest;
 }
 latest={...latest,stalled:true};onUpdate(latest);return latest;
}

// A lost publish response is ambiguous. Recover only the original request;
// never resend its artwork or invent a new publication ID.
export async function recoverPublishResponse(send,{request,requestId,owner,isOwner}){
 try{return await send();}
 catch(error){
  if(!isOwner(owner))throw error;
  if(!isTransportError(error))throw error;
  try{
   const result=await request({action:'continue',requestId,userId:owner});
   if(!isOwner(owner))throw error;
   return {...result,requestId};
  }catch{
   throw Error('Instagram response was lost. Publication is unconfirmed. Use Continue publication in Channels to check this same request before trying again.');
  }
 }
}

// Pending IDs contain no media or credentials. Keep the latest request available
// after iOS closes the app; older session-only requests remain readable.
export function readPendingInstagram(owner){
 const key='creativerelay-instagram-pending:'+owner;
 for(const name of ['localStorage','sessionStorage']){
  try{const id=globalThis[name]?.getItem(key);if(id)return id;}catch{}
 }
 return null;
}
export function rememberPendingInstagram(owner,id){
 for(const name of ['localStorage','sessionStorage']){
  try{globalThis[name]?.setItem('creativerelay-instagram-pending:'+owner,id);}catch{}
 }
}
export function forgetPendingInstagram(owner,id){
 for(const name of ['localStorage','sessionStorage']){
  try{const store=globalThis[name],key='creativerelay-instagram-pending:'+owner;
   if(!id||store?.getItem(key)===id)store?.removeItem(key);
  }catch{}
 }
}

// Upload one destination at a time, but never let processing polls block the
// next upload. Submit Facebook before Instagram's longer container preparation.
export async function runCarouselQueue(posts,{submit,follow,onResult=()=>{},isOwner=()=>true}){
 const order={LinkedIn:0,Facebook:1,Instagram:2};
 const followers=[],results=new Map();
 const report=result=>{if(isOwner()){results.set(result.platform,result);onResult(result);}};
 for(const post of [...posts].sort((a,b)=>(order[a.platform]??9)-(order[b.platform]??9))){
  if(!isOwner())break;
  report({platform:post.platform,sending:true});
  let result;
  try{result={platform:post.platform,...await submit(post)};}
  catch(error){result={platform:post.platform,error:error.message||'Publication was not confirmed.'};}
  report(result);
  if(isOwner()&&result.pending&&post.platform==='Instagram'){
   followers.push((async()=>{
    try{report({platform:post.platform,...await follow(post,result,update=>report({platform:post.platform,...update}))});}
    catch(error){report({platform:post.platform,error:error.message||'Could not check publication.'});}
   })());
  }
 }
 await Promise.all(followers);
 return [...results.values()];
}
