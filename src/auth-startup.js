// Supabase auth callbacks run under its session lock. Schedule all application
// work after returning from that callback, and ignore superseded session events.
export function startAuth(auth,{onSession,onSignedOut,onRecovery=()=>{},onError=()=>{},schedule=task=>setTimeout(task,0)}){
 let revision=0,owner=null,disposed=false;
 function queue(event,session){const version=++revision;
  schedule(()=>{
   if(disposed||version!==revision)return;
   try{
    if(event==='PASSWORD_RECOVERY')Promise.resolve(onRecovery()).catch(onError);
    if(session){const changed=owner!==session.user.id;owner=session.user.id;Promise.resolve(onSession(session,changed)).catch(onError);}
    else {owner=null;Promise.resolve(onSignedOut(event)).catch(onError);}
   }catch(error){onError(error);}
  });
 }
 const {data}=auth.onAuthStateChange((event,session)=>{queue(event,session);});
 const initialRevision=revision;
 const ready=auth.getSession().then(({data,error})=>{
  if(disposed||revision!==initialRevision)return;
  if(error)onError(error);queue('INITIAL_SESSION',data?.session||null);
 }).catch(onError);
 return {ready,dispose(){disposed=true;revision++;data?.subscription?.unsubscribe();}};
}
