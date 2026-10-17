export function mountPublicationHistory({root,owner,getOwner,requests,follow,escape:esc}){
 const panel=document.createElement('section');panel.className='card';panel.dataset.publicationHistory='';panel.style.marginTop='22px';
 panel.innerHTML='<h2>Recent publishing results</h2><p class="muted">Check the server result after a lost connection or reopening the app. Latest five attempts per channel.</p><button class="secondary" data-refresh>Refresh results</button><div data-results role="status" aria-live="polite"></div>';
 root.append(panel);const output=panel.querySelector('[data-results]'),button=panel.querySelector('button');let generation=0;
 const alive=()=>panel.isConnected&&getOwner()===owner;
 const link=(platform,value)=>{try{return new URL(value).origin===(platform==='Instagram'?'https://www.instagram.com':'https://www.facebook.com');}catch{return false;}};
 async function load(){const run=++generation;button.disabled=true;output.textContent='Checking recent publications…';
  const platforms=Object.keys(requests),results=await Promise.allSettled(platforms.map(platform=>requests[platform]({action:'history',userId:owner})));
  if(!alive()||run!==generation)return;
  output.innerHTML=results.map((result,index)=>{
   const platform=platforms[index];if(result.status==='rejected')return '<p><strong>'+esc(platform)+'</strong>: Could not check recent results. Refresh to try again.</p>';
   const attempts=result.value.attempts||[];
   return '<h3>'+esc(platform)+'</h3>'+(attempts.length?attempts.map((row,i)=>{
    const state=row.status==='published'?'Published':row.status==='failed'?'Failed':row.status==='unconfirmed'||row.status==='publishing'?'Unconfirmed — check your profile before reposting':row.status==='preparing'?'Preparing artwork':'Processing';
    const canContinue=platform==='Instagram'&&i===0&&['processing','preparing'].includes(row.status)&&Date.now()-Date.parse(row.createdAt)<86400000&&/^[a-f0-9-]{36}$/i.test(row.requestId);
    return '<p><strong>'+esc(state)+'</strong> · '+esc(new Date(row.createdAt).toLocaleString())+(row.status==='published'&&row.url&&link(platform,row.url)?' · <a target="_blank" rel="noopener" href="'+esc(row.url)+'">'+(platform==='Instagram'?'View profile':'View post')+'</a>':'')+(canContinue?' <button class="secondary" data-continue="'+esc(row.requestId)+'">Continue this publication</button>':'')+'</p>';
   }).join(''):'<p>No publishing attempts yet.</p>');
  }).join('');button.disabled=false;
  output.querySelectorAll('[data-continue]').forEach(control=>control.onclick=async()=>{
   const requestId=control.dataset.continue;if(!alive())return;control.disabled=true;
   try{const result=await requests.Instagram({action:'continue',userId:owner,requestId});if(!alive())return;
    const next=await follow('Instagram',{...result,requestId},owner,()=>{if(alive())control.textContent='Checking this upload…';});
    if(!alive())return;if(next.error)control.textContent=next.error;else if(next.pending)control.textContent='Still processing — refresh results';else await load();
   }catch(error){if(alive())control.textContent=error.message||'Could not check this publication.';}
   finally{if(alive()&&control.isConnected)control.disabled=false;}
  });
 }
 button.onclick=load;void load();
 return panel;
}
