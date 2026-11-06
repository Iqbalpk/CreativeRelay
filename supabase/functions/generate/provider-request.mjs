export function busyError(){const error=Error('Gemini is temporarily busy after automatic retries. Your draft is unchanged. Try again shortly, or use the writing template while Gemini recovers.');error.status=503;return error;}
export async function requestGemini(url,options,{fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,random=Math.random}={}){
 const deadline=now()+55000;
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(Math.max(1,Math.min(20000,deadline-now())))});}catch(error){if(['TimeoutError','AbortError'].includes(error?.name))throw busyError();throw error;}
  if(response.status!==503||attempt===2)return response;
  const seconds=Number(response.headers.get('retry-after'));
  const delay=Math.max(1000*2**attempt+Math.floor(random()*500),Number.isFinite(seconds)?Math.min(8000,Math.max(0,seconds*1000)):0);
  if(deadline-now()<delay+1000)return response;
  await response.body?.cancel();await sleep(delay);
 }
}
