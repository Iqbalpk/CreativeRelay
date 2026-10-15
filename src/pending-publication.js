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
  catch(error){latest={requestId,error:error.message||'Could not check publication. Check your profile before retrying.',pending:false};}
  if(!isOwner(owner))return latest;
  onUpdate(latest);
  if(!latest.pending)return latest;
 }
 latest={...latest,stalled:true};onUpdate(latest);return latest;
}
