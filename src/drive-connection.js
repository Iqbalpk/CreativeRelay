// The server redirects back here without an OAuth code or Google credentials.
const driveReturn=new URL(location.href);
if(window.opener&&driveReturn.searchParams.has('drive')) {
 window.opener.postMessage({type:'creativerelay-drive',status:driveReturn.searchParams.get('drive')},location.origin);
 driveReturn.searchParams.delete('drive');history.replaceState(null,'',driveReturn.href);window.close();
}
export function persistentDrive(cloud,getUser,store) {
 async function request(body) {
  const owner=getUser()?.id;if(!cloud||!owner||owner==='local')throw Error('Sign in to a cloud account to keep Drive connected.');
  const {data,error}=await cloud.functions.invoke('drive',{body});if(owner!==getUser()?.id)throw Error('Your account changed.');
  if(error) { let message='Drive connection could not be restored. Try again when online.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message); }
  if(data?.error)throw Error(data.error);return data;
 }
 store.setTokenProvider(force=>request({action:'token',force:!!force}));
 async function connect() {
  const owner=getUser()?.id;if(!owner||owner==='local')throw Error('Sign in to a cloud account first.');
  const popup=window.open('about:blank','creativerelay-drive','width=540,height=720');if(!popup)throw Error('Allow the Google connection popup, then try again.');
  try {
   const {url}=await request({action:'connect'});if(new URL(url).origin!=='https://accounts.google.com')throw Error('Unexpected Google login address.');
   await new Promise((resolve,reject)=>{let ended=false;const finish=async(message)=>{if(ended)return;ended=true;clearInterval(poll);clearTimeout(timeout);window.removeEventListener('message',listen);try{if(message==='error')throw Error('Google did not complete the connection. Try again.');if(owner!==getUser()?.id)throw Error('Your account changed.');store.disconnect();await store.restore();if(!store.connected)throw Error('Google connection was cancelled or permission was not granted.');resolve();}catch(error){reject(error);}finally{popup.close();}};
    const listen=event=>{if(event.origin===location.origin&&event.source===popup&&event.data?.type==='creativerelay-drive')finish(event.data.status);};
    window.addEventListener('message',listen);const poll=setInterval(()=>{if(popup.closed)finish();},1000);const timeout=setTimeout(()=>finish('error'),180000);popup.location.href=url;
   });
  }catch(error){popup.close();throw error;}
 }
 async function disconnect() {await request({action:'disconnect'});store.disconnect();}
 return {connect,disconnect};
}
