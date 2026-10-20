import {mountCaptionRefinement} from './caption-refinement.js';
import {captionTargets,generatedChanges} from './caption-generation.js';
import {startAuth} from './auth-startup.js';
import {mountPublicationHistory} from './publication-history.js';
import {mountBlogManager} from './blog-manager.js';
import {followPending,recoverPublishResponse,readPendingInstagram,rememberPendingInstagram,forgetPendingInstagram,runCarouselQueue} from './pending-publication.js';
import {isVideoFile,preparedVideoNote} from './video-policy.js';
import {articlePageURL} from './blog-route.js';
import {uploadKind,composerPlatforms,artworkSlot,acceptsUpload} from './upload-flow.js';
import {mountCarousel,slideSource,instagramSlides,carouselAnalysisFile} from './carousel.js';
import {originalGeometry} from './image-fit.js';
import './carousel.css';
import {blogShareText,assertBlogPostFits} from './blog-share.js';

import {fitCaption,captionLimits} from './caption-fit.js';

import './style.css';

// Submit each reviewed destination once. One failure must not conceal another success.

async function runPublications(posts, publish, onResult = () => {}) {

  return Promise.all(posts.map(async post => {

    let result;
    const publishingOwner=user?.id;

    try {

      const response = await publish(post);

      result = {platform:post.platform, ...response};

    } catch (error) {

      result = {platform:post.platform, error:error instanceof Error ? error.message : 'Publishing failed'};

    }

    onResult(result);
    if(result.pending&&['Instagram','Threads'].includes(post.platform)){
      const id=publishingOwner;
      const next=await followMetaPublication(post.platform,result,id,update=>onResult({platform:post.platform,...update}));
      result={platform:post.platform,...next};
    }
    return result;

  }));

}





import {createClient} from '@supabase/supabase-js';

import {marked} from 'marked';

import DOMPurify from 'dompurify';

import {DriveStore} from './drive.js';
import {persistentDrive} from './drive-connection.js';
import {browserRecovery} from './editor-recovery.js';

const drive=new DriveStore();

const googleClientId=import.meta.env.VITE_GOOGLE_CLIENT_ID;



let storage=localStorage.getItem('one-storage')||'drive';

const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;

const cloud=url&&key?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;





let appTheme=localStorage.getItem('creativerelay-theme')==='dark'?'dark':'light';

function applyTheme(){document.documentElement.dataset.theme=appTheme;document.documentElement.style.colorScheme=appTheme;document.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.textContent=appTheme==='dark'?'Light mode':'Dark mode';button.setAttribute('aria-pressed',String(appTheme==='dark'));});}

function themeToggleHTML(){return `<button type="button" data-theme-toggle class="secondary theme-toggle" aria-label="Switch dark or light theme" aria-pressed="${appTheme==='dark'}">${appTheme==='dark'?'Light mode':'Dark mode'}</button>`;}

applyTheme();document.addEventListener('click',event=>{if(event.target.closest('[data-theme-toggle]')){appTheme=appTheme==='dark'?'light':'dark';localStorage.setItem('creativerelay-theme',appTheme);applyTheme();}});



const platforms=['LinkedIn','Instagram','Facebook','Threads','Blog'];

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let videoPreparation=null;
let user=null,view='Create',tab='LinkedIn',media=null,thumb=null,mediaURL='',thumbURL='',md='',drafts=[],current={title:'',facts:'',selected:['LinkedIn','Instagram'],captions:{},mode:'Work'},installEvent;

const driveConnection=persistentDrive(cloud,()=>user,drive);
let restoredEditorFor=null,editorRestore=null,recoveryWarning=false;
const editorRecovery=browserRecovery(()=>{if(!recoveryWarning){recoveryWarning=true;toast('Automatic recovery could not save on this device. Save or export your draft before closing.');}});
function rememberEditor(){if(user?.id===restoredEditorFor)editorRecovery.save(user.id,{current:{...current,markdown:md},md,tab,media:media instanceof Blob?media:null,thumb:thumb instanceof Blob?thumb:null});}
async function restoreEditor(){const id=user?.id;if(!id||restoredEditorFor===id)return;if(editorRestore?.id===id)return editorRestore.promise;const promise=(async()=>{let saved;try{saved=await editorRecovery.restore(id);}catch{toast('Could not read automatic draft recovery on this device.');}if(user?.id!==id)return;revoke();media=thumb=null;md='';current={title:'',facts:'',selected:['LinkedIn','Instagram'],captions:{},mode:'Work'};if(saved?.current&&saved.current.captions&&Array.isArray(saved.current.selected)){current=saved.current;md=saved.md||saved.current.markdown||'';tab=platforms.includes(saved.tab)?saved.tab:'LinkedIn';media=saved.media||null;thumb=saved.thumb||null;if(media)mediaURL=URL.createObjectURL(media);if(thumb)thumbURL=URL.createObjectURL(thumb);}restoredEditorFor=id;})();editorRestore={id,promise};try{await promise;}finally{if(editorRestore?.promise===promise)editorRestore=null;}}
document.addEventListener('input',event=>{if(event.target.closest('.composer-grid'))capture();});
window.addEventListener('pagehide',()=>{if(user){capture();editorRecovery.flush();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&user){capture();editorRecovery.flush();}});
const dbp=new Promise((res,rej)=>{let r=indexedDB.open('one-station',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});

async function local(action,value){let db=await dbp;return new Promise((res,rej)=>{let tx=db.transaction('drafts',action==='getAll'?'readonly':'readwrite'),r=tx.objectStore('drafts')[action](value);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}

function toast(s){document.querySelector('.toast')?.remove();let e=document.createElement('div');e.className='toast';e.textContent=s;document.body.append(e);setTimeout(()=>e.remove(),6000);}

function revoke(){videoPreparation?.controller.abort();videoPreparation=null;if(mediaURL)URL.revokeObjectURL(mediaURL);if(thumbURL)URL.revokeObjectURL(thumbURL);mediaURL=thumbURL='';}

function selectedArtworkSlot(){return artworkSlot(current,media?.type||current.mediaType||'',!!(media||current.driveMediaId||current.mediaPath),!!(thumb||thumbURL||current.driveThumbId||current.thumbPath));}
function mediaHTML(){const slot=selectedArtworkSlot(),source=slot==='thumb'?thumbURL:slot==='media'?mediaURL:'';if(!source)return '<span class="muted">Your selected artwork appears here</span>';return uploadKind(current,media?.type||current.mediaType||'')==='Video'?`<video controls src="${esc(source)}" ${thumbURL?`poster="${esc(thumbURL)}"`:''}></video>`:`<img src="${esc(source)}" alt="${current.mode==='Blog'?'Blog cover':'Uploaded photo'}">`;}


const iconPaths={Create:'M12 5v14M5 12h14',Library:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',Channels:'M8 12h8M14 8l4 4-4 4M6 5H3v14h3M18 5h3v14h-3',Settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4'};

function navIcon(name){return `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]}"></path></svg>`;}

function avatarHTML(){return `<span class="avatar avatar-placeholder" aria-label="Profile initials">${esc((user?.email||'U').slice(0,1).toUpperCase())}</span>`;}

function auth(){cleanupBlogManager();cleanupBlogManager=()=>{};document.querySelector('#app').innerHTML=`<main class="auth"><section class="auth-art"><div class="logo"><img class="brand-mark" src="./icon.svg" alt=""><span>creative<b>relay.</b></span></div><p class="eyebrow">YOUR WORK. MORE PLACES.</p><h1>Create once.<br>Share your<br><em>creative world.</em></h1><p>Images, motion work and stories.<br>One calm space to prepare your next post.</p></section><section class="auth-form">${themeToggleHTML()}<h1>Welcome to your studio</h1><p class="muted">Sign in to keep your drafts together.</p>${cloud?`<form id="login"><label>Email</label><input name="email" type="email" autocomplete="email" required><label>Password</label><input name="password" type="password" autocomplete="current-password" minlength="8" required><button>Sign in</button><button type="button" class="secondary" id="signup">Create account</button></form><button class="secondary" id="reset">Reset password</button>`:`<div class="notice">Cloud accounts are not configured yet. Local studio stores drafts on this device only; it is not a secure user account.</div>`}<button class="secondary" id="local">Open local studio</button><p class="muted">Cloud sessions stay signed in until you sign out or the session expires.</p></section></main>`;

document.querySelector('#local').onclick=()=>{user={id:'local',email:'Local studio'};sessionStorage.setItem('one-local','yes');load();};

if(cloud){document.querySelector('#login').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let {error}=await cloud.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)toast(error.message);};document.querySelector('#signup').onclick=async()=>{let f=new FormData(document.querySelector('#login'));if(!document.querySelector('#login').reportValidity())return;let {error}=await cloud.auth.signUp({email:f.get('email'),password:f.get('password'),options:{emailRedirectTo:location.href.split('#')[0]}});toast(error?error.message:'Check your email to confirm your account.');};document.querySelector('#reset').onclick=async()=>{let email=document.querySelector('[name=email]').value;if(!email)return toast('Enter your email first.');let {error}=await cloud.auth.resetPasswordForEmail(email,{redirectTo:location.href.split('#')[0]});toast(error?error.message:'Password reset email sent.');};}}

let workspaceLoad=0,libraryLoading=false;
async function load(){
 const owner=user?.id;if(!owner)return;const run=++workspaceLoad;
 drive.setOwner(owner);await restoreEditor();if(user?.id!==owner||run!==workspaceLoad)return;
 // Restore private local text first, then show the studio without waiting for Drive.
 libraryLoading=view==='Library';render();
 if(view!=='Library'){void restoreDriveArtwork(owner,current);return;}
 try{
  let items;
  if(storage==='drive'&&owner!=='local'){await drive.restore();items=drive.connected?await drive.listDrafts():[];}
  else if(storage==='local'||owner==='local')items=await local('getAll');
  else{const {data,error}=await cloud.from('drafts').select('*').order('created_at',{ascending:false});if(error)throw error;items=data.map(d=>({...d.payload,id:d.id,title:d.title,created_at:d.created_at}));}
  if(user?.id!==owner||run!==workspaceLoad)return;drafts=items;
 }catch(error){if(user?.id===owner&&run===workspaceLoad)toast(error.message);}
 finally{if(user?.id===owner&&run===workspaceLoad){libraryLoading=false;if(view==='Library')library();}}
}
async function restoreDriveArtwork(owner,draft){
 if(owner==='local')return;
 try{
  await drive.restore();if(user?.id!==owner||current!==draft||!drive.connected)return;
  const mediaId=draft.driveMediaId,thumbId=draft.driveThumbId;
  if(!media&&mediaId){const artwork=await drive.readAsset(mediaId);
   if(user?.id!==owner||current!==draft||current.driveMediaId!==mediaId||media)return;
   media=new File([artwork],draft.mediaName||'artwork',{type:draft.mediaType||artwork.type});mediaURL=URL.createObjectURL(media);
   if(view==='Create'){capture();composer();}
  }
  if(!thumb&&thumbId){const cover=await drive.readAsset(thumbId);
   if(user?.id!==owner||current!==draft||current.driveThumbId!==thumbId||thumb)return;
   thumb=cover;thumbURL=URL.createObjectURL(thumb);if(view==='Create'){capture();composer();}
  }
 }catch{if(user?.id===owner&&current===draft&&view==='Create'&&(draft.driveMediaId||draft.driveThumbId))toast('Your draft is restored. Connect Drive in Settings to load its saved artwork.');}
}

let cleanupBlogManager=()=>{};
function render(){cleanupBlogManager();cleanupBlogManager=()=>{};document.querySelector('#app').innerHTML=`<div class="layout"><aside class="sidebar"><div class="logo"><img class="brand-mark" src="./icon.svg" alt=""><span>creative<b>relay.</b></span></div><div class="workspace-label">WORKSPACE</div><nav>${['Create','Library','Blogs','Channels','Settings'].map(v=>`<button data-nav="${v}" class="${view===v?'active':''}">${navIcon(v==='Blogs'?'Library':v)}<span>${{Create:'Create post',Library:'Your library',Blogs:'My blogs',Channels:'Channels',Settings:'Settings'}[v]}</span></button>`).join('')}</nav><div class="bottom"><div class="sidebar-note"><span class="live-dot"></span> Your creative workspace<p>Make good work<br>impossible to miss.</p></div><div class="profile-account">${avatarHTML()}<small>${esc(user.email)}</small></div><button id="logout">Sign out</button></div></aside><main class="main"><header class="top"><div><div class="eyebrow"><span class="live-dot"></span> CREATIVE WORKSPACE</div><h1>${view==='Create'?'Create something worth sharing.':view==='Library'?'Your library.':view==='Blogs'?'My blogs.':view==='Channels'?'Your publishing channels.':'Your studio settings.'}</h1><span class="muted">${view==='Create'?'Bring your work, words and destinations together.':'Your creative workflow, thoughtfully organised.'}</span></div>${themeToggleHTML()}<button id="newdraft" class="secondary">New draft</button><span class="badge">${user.id==='local'?'Local studio':'Cloud account'}</span></header><div id="content"></div></main></div>`;

document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{capture();view=b.dataset.nav;if(view==='Library')load();else render();});document.querySelector('#logout').onclick=async()=>{capture();await editorRecovery.flush();restoredEditorFor=null;if(cloud&&user.id!=='local')await cloud.auth.signOut();sessionStorage.removeItem('one-local');user=null;linkedinAccount={connected:false};linkedinAccountFor='';instagramAccount={connected:false};instagramAccountFor='';drive.disconnect();revoke();media=thumb=null;md='';drafts=[];current={title:'',facts:'',selected:['LinkedIn','Instagram'],captions:{},mode:'Work'};auth();};

document.querySelector('#newdraft').onclick=()=>{revoke();media=thumb=null;md='';current={title:'',facts:'',selected:['LinkedIn','Instagram'],captions:{},mode:'Work'};view='Create';render();};if(view==='Create')composer();if(view==='Library')library();if(view==='Blogs'){if(!cloud||user?.id==='local')document.querySelector('#content').innerHTML='<div class="notice">Sign in to your cloud account to manage your published blogs. Local drafts stay in Your library.</div>';else cleanupBlogManager=mountBlogManager({root:document.querySelector('#content'),request:blogRequest,getOwner:()=>user?.id,toast,escape:esc});}if(view==='Channels')channels();if(view==='Settings')settings();}

function capture(){let t=document.querySelector('#title'),f=document.querySelector('#facts'),c=document.querySelector('#caption');if(t)current.title=t.value;if(f)current.facts=f.value;if(c&&tab!=='Blog')current.captions[tab]=c.value;let pt=document.querySelector('#platform-title');if(pt){current.titles||={};current.titles[tab]=pt.value;}let article=document.querySelector('#mdtext');if(article)md=article.value;const archive=document.querySelector('#blog-archive');if(archive)current.includeBlogLink=archive.checked;rememberEditor();}

function composer(){const kind=uploadKind(current,media?.type||current.mediaType||'');if(kind==='Carousel'){current.mode='Carousel';current.postFormat='Carousel';}const choices=composerPlatforms(kind);current.selected=current.selected.filter(platform=>choices.includes(platform));if(!choices.includes(tab))tab=choices[0];prepareBlogCaption();rememberEditor();document.querySelector('#content').innerHTML=`<div class="workflow-bar"><span class="workflow-current">01 &nbsp; Add your work</span><span>02 &nbsp; Generate your story</span><span>03 &nbsp; Review & save</span><span class="workflow-state">Draft workspace</span></div><div class="grid composer-grid"><section><div class="card"><div class="row between"><h2><span class="step-number">01</span> Your creative work</h2><select id="mode" aria-label="Content type" style="width:auto">${['Work','Blog','Carousel'].map(mode=>`<option ${current.mode===mode?'selected':''}>${mode}</option>`).join('')}</select></div>${current.mode==='Work'?`<label>Work format<select id="work-type" aria-label="Work format"><option ${kind==='Photo'?'selected':''}>Photo</option><option ${kind==='Video'?'selected':''}>Video</option></select></label>`:''}<div class="drop" ${kind==='Carousel'?'hidden':''}><strong>${kind==='Blog'?'Blog cover image':kind==='Video'?'Upload your video':'Upload your photo'}</strong><span class="muted">${kind==='Video'?'MOV or MP4 Â· select up to 500 MB. Prepared on this device as an MP4 upload copy, up to 1080p / 30 fps and 12 MB. Long videos may exceed this publishing limit.':'Image Â· '+(storage==='drive'?'up to 500 MB':'up to 50 MB')}</span><input id="media" aria-label="${kind==='Blog'?'Upload blog cover':kind==='Video'?'Upload video':'Upload photo'}" type="file" accept="${kind==='Video'?'video/*,.mov,.MOV,.mp4,.m4v':'image/*'}"></div><p class="muted" id="filename" ${kind==='Carousel'?'hidden':''}>${esc(selectedArtworkSlot()==='thumb'?(thumb?.name||current.thumbName||'Saved blog cover'):selectedArtworkSlot()==='media'?(media?.name||current.mediaName||'Saved artwork'):'No '+(kind==='Blog'?'cover image':kind==='Video'?'video':'photo')+' selected')}</p>${kind==='Blog'?`<label for="mdtext">Article text</label><textarea id="mdtext" placeholder="Paste your full article here">${esc(md)}</textarea><details><summary>Import a Markdown file (optional)</summary><input id="mdfile" aria-label="Import Markdown article" type="file" accept=".md,.markdown,text/markdown"></details>`:''}${kind==='Video'?`<label for="thumb">Video cover (optional)</label><input id="thumb" type="file" accept="image/*"><p class="muted">${esc(thumb?.name||current.thumbName||(thumbURL?'Saved video cover':''))} Â· Shown in your studio video preview. Social platforms may choose their own cover.</p>`:''}<p id="video-preparation" class="notice" role="status" aria-live="polite" hidden></p><button id="cancel-video-preparation" type="button" class="secondary" hidden>Cancel video preparation</button><label>Project heading</label><input id="title" placeholder="e.g. A fresh identity for a fitness brand" value="${esc(current.title)}"><label>Project facts</label><textarea id="facts" placeholder="Brand, your role, tools, purpose and verified results. AI uses these facts.">${esc(current.facts)}</textarea></div><div class="card"><h2><span class="step-number">02</span> Prepare for each channel</h2><div>${choices.map(p=>`<label class="chip"><input type="checkbox" data-channel="${p}" ${current.selected.includes(p)?'checked':''}>${p}</label>`).join('')}</div><p class="muted">Choose destinations. Gemini refreshes the checked channels and the preview tab you are viewing.</p><p class="muted">Write with Gemini using your project facts, or analyse your media for a closer match. ${kind==='Carousel'?'Carousel analysis sends a numbered overview of all slides.':'Media analysis is optional, up to 12 MB.'} Uses API quota.</p><div class="row ai-actions"><button id="generate">Generate captions with Gemini</button><button id="analyse" class="secondary">${kind==='Carousel'?'Analyse carousel + captions':'Analyse media + captions'}</button><button id="template" class="secondary">Use writing template</button></div></div></section><section><div class="card"><div class="row between"><h2><span class="step-number">03</span> Preview & refine</h2><span class="preview-label">LIVE PREVIEW</span></div><div class="tabs">${choices.map(p=>`<button data-tab="${p}" class="${tab===p?'active':''}">${p}</button>`).join('')}</div><div class="preview">${mediaHTML()}</div><div class="row between"><strong>${esc(current.title||'Your project title')}</strong><span class="draft-tag">Draft</span></div><p class="muted">${(current.keywords||[]).map(k=>esc(k)).join(' Â· ')}</p><label>${tab} title</label><input id="platform-title" value="${esc(current.titles?.[tab]||current.title)}"><div class="${tab==='Blog'?'hidden':''}"><label>${tab} caption</label><textarea id="caption" style="min-height:190px" placeholder="Generate or write your captionâ€¦">${esc(fitCaption(current.captions[tab]||'',tab).text)}</textarea><p id="caption-count" class="muted"></p><button type="button" id="shorten-caption" class="secondary">Shorten to platform limit</button></div><div id="caption-refinement"></div>${tab==='Blog'?'<p class="muted">Share the full article and cover to LinkedIn and Facebook. The complete LinkedIn post must fit 3,000 characters.</p>':''}${current.mode==='Blog'?`<div class="markdown">${DOMPurify.sanitize(marked.parse(md))}</div>`:''}<p class="muted">Full artwork preview. Check each platform s crop before publishing.</p><div class="row draft-actions"><button id="save">Save draft</button><button id="export" class="secondary">Export post pack</button></div><div class="row publishing-actions" style="margin-top:16px"><button id="publish-all">${isBlogPublication()?'Publish blog to LinkedIn & Facebook':'Publish to all connected accounts'}</button>${tab==='LinkedIn'?`<button id="publish-linkedin" class="secondary">${isBlogPublication()?'Publish full blog to LinkedIn':'Publish to LinkedIn'}</button>`:tab==='Instagram'?'<button id="publish-instagram" class="secondary">Publish to Instagram</button>':tab==='Threads'?'<button id="publish-threads" class="secondary">Publish to Threads</button>':tab==='Facebook'?`<button id="publish-facebook" class="secondary">${isBlogPublication()?'Publish full blog to Facebook':'Publish to Facebook'}</button>`:tab==='Blog'?'<button id="publish-blog-linkedin" class="secondary">Publish blog to LinkedIn</button><button id="publish-blog-facebook" class="secondary">Publish blog to Facebook</button>':''}</div>${isBlogPublication()?`<label class="chip"><input type="checkbox" id="blog-archive" ${current.includeBlogLink?'checked':''}> Also publish to my blog collection and add its link</label>`:''}<div id="publish-results" role="status" aria-live="polite"></div><div class="notice" style="margin-top:18px">Save your draft or export your post pack. LinkedIn, Instagram, Facebook and Threads publish only after you click Publish and confirm the review. Other channels use manual publishing.</div></div></section></div>`;

document.querySelectorAll('#title,#facts,#caption,#platform-title,#mdtext').forEach(el=>el.addEventListener('input',capture));

document.querySelector('#mode').onchange=e=>{capture();current.mode=e.target.value;current.postFormat=current.mode==='Carousel'?'Carousel':'single';if(current.mode==='Blog')tab='Blog';else if(tab==='Blog')tab='LinkedIn';composer();};document.querySelector('#work-type')?.addEventListener('change',e=>{capture();current.workType=e.target.value;composer();});document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{capture();tab=b.dataset.tab;composer();});document.querySelectorAll('[data-channel]').forEach(c=>c.onchange=()=>{current.selected=[...document.querySelectorAll('[data-channel]:checked')].map(x=>x.dataset.channel);});

document.querySelector('#media').onchange=e=>setFile(e.target.files[0],false);document.querySelector('#thumb')?.addEventListener('change',e=>setFile(e.target.files[0],true));document.querySelector('#mdfile')?.addEventListener('change',async e=>{let f=e.target.files[0];if(!f)return;if(f.size>1000000)return toast('Markdown limit is 1 MB.');capture();md=await f.text();if(!current.title)current.title=md.match(/^#\s+(.+)$/m)?.[1]||f.name.replace(/\.md$/i,'');composer();});document.querySelector('#mdtext')?.addEventListener('change',e=>{md=e.target.value;capture();composer();});mountCaptionRefinement({root:document.querySelector('#caption-refinement'),context:()=>{capture();return {identity:JSON.stringify([user?.id,current.id,current.title,current.facts,current.mode,tab,current.titles?.[tab],current.captions?.[tab],md]),title:current.title,facts:current.facts,contentType:current.mode,markdown:current.mode==='Blog'?md:'',platforms:[tab==='Threads'?'X':tab],draftTitle:current.titles?.[tab]||current.title,draftCaption:tab==='Blog'?md:current.captions?.[tab]||''};},request:async input=>{if(!cloud||user.id==='local')throw Error('Sign in to your cloud account first.');const {data,error}=await cloud.functions.invoke('generate',{body:input});if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}const key=input.platforms[0];return {title:data.titles?.[key],caption:data.captions?.[key]};},apply:change=>{current.titles||={};current.titles[tab]=change.title;if(tab==='Blog')md=change.caption;else current.captions[tab]=change.caption;rememberEditor();composer();toast('Suggestion applied. Review before publishing.');},notice:toast});document.querySelector('#template').onclick=templates;document.querySelector('#generate').onclick=()=>generate(false);document.querySelector('#analyse')?.addEventListener('click',()=>generate(true));document.querySelector('#publish-linkedin')?.addEventListener('click',publishLinkedIn);document.querySelector('#publish-instagram')?.addEventListener('click',publishInstagram);document.querySelector('#publish-facebook')?.addEventListener('click',()=>publishFacebook(false));document.querySelector('#publish-blog-facebook')?.addEventListener('click',()=>publishFacebook(true));document.querySelector('#publish-threads')?.addEventListener('click',publishThreads);document.querySelector('#publish-all').onclick=()=>isBlogPublication()?publishBlogConnected():publishAllConnected();document.querySelector('#publish-blog-linkedin')?.addEventListener('click',publishBlogLinkedIn);const captionField=document.querySelector('#caption'),captionCount=document.querySelector('#caption-count');const updateCaptionCount=()=>{const limit=captionLimits[tab];captionCount.textContent=captionField.value.length.toLocaleString()+(limit?' / '+limit.toLocaleString()+' characters':' characters');};captionField.addEventListener('input',updateCaptionCount);updateCaptionCount();document.querySelector('#shorten-caption').onclick=()=>{if(tab==='Blog'&&captionField.value.length>600&&!md.trim())md=captionField.value;const fitted=fitCaption(captionField.value,tab);captionField.value=fitted.text;updateCaptionCount();capture();toast(fitted.shortened?'Caption shortened. Review before publishing.':'Caption already fits this platform.');};document.querySelector('#save').onclick=save;document.querySelector('#export').onclick=exportPack;mountCarousel({current,escape:esc,changed:rerender=>{capture();if(rerender)composer();},toast,owner:()=>user?.id});updateVideoPreparation();}

function updateVideoPreparation(){
 const busy=!!videoPreparation&&videoPreparation.draft===current;
 const status=document.querySelector('#video-preparation');if(status){status.hidden=!busy&&!current.videoPreparationNote;status.textContent=busy?'Preparing MP4 upload copyâ€¦ '+videoPreparation.progress+'%. Keep this screen open. Your original is unchanged.':current.videoPreparationNote||'';}
 const cancel=document.querySelector('#cancel-video-preparation');if(cancel){cancel.hidden=!busy;cancel.onclick=()=>videoPreparation?.controller.abort();}
 for(const selector of ['#mode','#work-type','#save','#export','#generate','#analyse','#publish-all','#publish-linkedin','#publish-instagram','#publish-facebook','#publish-threads']){const button=document.querySelector(selector);if(button){if(busy){if(!button.hasAttribute('data-video-disabled')){button.dataset.videoDisabled=button.disabled?'true':'false';button.disabled=true;}}else if(button.hasAttribute('data-video-disabled')){button.disabled=button.dataset.videoDisabled==='true';delete button.dataset.videoDisabled;}}}
}
async function setFile(f,isThumb){if(!f)return;const limit=!isThumb&&isVideoFile(f)?500:storage==='drive'?500:50;if(f.size>limit*1024*1024)return toast('Choose a file under '+limit+' MB.');const kind=uploadKind(current,media?.type||current.mediaType||'');if(!acceptsUpload(kind,f.type,isThumb)&&!(!isThumb&&kind==='Video'&&isVideoFile(f)))return toast('Choose '+(isThumb||kind!=='Video'?'an image':'a video')+' for this field.');capture();let videoNote=null;if(!isThumb){videoPreparation?.controller.abort();videoPreparation=null;}if(!isThumb&&kind==='Video'){
 const job={controller:new AbortController(),draft:current,owner:user?.id,progress:0};videoPreparation=job;updateVideoPreparation();
 try{const original=f;const {prepareVideo}=await import('./video-preparation.js');const result=await prepareVideo(f,{signal:job.controller.signal,onProgress:value=>{job.progress=value;updateVideoPreparation();}});if(videoPreparation!==job||current!==job.draft||user?.id!==job.owner||uploadKind(current,media?.type||current.mediaType||'')!=='Video')return;f=result.file;videoNote=preparedVideoNote(original,f,result.converted,result);}
 catch(error){if(!job.controller.signal.aborted&&current===job.draft)toast(error.message||'Could not prepare this video. Your previous artwork is unchanged.');return;}
 finally{if(videoPreparation===job){videoPreparation=null;updateVideoPreparation();}}
 }if(view==='Create')capture();if(isThumb){current.driveThumbId=null;current.thumbPath=null;current.thumbName=f.name;if(thumbURL)URL.revokeObjectURL(thumbURL);thumb=f;thumbURL=URL.createObjectURL(f);}else{current.driveMediaId=null;current.mediaPath=null;current.videoPreparationNote=videoNote;current.mediaType=f.type;current.mediaName=f.name;if(kind==='Blog')current.blogCoverSource='media';if(mediaURL)URL.revokeObjectURL(mediaURL);media=f;mediaURL=URL.createObjectURL(f);}if(view==='Create')composer();else rememberEditor();}

function templates(){capture();if(!current.title.trim())return toast('Add a project heading first.');let t=current.title,f=current.facts.trim();current.captions={Threads:(t+'\n\n'+f).slice(0,500),Facebook:`${t}\n\n${f}\n\n#GraphicDesign #CreativeWork`,LinkedIn:`${t}\n\n${f}\n\nA look at my latest creative work.\n\n#GraphicDesign #BrandDesign`,Instagram:`${t}\n\n${f}\n\n#DesignPortfolio #GraphicDesign #CreativeWork`,X:`${t}\n\n${f}`.slice(0,280),Behance:`# ${t}\n\n## Project overview\n${f}\n\n## Process\n[Add your design decisions and development.]\n\n## Deliverables\n[Add the completed assets.]`,Blog:md||`# ${t}\n\n${f}`};composer();toast('Writing templates ready. These are not AI-generated.');}

let captionGeneration=0;
async function generate(analyseMedia=false){capture();if(!current.title.trim())return toast('Add a heading first.');if(!cloud||user.id==='local')return toast('AI needs a configured cloud account and the generate function. Templates are available now.');if(analyseMedia&&!isCarousel()&&!selectedArtworkSlot())return toast('Upload the artwork for this content type first.');if(analyseMedia&&isCarousel()&&(current.carousel||[]).length<2)return toast('Add at least two carousel slides first.');const generation=++captionGeneration,draft=current,owner=user.id,project=JSON.stringify([current.title,current.facts,md,current.mode,current.postFormat]),artwork=media;const targets=captionTargets(current.selected,tab,composerPlatforms(uploadKind(current,media?.type||current.mediaType||'')));const buttons=[...document.querySelectorAll('#generate,#analyse')];buttons.forEach(button=>button.disabled=true);let b=document.querySelector(analyseMedia?'#analyse':'#generate');let originalLabel=b.textContent;b.disabled=true;b.textContent='Preparing captionsâ€¦';try{let attachment=null,source=analyseMedia?(isCarousel()?await carouselAnalysisFile(current.carousel||[]):await resolveLinkedInMedia()):null;if(analyseMedia&&source){if(source.size>12*1024*1024)throw Error('Media analysis limit is 12 MB. Select a smaller copy or turn off media analysis.');if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'].includes(source.type))throw Error('Use JPG, PNG, WebP, MP4, WebM or MOV for analysis.');b.textContent='Analysing your media ';let encoded=await new Promise((resolve,reject)=>{let reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read media'));reader.readAsDataURL(source);});attachment={mimeType:source.type,data:encoded};}let {data,error}=await cloud.functions.invoke('generate',{body:{title:current.title,facts:current.facts+(isCarousel()&&analyseMedia?'\nThe attached image is a numbered contact sheet of all carousel slides in order. Describe the whole carousel using only visible content and the supplied facts.':''),contentType:current.mode,markdown:current.mode==='Blog'?md:'',platforms:[...new Set(targets.map(p=>p==='Threads'?'X':p))],media:attachment}});if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}if(generation!==captionGeneration)return;if(current!==draft||user?.id!==owner||media!==artwork||JSON.stringify([current.title,current.facts,md,current.mode,current.postFormat])!==project)throw Error('Your project changed while Gemini was working. Generate again for the current project.');const changes=generatedChanges(data,targets,fitCaption);current.captions={...current.captions,...changes.captions};current.keywords=Array.isArray(data.keywords)?data.keywords:[];current.titles={...current.titles,...changes.titles};if(view==='Create')composer();else rememberEditor();toast('AI draft ready. Review facts and wording before posting.');}catch(e){toast('AI generation failed: '+e.message);}finally{buttons.forEach(button=>{if(button.isConnected)button.disabled=false;});if(b.isConnected)b.textContent=originalLabel;}}

async function save(){capture();if(!current.title.trim())return toast('Add a heading first.');let b=document.querySelector('#save');b.disabled=true;try{let d={...current,markdown:md,created_at:new Date().toISOString(),storage};

if(storage==='drive'){

 if(!drive.connected)throw Error('Connect Google Drive in Settings before saving.');

 if(!(media instanceof Blob)&&!current.driveMediaId&&mediaURL){const data=await(await fetch(mediaURL)).blob();media=new File([data],media?.name||'artwork',{type:media?.type||data.type});}

 if(!(thumb instanceof Blob)&&!current.driveThumbId&&thumbURL){const data=await(await fetch(thumbURL)).blob();thumb=new File([data],'thumbnail',{type:data.type});}

 if(media instanceof Blob){const f=await drive.upload(media);current.driveMediaId=f.id;current.mediaName=media.name;current.mediaType=media.type;d.driveMediaId=f.id;d.mediaName=media.name;d.mediaType=media.type;media={name:media.name,type:media.type};}

 if(thumb instanceof Blob){const f=await drive.upload(thumb);current.driveThumbId=f.id;current.thumbName=thumb.name;d.driveThumbId=f.id;d.thumbName=thumb.name;thumb=null;}

 if(md){const f=await drive.upload(new Blob([md],{type:'text/markdown'}),{id:current.driveArticleId,name:current.title.slice(0,100)+'.md'});current.driveArticleId=f.id;d.driveArticleId=f.id;}

 const saved=await drive.saveDraft(d);d.id=saved.id;d.driveDraftId=saved.id;

}else if(storage==='local'||user.id==='local'){d.id=current.storage==='local'&&current.id?current.id:crypto.randomUUID();d.media=media instanceof Blob?media:mediaURL?await(await fetch(mediaURL)).blob():null;d.thumb=thumb instanceof Blob?thumb:thumbURL?await(await fetch(thumbURL)).blob():null;await local('put',d);}

else{async function upload(f,existing){if(!(f instanceof Blob))return existing||null;let path=`${user.id}/${crypto.randomUUID()}/${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;let {error}=await cloud.storage.from('assets').upload(path,f);if(error)throw error;return path;}d.mediaPath=await upload(media,current.mediaPath);d.thumbPath=await upload(thumb,current.thumbPath);let row={user_id:user.id,title:d.title,payload:d},existing=current.storage==='cloud'&&current.id;let r=existing?await cloud.from('drafts').update(row).eq('id',current.id):await cloud.from('drafts').insert(row).select().single();if(r.error)throw r.error;d.id=existing||r.data.id;}

current={...d};toast(storage==='drive'?'Saved privately to your Google Drive. Nothing published.':'Draft saved. Nothing published.');}catch(e){toast('Save failed: '+e.message);}finally{b.disabled=false;}}

function download(name,text,type='text/plain'){let u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

function exportPack(){capture();if(!current.title.trim())return toast('Add a heading first.');download(current.title.replace(/[^a-zA-Z0-9-]/g,'_')+'-post-pack.json',JSON.stringify({title:current.title,facts:current.facts,platforms:current.selected,captions:current.captions,titles:current.titles||{},keywords:current.keywords||[],markdown:md,postFormat:current.postFormat||'single',carousel:current.carousel||[],mediaFilename:media?.name||null,thumbnailFilename:thumb?.name||null},null,2),'application/json');if(md)download('article.md',md,'text/markdown');toast('Post pack downloaded. Attach your original artwork when posting.');}

function library(){document.querySelector('#content').innerHTML=`<div class="notice">Storage: ${storage==='drive'?'Google Drive'+(drive.connected?' Â· connected':' Â· reconnect in Settings'):storage==='local'?'This browser':'Cloud database'}. Each account uses its own Drive. Switching storage does not move existing drafts.</div><div class="library" style="margin-top:20px">${libraryLoading?'<div class="card" role="status">Loading your saved drafts…</div>':drafts.length?drafts.map(d=>`<article class="card"><span class="eyebrow">${esc(d.mode||'Work')} / DRAFT</span><div class="library-art">${navIcon(d.mode==='Blog'?'Channels':'Create')}<span>${esc((d.title||'D').slice(0,1).toUpperCase())}</span></div><h3>${esc(d.title)}</h3><p class="muted">${esc(new Date(d.created_at).toLocaleDateString())}</p><p class="muted">${esc((d.selected||[]).join(' Â· '))}</p><button data-open="${esc(d.id)}">Open draft</button></article>`).join(''):'<div class="card empty">No drafts loaded. Connect your Drive or start a new draft.</div>'}</div><button id="refresh" class="secondary">Refresh library</button>`;document.querySelector('#refresh').onclick=load;document.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{try{let d=drafts.find(x=>x.id===b.dataset.open);revoke();current={...d,storage};md=d.markdown||'';media=thumb=null;if(storage==='drive'){if(d.driveMediaId){media=await drive.readAsset(d.driveMediaId);mediaURL=URL.createObjectURL(media);media=new File([media],d.mediaName||'artwork',{type:d.mediaType||media.type});}if(d.driveThumbId){thumb=await drive.readAsset(d.driveThumbId);thumbURL=URL.createObjectURL(thumb);} // Existing assets are references, not new uploads.

thumb=null;

}else if(storage==='local'||user.id==='local'){media=d.media;thumb=d.thumb;if(media instanceof Blob)mediaURL=URL.createObjectURL(media);if(thumb instanceof Blob)thumbURL=URL.createObjectURL(thumb);}else{for(let [path,type] of [[d.mediaPath,'media'],[d.thumbPath,'thumb']])if(path){let {data,error}=await cloud.storage.from('assets').createSignedUrl(path,3600);if(error)throw error;if(type==='media'){mediaURL=data.signedUrl;media={type:/\.(mp4|mov|webm)$/i.test(path)?'video/mp4':'image/jpeg',name:path.split('/').pop()};}else thumbURL=data.signedUrl;}}view='Create';render();}catch(e){toast('Could not open draft: '+e.message);}});} 

function channels(){document.querySelector('#content').innerHTML=`<div class="notice">Connect LinkedIn, Instagram, Facebook Page or Threads, then review and publish from Create post. Generating captions and saving drafts never publish.</div><div class="library" style="margin-top:22px"><div class="card"><h2>LinkedIn</h2><p id="linkedin-status" class="status">Checking accountâ€¦</p><p class="muted">Publish to your personal feed. Text, JPG/PNG images and MP4 videos up to 12 MB. Larger videos can be exported for manual upload.</p><div class="row"><button id="connect-linkedin">Connect LinkedIn</button><button id="disconnect-linkedin" class="secondary" disabled>Disconnect</button></div></div><div class="card"><h2>Instagram</h2><p id="instagram-status" class="status">Checking accountâ€¦</p><p class="muted">Publish an image to your feed or an MP4 Reel up to 12 MB. Images are prepared as JPG. A Business or Creator account is required.</p><div class="row"><button id="connect-instagram">Connect Instagram</button><button id="disconnect-instagram" class="secondary" disabled>Disconnect</button>${readPendingInstagram(user.id)?'<button id="resume-instagram" class="secondary">Continue publication</button>':''}</div></div>${platforms.filter(p=>!['LinkedIn','Instagram','Facebook','Threads'].includes(p)).map(p=>`<div class="card"><h2>${p}</h2><span class="status">Manual publishing</span><p class="muted">Prepare your caption and export your post pack. This channel's publisher is not connected yet.</p></div>`).join('')}</div>`;document.querySelector('#connect-linkedin').onclick=connectLinkedIn;document.querySelector('#disconnect-linkedin').onclick=async()=>{try{await linkedinRequest({action:'disconnect'});linkedinAccount={connected:false};linkedinAccountFor=user.id;channels();}catch(e){toast(e.message);}};document.querySelector('#connect-instagram').onclick=connectInstagram;document.querySelector('#disconnect-instagram').onclick=async()=>{try{await instagramRequest({action:'disconnect'});instagramAccount={connected:false};instagramAccountFor=user.id;channels();}catch(e){toast(e.message);}};document.querySelector('#resume-instagram')?.addEventListener('click',resumeInstagram);void refreshLinkedIn();void refreshInstagram();if(cloud&&user?.id&&user.id!=='local')mountPublicationHistory({root:document.querySelector('#content'),owner:user.id,getOwner:()=>user?.id,requests:{Instagram:instagramRequest,Facebook:facebookRequest},follow:followMetaPublication,escape:esc});}

function settings(){document.querySelector('#content').innerHTML=`<div class="grid"><section><div class="card"><h2>Google Drive storage</h2><p class="muted">Images, videos, thumbnails and Markdown articles will be saved in your private app folder. Your existing Drive folder and files are preserved.</p><label for="storage">Save drafts to</label><select id="storage"><option value="drive" ${storage==='drive'?'selected':''}>Google Drive</option><option value="local" ${storage==='local'?'selected':''}>This browser (offline)</option>${cloud&&user.id!=='local'?`<option value="cloud" ${storage==='cloud'?'selected':''}>Supabase storage (legacy)</option>`:''}</select><p class="status">${drive.connected?'Connected Â· restores automatically':cloud&&user.id!=='local'?'Ready to connect':'Sign in to connect'}</p><div class="row"><button id="connect-drive">Connect Google Drive</button><button id="disconnect-drive" class="secondary" ${drive.connected?'':'disabled'}>Disconnect</button></div><p class="muted">Drive only grants access to files this app creates or that you explicitly select for it. Access renews automatically when you reopen the app. Reconnecting keeps your unfinished draft. No files are made public.</p></div><div class="card"><h2>Your account</h2><div class="profile-account">${avatarHTML()}<p>${esc(user.email)}</p></div><p class="muted">${user.id==='local'?'Local studio is not an authenticated cloud account. Sign in to a cloud account to use Gemini.':'Your cloud login stays signed in. Drive authorization is separate.'}</p><button id="settingsLogout" class="secondary">Sign out</button></div></section><section><div class="card"><h2>Gemini AI</h2><span class="badge">Selected provider</span><p>Generate titles, descriptions, keywords and hashtags for each platform.</p><p class="muted">${cloud?'Backend address configured; Gemini requires its server secret and deployed function.':'Configure Supabase and deploy the Gemini function to activate AI.'}</p><div class="notice">Gemini receives your heading, project facts and article text when you click Generate. Only the separate Analyse media + captions button sends your image or video to Gemini. Normal caption generation uses text only. Analysis files must be under 12 MB. Review generated wording before publishing. API keys stay on the backend.</div></div><div class="card"><h2>Install on your phone</h2><p class="muted">Open the hosted app in your phone browser, then choose Add to Home Screen.</p><button id="install" ${installEvent?'':'disabled'}>Install app</button></div><div class="card"><h2>Publishing</h2><p class="muted">Connect LinkedIn and Instagram in Channels. Review each post before publishing. Other destinations use manual export.</p></div></section></div>`;



document.querySelector('#storage').onchange=e=>{storage=e.target.value;localStorage.setItem('one-storage',storage);drafts=[];settings();};

document.querySelector('#connect-drive').onclick=async()=>{const b=document.querySelector('#connect-drive');b.disabled=true;try{await driveConnection.connect();drafts=[];storage='drive';localStorage.setItem('one-storage',storage);await drive.folderId();toast('Google Drive connected. Your private folder is ready.');}catch(e){toast(e.message);}settings();};

document.querySelector('#disconnect-drive').onclick=async()=>{const b=document.querySelector('#disconnect-drive');b.disabled=true;try{await driveConnection.disconnect();drafts=[];toast('Drive disconnected. Your unfinished draft is preserved.');}catch(e){toast(e.message);}settings();};document.querySelector('#settingsLogout').onclick=()=>document.querySelector('#logout').click();document.querySelector('#install').onclick=async()=>{await installEvent?.prompt();installEvent=null;settings();};}



let linkedinAccount={connected:false},linkedinAccountFor='',linkedinPopup=null;

async function linkedinRequest(body){if(!cloud||!user||user.id==='local')throw Error('Sign in to a cloud account first.');const {data,error}=await cloud.functions.invoke('dynamic-endpoint',{body});if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}return data;}

async function refreshLinkedIn(){const accountId=user?.id;try{const data=await linkedinRequest({action:'status'});if(user?.id!==accountId)return;linkedinAccount=data;linkedinAccountFor=accountId;const label=document.querySelector('#linkedin-status');if(label)label.textContent=data.connected?'Connected: '+data.name+' Â· personal feed':'Not connected';const button=document.querySelector('#disconnect-linkedin');if(button)button.disabled=!data.connected;}catch(e){const label=document.querySelector('#linkedin-status');if(label)label.textContent=e.message;}}

async function connectLinkedIn(){capture();linkedinPopup=window.open('about:blank','creativerelay-linkedin','width=650,height=760');if(!linkedinPopup)return toast('Allow popups for this site, then try Connect LinkedIn again.');try{const data=await linkedinRequest({action:'connect'});const target=new URL(data.url);if(target.origin!=='https://www.linkedin.com')throw Error('Unexpected connection URL.');linkedinPopup.location.href=target.href;}catch(e){linkedinPopup?.close();toast(e.message);}}

window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==linkedinPopup||e.data?.type!=='creativerelay-linkedin')return;linkedinPopup?.close();linkedinPopup=null;toast(e.data.result==='connected'?'LinkedIn account connected.':'LinkedIn connection did not complete: '+e.data.result);void refreshLinkedIn();});

const linkedinCallbackResult=new URL(location.href).searchParams.get('linkedin');

if(linkedinCallbackResult){const clean=new URL(location.href);clean.searchParams.delete('linkedin');history.replaceState(null,'',clean.href);if(window.opener){window.opener.postMessage({type:'creativerelay-linkedin',result:linkedinCallbackResult},location.origin);window.close();}else setTimeout(()=>toast(linkedinCallbackResult==='connected'?'LinkedIn account connected.':'LinkedIn connection did not complete: '+linkedinCallbackResult),800);}

async function resolveLinkedInMedia(){const slot=selectedArtworkSlot();if(!slot){const kind=uploadKind(current,media?.type||current.mediaType||'');if(kind==='Video'||(kind==='Photo'&&(media||current.driveMediaId||current.mediaPath)))throw Error('Upload a '+kind.toLowerCase()+' for the selected Work format.');return null;}const isMain=slot==='media';let file=isMain?media:thumb;const driveId=isMain?current.driveMediaId:current.driveThumbId;const storagePath=isMain?current.mediaPath:current.thumbPath;if(!(file instanceof Blob)){if(driveId){if(!drive.connected)throw Error('Reconnect Google Drive to load the attached artwork.');file=await drive.readAsset(driveId);}else if(storagePath){const result=await cloud.storage.from('assets').download(storagePath);if(result.error)throw result.error;file=result.data;}else if(file||mediaURL||thumbURL)throw Error('Select the original artwork again before publishing.');}if(file&&!(file instanceof Blob))throw Error('Could not load the attached artwork.');return file||null;}

function reviewLinkedIn(caption,file){return new Promise(resolve=>{const previewURL=file?URL.createObjectURL(file):'';const dialog=document.createElement('dialog');dialog.style.cssText='border:1px solid #dbe1e6;border-radius:20px;padding:28px;width:min(560px,90vw);max-height:85vh;color:#121619';dialog.innerHTML=`<h2>Review LinkedIn post</h2><p>Publish publicly to <strong>${esc(linkedinAccount.name)}</strong>'s personal feed.</p>${file?`<p><strong>Artwork attached</strong> Â· ${esc(file.name||'Saved artwork')}</p>${file.type.startsWith('video/')?`<video controls src="${esc(previewURL)}" style="width:100%;max-height:260px"></video>`:`<img src="${esc(previewURL)}" alt="Image that will be published" style="width:100%;max-height:260px;object-fit:contain">`}`:'<p><strong>Text-only post â€” no image or video attached.</strong></p>'}<div style="white-space:pre-wrap;overflow:auto;max-height:30vh;padding:16px;background:#f6f7fb;border-radius:12px">${esc(caption)}</div><div class="row" style="margin-top:20px"><button id="confirm-linkedin-post">Publish now</button><button id="cancel-linkedin-post" class="secondary">Cancel</button></div>`;document.body.append(dialog);const finish=value=>{dialog.close();dialog.remove();if(previewURL)URL.revokeObjectURL(previewURL);resolve(value);};dialog.querySelector('#confirm-linkedin-post').onclick=()=>finish(true);dialog.querySelector('#cancel-linkedin-post').onclick=()=>finish(false);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.showModal();});}

async function publishLinkedIn(){if(isCarousel())return publishCarousel(['LinkedIn']);if(isBlogPublication())return publishFullBlog(['LinkedIn'],'#publish-linkedin');if(publishingAll)return toast('Wait for the combined publication to finish.');capture();const button=document.querySelector('#publish-linkedin');button.disabled=true;try{await refreshLinkedIn();if(!linkedinAccount.connected||linkedinAccountFor!==user.id)throw Error('Connect your personal LinkedIn account in Channels first.');const caption=fitCaption(current.captions.LinkedIn||'','LinkedIn').text;if(!caption||caption.length>3000)throw Error('Write a LinkedIn caption between 1 and 3,000 characters.');const file=await resolveLinkedInMedia();let attachment=null;if(file){if(file.size>12*1024*1024)throw Error('LinkedIn publishing supports files up to 12 MB in this version. Export larger files for manual upload.');if(!['image/jpeg','image/png','video/mp4'].includes(file.type))throw Error('Use JPG, PNG or MP4 for LinkedIn publishing.');}if(!await reviewLinkedIn(caption,file))return;if(file){attachment={mimeType:file.type,data:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read media.'));reader.readAsDataURL(file);})};}const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({member:linkedinAccount.name,caption,attachment})))),b=>b.toString(16).padStart(2,'0')).join('');const attemptKey='creativerelay-publish:'+user.id+':'+digest;let requestId=sessionStorage.getItem(attemptKey);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(attemptKey,requestId);}button.textContent='Publishingâ€¦';const result=await linkedinRequest({action:'publish',requestId,caption,media:attachment});if(result.published){toast('Published to your personal LinkedIn feed.');const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noopener';link.textContent='View LinkedIn post';button.after(link);}}catch(e){toast('Publishing failed: '+e.message);}finally{button.disabled=false;button.textContent='Publish to LinkedIn';}}

let instagramAccount={connected:false},instagramAccountFor='',instagramPopup=null;

async function instagramRequest(body){if(!cloud||!user||user.id==='local')throw Error('Sign in to a cloud account first.');const {data,error}=await cloud.functions.invoke('instagram',{body});if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);return data;}

async function refreshInstagram(){const id=user?.id;try{const data=await instagramRequest({action:'status'});if(user?.id!==id)return;instagramAccount=data;instagramAccountFor=id;const label=document.querySelector('#instagram-status');if(label)label.textContent=data.connected?'Connected: @'+data.name:'Not connected';const button=document.querySelector('#disconnect-instagram');if(button)button.disabled=!data.connected;}catch(e){const label=document.querySelector('#instagram-status');if(label)label.textContent=e.message;}}

async function connectInstagram(){capture();instagramPopup=window.open('about:blank','creativerelay-instagram','width=650,height=760');if(!instagramPopup)return toast('Allow popups, then try Connect Instagram again.');try{const data=await instagramRequest({action:'connect'}),target=new URL(data.url);if(target.origin!=='https://www.instagram.com')throw Error('Unexpected connection URL.');instagramPopup.location.href=target.href;}catch(e){instagramPopup?.close();toast(e.message);}}

window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==instagramPopup||e.data?.type!=='creativerelay-instagram')return;instagramPopup?.close();instagramPopup=null;toast(e.data.result==='connected'?'Instagram account connected.':'Instagram connection did not complete: '+e.data.result);void refreshInstagram();});

const instagramCallbackResult=new URL(location.href).searchParams.get('instagram');

if(instagramCallbackResult){const clean=new URL(location.href);clean.searchParams.delete('instagram');history.replaceState(null,'',clean.href);if(window.opener){window.opener.postMessage({type:'creativerelay-instagram',result:instagramCallbackResult},location.origin);window.close();}else setTimeout(()=>toast(instagramCallbackResult==='connected'?'Instagram account connected.':'Instagram connection did not complete: '+instagramCallbackResult),800);}

async function instagramMedia(file){

 if(!file)throw Error('Attach artwork or a video. Instagram cannot publish text alone.');

 if(file.type==='video/mp4'){if(file.size>12*1024*1024)throw Error('This version supports MP4 videos up to 12 MB. Export larger videos for manual upload.');return file;}

 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use a JPG, PNG, WebP image or an MP4 video.');

 const bitmap=await createImageBitmap(file);

 try{const plan=originalGeometry(bitmap.width,bitmap.height),canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,plan.width,plan.height);ctx.drawImage(bitmap,plan.x,plan.y,plan.drawWidth,plan.drawHeight);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));if(!blob)throw Error('Could not prepare Instagram image.');return new File([blob],'instagram-artwork.jpg',{type:'image/jpeg'});}finally{bitmap.close();}

}

function reviewInstagram(caption,file){return new Promise(resolve=>{const preview=URL.createObjectURL(file),dialog=document.createElement('dialog');dialog.style.cssText='border:1px solid #dbe1e6;border-radius:20px;padding:28px;width:min(560px,90vw);max-height:85vh;color:#121619';dialog.innerHTML=`<h2>Review Instagram post</h2><p>Publish ${file.type.startsWith('video/')?'a Reel, also shared to your feed':'a feed image'} to <strong>@${esc(instagramAccount.name)}</strong>.</p>${file.type.startsWith('video/')?`<video controls src="${esc(preview)}" style="width:100%;max-height:300px"></video>`:`<img src="${esc(preview)}" alt="Image that will be published" style="width:100%;max-height:300px;object-fit:contain"><p class="muted">Prepared as JPG in its original proportions. No border or automatic crop is added.</p>`}<div style="white-space:pre-wrap;max-height:25vh;overflow:auto;padding:16px;background:#f6f7fb;border-radius:12px">${esc(caption)}</div><p class="muted">The selected media will be sent to Instagram. Video processing can take several minutes.</p><div class="row"><button id="confirm-instagram">Publish now</button><button id="cancel-instagram" class="secondary">Cancel</button></div>`;document.body.append(dialog);const finish=value=>{dialog.close();dialog.remove();URL.revokeObjectURL(preview);resolve(value);};dialog.querySelector('#confirm-instagram').onclick=()=>finish(true);dialog.querySelector('#cancel-instagram').onclick=()=>finish(false);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.showModal();});}

function showInstagramResult(result,button){if(!result.published)return false;forgetPendingInstagram(user.id);toast('Published to Instagram.');if(button?.isConnected){const link=document.createElement('a');const target=new URL(result.url);if(target.origin==='https://www.instagram.com'){link.href=target.href;link.target='_blank';link.rel='noopener';link.textContent='View Instagram post';button.after(link);}}return true;}

async function resumeInstagram(){const id=user?.id,requestId=readPendingInstagram(id);if(!requestId)return toast('No pending Instagram publication.');const button=document.querySelector('#resume-instagram');if(button)button.disabled=true;try{let result=await instagramRequest({action:'continue',requestId,userId:id});if(user?.id!==id)return;result=await followMetaPublication('Instagram',result,id,update=>publicationResults([{platform:'Instagram',...update}]));if(user?.id!==id)return;if(!showInstagramResult(result,button))toast('Instagram is still processing. Check again in a minute.');}catch(e){toast(e.message);}finally{if(button)button.disabled=false;}}

async function publishInstagram(){if(isCarousel())return publishCarousel(['Instagram']);if(publishingAll)return toast('Wait for the combined publication to finish.');capture();const button=document.querySelector('#publish-instagram'),id=user?.id;button.disabled=true;try{await refreshInstagram();if(!instagramAccount.connected||instagramAccountFor!==id)throw Error('Connect your Instagram account in Channels first.');const caption=fitCaption(current.captions.Instagram||'','Instagram').text;if(!caption||caption.length>2200)throw Error('Write an Instagram caption between 1 and 2,200 characters.');const file=await instagramMedia(await resolveLinkedInMedia());if(!await reviewInstagram(caption,file))return;if(user?.id!==id)throw Error('Your account changed. Review the post again.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read artwork.'));reader.readAsDataURL(file);});const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({account:instagramAccount.name,caption,data})))),b=>b.toString(16).padStart(2,'0')).join(''),attemptKey='creativerelay-instagram-publish:'+id+':'+digest;let requestId=sessionStorage.getItem(attemptKey);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(attemptKey,requestId);}rememberPendingInstagram(id,requestId);if(user?.id!==id)throw Error('Your account changed. Review the post again.');button.textContent='Preparing Instagram postâ€¦';let result=await recoverPublishResponse(()=>instagramRequest({action:'publish',requestId,userId:id,caption,media:{mimeType:file.type,data}}),{request:instagramRequest,requestId,owner:id,isOwner:owner=>user?.id===owner});if(user?.id!==id)return;result=await followMetaPublication('Instagram',result,id,update=>{if(user?.id===id)publicationResults([{platform:'Instagram',...update}]);});if(!showInstagramResult(result,button))toast('Still processing. Use Continue publication in Channels to finish this same post.');}catch(e){toast('Instagram publishing: '+e.message);}finally{button.disabled=false;button.textContent='Publish to Instagram';}}



let publishingAll=false;

const artworkBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read artwork.'));reader.readAsDataURL(file);});

async function publicationId(keyPrefix,id,payload){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))),b=>b.toString(16).padStart(2,'0')).join('');const key=keyPrefix+id+':'+digest;let requestId=sessionStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId);}return requestId;}

async function followMetaPublication(platform,result,id,onUpdate=()=>{}){
 if(!['Instagram','Threads'].includes(platform))return result;
 const next=await followPending(result,{request:platform==='Instagram'?instagramRequest:threadsRequest,owner:id,isOwner:owner=>user?.id===owner,onUpdate});
 const key='creativerelay-'+platform.toLowerCase()+'-pending:'+id;
 if(next.published){if(platform==='Instagram')forgetPendingInstagram(id,result.requestId);else if(sessionStorage.getItem(key)===result.requestId)sessionStorage.removeItem(key);}
 return next;
}
function publicationResults(results){let box=document.querySelector('#publish-results');if(!box)return;box.innerHTML=results.map(result=>`<p><strong>${esc(result.platform)}</strong>: ${result.error?esc(result.error):result.published?'Published':result.queued?'Waiting to send':result.sending?'Sending artwork':result.pending?(result.reconnecting?'Connection interrupted. Checking this same upload again.':result.stalled?'Still waiting. Use Continue publication in Channels to check this same upload.':'Processing. Checking automatically; keep this screen open.'):'Not confirmed'}${result.published&&result.url&&safePostLink(result.platform,result.url)?` Â· <a href="${esc(result.url)}" target="_blank" rel="noopener">View post</a>`:''}</p>`).join('');}

function safePostLink(platform,value){try{return new URL(value).origin===(platform==='LinkedIn'?'https://www.linkedin.com':platform==='Facebook'?'https://www.facebook.com':platform==='Threads'?'https://www.threads.com':platform==='Blog'?'https://iqbalpk.github.io':'https://www.instagram.com');}catch{return false;}}

function reviewAllPublications(posts){return new Promise(resolve=>{const previews=posts.map(post=>post.file?URL.createObjectURL(post.file):''),dialog=document.createElement('dialog');dialog.style.cssText='border:1px solid #dbe1e6;border-radius:20px;padding:28px;width:min(680px,92vw);max-height:85vh;color:#121619';dialog.innerHTML=`<h2>Review all posts</h2><p>Publish to these ${posts.length} connected ${posts.length===1?'account':'accounts'}:</p>${posts.map((post,i)=>`<section style="padding:16px 0;border-top:1px solid #e1e6eb"><h3>${esc(post.platform)} Â· ${esc(post.name)}</h3><p>${post.platform==='LinkedIn'?'Personal feed':post.platform==='Facebook'?'Facebook Page feed':post.platform==='Threads'?'Threads profile':post.file.type.startsWith('video/')?'Reel and feed':'Feed image'}</p>${post.file?post.file.type.startsWith('video/')?`<video controls src="${esc(previews[i])}" style="width:100%;max-height:240px"></video>`:`<img src="${esc(previews[i])}" alt="${esc(post.platform)} artwork to publish" style="width:100%;max-height:240px;object-fit:contain">`:'<p>Text-only post.</p>'}<div style="white-space:pre-wrap;padding:14px;background:#f6f7fb;border-radius:12px">${esc(post.caption)}</div></section>`).join('')}<p class="muted">Each platform publishes separately. If one fails, a successful post on the other platform remains published. Instagram images use the prepared JPG shown above.</p><div class="row"><button id="confirm-publish-all">Publish to ${posts.length===1?'this account':'all '+posts.length+' accounts'}</button><button id="cancel-publish-all" class="secondary">Cancel</button></div>`;document.body.append(dialog);const finish=value=>{dialog.close();dialog.remove();previews.filter(Boolean).forEach(value=>URL.revokeObjectURL(value));resolve(value);};dialog.querySelector('#confirm-publish-all').onclick=()=>finish(true);dialog.querySelector('#cancel-publish-all').onclick=()=>finish(false);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.showModal();});}

async function submitReviewedPublication(post,id){if(user?.id!==id)throw Error('Your signed-in account changed. Review the post again.');if(post.platform==='Threads')return submitThreads(post,id);if(post.platform==='Facebook'){const account=await facebookRequest({action:'status'});if(!account.connected||account.pageId!==post.pageId)throw Error('Your Facebook Page changed. Review the post again.');const attachment=post.file?{mimeType:post.file.type,data:await artworkBase64(post.file)}:null;const requestId=await publicationId('creativerelay-facebook-publish:',id,{pageId:post.pageId,caption:post.caption,attachment});if(user?.id!==id)throw Error('Your signed-in account changed.');return facebookRequest({action:'publish',requestId,userId:id,pageId:post.pageId,caption:post.caption,media:attachment});}if(post.platform==='LinkedIn'){if(!linkedinAccount.connected||linkedinAccountFor!==id||linkedinAccount.name!==post.name)throw Error('Your LinkedIn account changed. Review the post again.');const attachment=post.file?{mimeType:post.file.type,data:await artworkBase64(post.file)}:null;const requestId=await publicationId('creativerelay-publish:',id,{member:post.name,caption:post.caption,attachment});if(user?.id!==id)throw Error('Your signed-in account changed.');return linkedinRequest({action:'publish',requestId,caption:post.caption,media:attachment});}if(!instagramAccount.connected||instagramAccountFor!==id||instagramAccount.name!==post.name)throw Error('Your Instagram account changed. Review the post again.');const data=await artworkBase64(post.file),requestId=await publicationId('creativerelay-instagram-publish:',id,{account:post.name,caption:post.caption,data});if(user?.id!==id)throw Error('Your signed-in account changed.');rememberPendingInstagram(id,requestId);const result=await recoverPublishResponse(()=>instagramRequest({action:'publish',requestId,userId:id,caption:post.caption,media:{mimeType:post.file.type,data}}),{request:instagramRequest,requestId,owner:id,isOwner:owner=>user?.id===owner});if(result.published)forgetPendingInstagram(id);return result;}

async function publishAllConnected(){if(isCarousel())return publishCarousel(current.selected.filter(p=>['LinkedIn','Instagram','Facebook'].includes(p)));if(publishingAll)return;capture();const id=user?.id,captions={...current.captions};if(!cloud||!id||id==='local')return toast('Sign in to a cloud account first.');publishingAll=true;const button=document.querySelector('#publish-all');button.disabled=true;button.textContent='Checking connected accountsâ€¦';try{const accounts=await Promise.allSettled([linkedinRequest({action:'status'}),instagramRequest({action:'status'}),facebookRequest({action:'status'}),threadsRequest({action:'status'})]);if(user?.id!==id)throw Error('Your signed-in account changed.');if(accounts.some(account=>account.status==='rejected'))throw Error('Could not check every connected account. Check Channels and try again.');linkedinAccount=accounts[0].value;linkedinAccountFor=id;instagramAccount=accounts[1].value;instagramAccountFor=id;const file=await resolveLinkedInMedia(),posts=[];if(linkedinAccount.connected){const caption=fitCaption(captions.LinkedIn||'','LinkedIn').text;if(!caption||caption.length>3000)throw Error('Add a LinkedIn caption between 1 and 3,000 characters before publishing all.');if(file&&(file.size>12*1024*1024||!['image/jpeg','image/png','video/mp4'].includes(file.type)))throw Error('LinkedIn needs a JPG, PNG or MP4 up to 12 MB.');posts.push({platform:'LinkedIn',name:linkedinAccount.name,caption,file});}if(instagramAccount.connected){const caption=fitCaption(captions.Instagram||'','Instagram').text;if(!caption||caption.length>2200)throw Error('Add an Instagram caption between 1 and 2,200 characters before publishing all.');posts.push({platform:'Instagram',name:instagramAccount.name,caption,file:await instagramMedia(file)});}const threads=accounts[3].value;if(threads.connected){const caption=captions.Threads||'';validateThreadsDraft(caption,file);posts.push({platform:'Threads',name:threads.name,memberId:threads.memberId,caption,file});}const facebook=accounts[2].value;if(facebook.connected){const page=facebook.pages.find(p=>p.page_id===facebook.pageId),caption=fitCaption(captions.Facebook||(current.mode==='Blog'?blogFeedText():''),'Facebook').text;validateFacebookDraft(caption,file);posts.push({platform:'Facebook',name:page.name,pageId:page.page_id,caption,file});}if(!posts.length)throw Error('Connect LinkedIn, Instagram or Facebook in Channels first.');button.textContent='Publish to all connected accounts';if(!await reviewAllPublications(posts))return;if(user?.id!==id)throw Error('Your signed-in account changed. Review the posts again.');button.textContent='Publishing to connected accountsâ€¦';const results=posts.map(post=>({platform:post.platform,pending:true}));publicationResults(results);await runPublications(posts,post=>submitReviewedPublication(post,id),result=>{if(user?.id!==id)return;const index=results.findIndex(item=>item.platform===result.platform);results[index]=result;publicationResults(results);});if(user?.id===id)toast('Publishing results are shown below the buttons.');}catch(e){toast(e.message);}finally{publishingAll=false;button.disabled=false;button.textContent='Publish to all connected accounts';}}



function blogFeedText(){return String(current.titles?.Blog||current.title||'').trim();}

function reviewBlogLinkedIn(text,file){return new Promise(resolve=>{const excerpt=fitCaption(text,'LinkedIn').text,dialog=document.createElement('dialog'),preview=file?URL.createObjectURL(file):'';dialog.style.cssText='border:1px solid #dbe1e6;border-radius:20px;padding:28px;width:min(620px,92vw);max-height:85vh;color:#121619';dialog.innerHTML=`<h2>Publish blog to LinkedIn</h2><p>Share your blog title and cover on <strong>${esc(linkedinAccount.name)}</strong>'s personal feed.</p><p class="muted">${text.length>3000?'Your blog is longer than a LinkedIn feed post. Review and edit this excerpt before publishing.':'Review the blog text as a LinkedIn feed post.'} Native LinkedIn articles still require its article editor.</p>${file?file.type.startsWith('video/')?`<video controls src="${esc(preview)}" style="width:100%;max-height:200px"></video>`:`<img src="${esc(preview)}" alt="Blog artwork to publish" style="width:100%;max-height:200px;object-fit:contain">`:''}<label for="blog-linkedin-text">LinkedIn post text (up to 3,000 characters)</label><textarea id="blog-linkedin-text" maxlength="3000" style="min-height:230px">${esc(excerpt)}</textarea><div class="row" style="margin-top:18px"><button id="confirm-blog-linkedin">Publish to LinkedIn</button><button id="cancel-blog-linkedin" class="secondary">Cancel</button></div>`;document.body.append(dialog);const finish=value=>{dialog.close();dialog.remove();if(preview)URL.revokeObjectURL(preview);resolve(value);};dialog.querySelector('#confirm-blog-linkedin').onclick=()=>{const caption=dialog.querySelector('#blog-linkedin-text').value.trim();if(!caption)return toast('Write some text before publishing.');finish(caption);};dialog.querySelector('#cancel-blog-linkedin').onclick=()=>finish(null);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});dialog.showModal();});}

async function publishBlogLinkedIn(){return publishFullBlog(['LinkedIn'],'#publish-blog-linkedin');}



window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

if(cloud){startAuth(cloud.auth,{
 onSession(session,changed){user=session.user;if(changed){drafts=[];return load();}},
 onSignedOut(event){if(event==='SIGNED_OUT'){restoredEditorFor=null;drive.disconnect();drive.setOwner(null);user=null;drafts=[];revoke();media=thumb=null;auth();}else if(!user)auth();},
 async onRecovery(){const password=prompt('Enter a new password (at least 8 characters)');if(password?.length>=8){const {error}=await cloud.auth.updateUser({password});toast(error?error.message:'Password updated.');}},
 onError(error){toast(error.message||'Could not restore sign-in. Check your connection.');if(!user)auth();}
});}else if(sessionStorage.getItem('one-local')){user={id:'local',email:'Local studio'};void load();}else auth();



















import {installFacebook} from './facebook.js';

installFacebook({getCloud:()=>cloud,getUser:()=>user,getView:()=>view,toast});



async function facebookRequest(body){const id=user?.id;if(!cloud||!id||id==='local')throw Error('Sign in to a cloud account first.');const {data,error}=await cloud.functions.invoke('facebook',{body});if(user?.id!==id)throw Error('Your signed-in account changed.');if(error){let message='Facebook request failed.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);return data;}

function validateFacebookDraft(caption,file){if(!caption||caption.length>10000)throw Error('Write a Facebook caption between 1 and 10,000 characters.');if(file&&(file.size>12*1024*1024||!['image/jpeg','image/png','video/mp4'].includes(file.type)))throw Error('Facebook supports JPG, PNG or MP4 up to 12 MB in this update.');}

function reviewFacebookBlog(text,file,page){return new Promise(resolve=>{const preview=file?URL.createObjectURL(file):'',dialog=document.createElement('dialog');dialog.className='card';dialog.style.cssText='width:min(620px,92vw);max-height:85vh;overflow:auto';dialog.innerHTML='<h2>Publish blog to Facebook</h2><p>Post to <strong>'+esc(page.name)+'</strong> as a Page feed post.</p><p class="muted">Share your blog title and selected cover image. Your full article stays saved separately.</p>'+(file?(file.type.startsWith('video/')?'<video controls src="'+esc(preview)+'" style="width:100%;max-height:240px"></video>':'<img src="'+esc(preview)+'" alt="Blog artwork" style="width:100%;max-height:240px;object-fit:contain">'):'')+'<label for="facebook-blog-text">Facebook title</label><textarea id="facebook-blog-text" style="min-height:230px"></textarea><p data-count></p><div class="row"><button data-confirm>Publish to Facebook</button><button class="secondary" data-cancel>Cancel</button></div>';document.body.append(dialog);const field=dialog.querySelector('textarea');field.value=fitCaption(text,'Facebook').text;const count=()=>dialog.querySelector('[data-count]').textContent=field.value.length.toLocaleString()+' / 10,000 characters';count();field.oninput=count;const finish=value=>{dialog.close();dialog.remove();if(preview)URL.revokeObjectURL(preview);resolve(value);};dialog.querySelector('[data-confirm]').onclick=()=>{const caption=field.value.trim();try{validateFacebookDraft(caption,file);finish(caption);}catch(e){toast(e.message);}};dialog.querySelector('[data-cancel]').onclick=()=>finish(null);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});dialog.showModal();});}

async function publishFacebook(blog=false){if(isCarousel())return publishCarousel(['Facebook']);if(blog||isBlogPublication())return publishFullBlog(['Facebook'],blog?'#publish-blog-facebook':'#publish-facebook');if(publishingAll)return toast('Wait for publication to finish.');capture();const id=user?.id,button=document.querySelector(blog?'#publish-blog-facebook':'#publish-facebook');publishingAll=true;button.disabled=true;try{const account=await facebookRequest({action:'status'});if(!account.connected)throw Error('Connect and select your Facebook Page in Channels first.');const page=account.pages.find(p=>p.page_id===account.pageId);if(!page)throw Error('Select your Facebook Page again.');const file=await resolveLinkedInMedia();if(file&&(file.size>12*1024*1024||!['image/jpeg','image/png','video/mp4'].includes(file.type)))throw Error('Facebook needs JPG, PNG or MP4 up to 12 MB.');let caption=blog?blogFeedText():fitCaption(current.captions.Facebook||'','Facebook').text;if(blog){if(!caption)throw Error('Add a blog title first.');caption=await reviewFacebookBlog(caption,file,page);if(!caption)return;}else{validateFacebookDraft(caption,file);if(!await reviewAllPublications([{platform:'Facebook',name:page.name,pageId:page.page_id,caption,file}]))return;}if(user?.id!==id)throw Error('Your account changed. Review the post again.');button.textContent='Publishing to Facebookâ€¦';const result=await submitReviewedPublication({platform:'Facebook',name:page.name,pageId:page.page_id,caption,file},id);if(user?.id===id){publicationResults([{platform:'Facebook',...result}]);toast(result.published?'Published to your Facebook Page.':'Check the publication result.');}}catch(e){if(user?.id===id){publicationResults([{platform:'Facebook',error:e.message}]);toast(e.message);}}finally{publishingAll=false;if(button?.isConnected){button.disabled=false;button.textContent=blog?'Publish blog to Facebook':'Publish to Facebook';}}}



async function reviewBlogDestinations(posts){return await reviewAllPublications(posts)?posts:null;}

async function publishBlogConnected(){if(isCarousel())return publishCarousel(current.selected.filter(p=>['LinkedIn','Instagram','Facebook'].includes(p)));return publishFullBlog(['LinkedIn','Facebook'],'#publish-all');}



function isBlogPublication(){return current.mode==='Blog';}





function prepareBlogCaption(){if(current.mode!=='Blog')return;const text=String(current.captions.Blog||'');if(text.trim().length>600&&!md.trim())md=text;}





async function blogRequest(body){const id=user?.id;if(!cloud||!id||id==='local')throw Error('Sign in to a cloud account first.');const {data,error}=await cloud.functions.invoke('blog',{body});if(user?.id!==id)throw Error('Your signed-in account changed.');if(error){let message='Blog publication failed.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);return data;}

function fullArticleText(){prepareBlogCaption();return md||current.markdown||'';}

function reviewPublicBlog({title,markdown,url,posts,file}){return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='card';dialog.style.cssText='width:min(760px,92vw);max-height:88vh;overflow:auto';const cover=file?URL.createObjectURL(file):'';dialog.innerHTML='<h2>Publish full blog and share</h2><p>'+(url?'The complete article and cover will also be published in your blog collection. The share posts contain the full text and collection link.':'The full article and selected cover will be posted to the selected feeds. No blog link or separate blog page will be published.')+'</p><h3>'+esc(title)+'</h3>'+(file?(file.type.startsWith('video/')?'<video controls src="'+esc(cover)+'" style="width:100%;max-height:250px"></video>':'<img src="'+esc(cover)+'" alt="Blog cover to publish" style="width:100%;max-height:250px;object-fit:contain">'):'')+'<p><strong>Full article ('+markdown.length.toLocaleString()+' characters)</strong></p><div class="markdown" style="max-height:35vh;overflow:auto;border:1px solid #8994a5;padding:18px">'+DOMPurify.sanitize(marked.parse(markdown))+'</div><p>Article link: <span>'+esc(url)+'</span></p>'+posts.map(post=>'<section><h3>'+esc(post.platform)+' Â· '+esc(post.name)+'</h3><div style="white-space:pre-wrap">'+esc(post.caption)+'</div></section>').join('')+'<div class="row"><button data-confirm>Publish full blog & share to '+posts.map(p=>esc(p.platform)).join(' and ')+'</button><button class="secondary" data-cancel>Cancel</button></div>';document.body.append(dialog);const finish=value=>{dialog.close();dialog.remove();if(cover)URL.revokeObjectURL(cover);resolve(value);};dialog.querySelector('[data-confirm]').onclick=()=>finish(true);dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.showModal();});}



function plainBlogArticle(markdown){const container=document.createElement('div');container.innerHTML=DOMPurify.sanitize(marked.parse(markdown));container.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href');if(href&&href!==a.textContent)a.append(document.createTextNode(' ('+href+')'));});container.querySelectorAll('br').forEach(br=>br.replaceWith(document.createTextNode('\n')));container.querySelectorAll('li').forEach(li=>li.prepend(document.createTextNode('â€¢ ')));container.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,tr').forEach(el=>el.append(document.createTextNode('\n\n')));return container.textContent.replace(/\n{3,}/g,'\n\n').trim();}

async function publishFullBlog(destinations,selector){if(isCarousel())return publishCarousel(destinations);if(publishingAll)return toast('Wait for publication to finish.');capture();const id=user?.id,button=document.querySelector(selector),original=button?.textContent;publishingAll=true;if(button)button.disabled=true;try{

 if(!cloud||!id||id==='local')throw Error('Sign in to a cloud account first.');

 const title=blogFeedText(),markdown=fullArticleText(),archive=!!current.includeBlogLink;if(!title||title.length>300)throw Error('Add a blog title under 300 characters.');if(!markdown.trim()||markdown.length>100000)throw Error('Paste the complete blog into Article text (up to 100,000 characters).');

 const file=await resolveLinkedInMedia();if(file&&(file.size>12*1024*1024||!['image/jpeg','image/png'].includes(file.type)))throw Error('Use a JPG or PNG blog cover up to 12 MB.');
 const cover=archive&&file?{mimeType:file.type,data:await artworkBase64(file)}:null,requestId=archive?await publicationId('creativerelay-public-blog:',id,{title,markdown,cover}):null,articleURL=archive?articlePageURL(requestId):'',postText=blogShareText(title,plainBlogArticle(markdown),articleURL);destinations.forEach(platform=>assertBlogPostFits(postText,platform));

 if(archive){const reader=await fetch(new URL('blog.html',location.href),{cache:'no-store'});if(!reader.ok||!(await reader.text()).includes('id="article"'))throw Error('Deploy the blog collection page before adding its link.');}

 const accounts=await Promise.all(destinations.map(platform=>platform==='LinkedIn'?linkedinRequest({action:'status'}):facebookRequest({action:'status'})));if(user?.id!==id)throw Error('Your signed-in account changed.');



 const posts=destinations.map((platform,i)=>{const account=accounts[i];if(!account.connected)throw Error('Connect '+platform+' in Channels first.');if(platform==='LinkedIn'){linkedinAccount=account;linkedinAccountFor=id;return {platform,name:account.name,caption:postText,file};}const page=account.pages.find(p=>p.page_id===account.pageId);if(!page)throw Error('Select your Facebook Page.');return {platform,name:page.name,pageId:page.page_id,caption:postText,file};});

 if(!await reviewPublicBlog({title,markdown,url:articleURL,posts,file}))return;if(user?.id!==id)throw Error('Your account changed. Review the article again.');const results=[];

 if(archive){if(button)button.textContent='Adding to your blog collectionâ€¦';const article=await blogRequest({action:'publish',userId:id,requestId,title,markdown,cover});if(!article.published||article.url!==articleURL)throw Error('Article publication was not confirmed. Sharing was stopped.');current.publishedBlogURL=articleURL;results.push({platform:'Blog',published:true,url:articleURL});}

 results.push(...posts.map(p=>({platform:p.platform,pending:true})));publicationResults(results);if(button)button.textContent='Posting the full articleâ€¦';await runPublications(posts,post=>submitReviewedPublication(post,id),result=>{if(user?.id!==id)return;results[results.findIndex(p=>p.platform===result.platform)]=result;publicationResults(results);});if(user?.id===id)toast('Full-article publishing results are shown below.');

 }catch(error){if(user?.id===id)toast(error.message);}finally{publishingAll=false;if(button?.isConnected){button.disabled=false;button.textContent=original;}}}

import {installThreads} from './threads.js';
const threadsRequest=installThreads({getCloud:()=>cloud,getUser:()=>user,getView:()=>view,toast});
function validateThreadsDraft(caption,file){if(!caption.trim()||Array.from(caption).length>500)throw Error('Write a Threads caption between 1 and 500 characters.');if(file&&(file.size>12*1024*1024||!['image/jpeg','image/png','video/mp4'].includes(file.type)))throw Error('Threads needs JPG, PNG or MP4 up to 12 MB.');}
async function submitThreads(post,id){const account=await threadsRequest({action:'status'});if(!account.connected||account.memberId!==post.memberId)throw Error('Your Threads account changed. Review again.');const attachment=post.file?{mimeType:post.file.type,data:await artworkBase64(post.file)}:null,requestId=await publicationId('creativerelay-threads-publish:',id,{memberId:post.memberId,caption:post.caption,attachment});if(user?.id!==id)throw Error('Your signed-in account changed.');const pending='creativerelay-threads-pending:'+id;sessionStorage.setItem(pending,requestId);const result=await threadsRequest({action:'publish',requestId,memberId:post.memberId,caption:post.caption,media:attachment});if(result.published)sessionStorage.removeItem(pending);return result;}
async function publishThreads(){if(isCarousel())return publishCarousel(['Threads']);if(publishingAll)return toast('Wait for publication to finish.');capture();const id=user?.id,button=document.querySelector('#publish-threads');publishingAll=true;button.disabled=true;try{const account=await threadsRequest({action:'status'});if(!account.connected)throw Error('Connect Threads in Channels first.');const caption=current.captions.Threads||'',file=await resolveLinkedInMedia();validateThreadsDraft(caption,file);const post={platform:'Threads',name:account.name,memberId:account.memberId,caption,file};if(!await reviewAllPublications([post]))return;let result=await submitThreads(post,id);result=await followMetaPublication('Threads',result,id,update=>{if(user?.id===id)publicationResults([{platform:'Threads',...update}]);});if(user?.id===id){publicationResults([{platform:'Threads',...result}]);toast(result.published?'Published to Threads.':'Threads is processing. Use Continue publication in Channels.');}}catch(error){if(user?.id===id)toast('Threads publishing: '+error.message);}finally{publishingAll=false;if(button.isConnected)button.disabled=false;}}

function isCarousel(){return current.mode==='Carousel'||current.postFormat==='Carousel';}
async function publishCarousel(destinations){
 if(publishingAll)return toast('Wait for publication to finish.');
 capture();const id=user?.id,slides=structuredClone(current.carousel||[]),captions={...current.captions};
 if(!cloud||!id||id==='local')return toast('Sign in to a cloud account first.');
 if(slides.length<2||slides.length>10)return toast('Choose 2â€“10 carousel images first.');
 if(!destinations.length||destinations.some(p=>!['LinkedIn','Instagram','Facebook'].includes(p)))return toast('Select Instagram, Facebook Page or LinkedIn for carousel publishing.');
 publishingAll=true;
 try{
  const posts=[],skipped=[];
  for(const platform of destinations){
   const request=platform==='LinkedIn'?linkedinRequest:platform==='Instagram'?instagramRequest:facebookRequest;
   const account=await request({action:'status'});
   if(!account.connected){if(destinations.length===1)throw Error('Connect '+platform+' in Channels first.');skipped.push({platform,error:'Not sent. Connect this account in Channels first.'});continue;}
   const caption=String(captions[platform]||'').trim(),limit=platform==='Instagram'?2200:platform==='LinkedIn'?3000:10000;
   if(!caption||caption.length>limit)throw Error(platform+' caption must be 1â€“'+limit.toLocaleString()+' characters. Your caption has not been shortened.');
   posts.push({platform,request,caption,slides:platform==='Instagram'?await instagramSlides(slides):slides,pageId:account.pageId,name:account.name||account.pages?.find(p=>p.page_id===account.pageId)?.name});
  }
  if(!posts.length)throw Error('No selected carousel destinations are connected.');
  if(user?.id!==id)throw Error('Your signed-in account changed.');
  const approved=await new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='card';dialog.style.cssText='width:min(720px,94vw);max-height:88vh;overflow:auto';
   dialog.innerHTML='<h2>Review carousel</h2><p>'+slides.length+' slides. Review the actual image copies for each destination below.</p>'+posts.map(post=>'<h3>'+esc(post.platform)+' Â· '+esc(post.name)+'</h3>'+(post.platform==='Instagram'?'<p>Your original slide proportions are sent without added borders or automatic cropping. Instagram may apply its own display rules.</p>':'<p>Original slide proportions are preserved.</p>')+'<div class="carousel-review">'+post.slides.map((slide,i)=>'<figure><img src="'+slideSource(slide)+'" alt="'+esc(post.platform)+' slide '+(i+1)+'"><figcaption>Slide '+(i+1)+' Â· '+slide.width+' Ã— '+slide.height+'</figcaption></figure>').join('')+'</div><p style="white-space:pre-wrap">'+esc(post.caption)+'</p>').join('')+'<p>Each destination publishes separately.</p><div class="row"><button data-confirm>Publish carousel</button><button data-cancel class="secondary">Cancel</button></div>';
   document.body.append(dialog);const finish=value=>{dialog.close();dialog.remove();resolve(value);};dialog.querySelector('[data-confirm]').onclick=()=>finish(true);dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.showModal();
  });
  if(!approved)return;if(user?.id!==id)throw Error('Your account changed. Review again.');
  const results=[...posts.map(post=>({platform:post.platform,queued:true})),...skipped];publicationResults(results);
  await runCarouselQueue(posts,{
   isOwner:()=>user?.id===id,
   onResult:result=>{const index=results.findIndex(item=>item.platform===result.platform);results[index]=result;publicationResults(results);},
   submit:async post=>{
    const media=post.slides.map(({mimeType,data})=>({mimeType,data}));
    const requestId=await publicationId('creativerelay-carousel:',id,{platform:post.platform,name:post.name,pageId:post.pageId,caption:post.caption,slides:media});
    if(user?.id!==id)throw Error('Your account changed. Remaining destinations were not sent.');
    if(post.platform==='Instagram')rememberPendingInstagram(id,requestId);
    const send=()=>post.request({action:'publish',userId:id,requestId,pageId:post.pageId,caption:post.caption,slides:media});
    const result=post.platform==='Instagram'?await recoverPublishResponse(send,{request:post.request,requestId,owner:id,isOwner:owner=>user?.id===owner}):await send();
    if(post.platform==='Instagram'&&result.published)forgetPendingInstagram(id,requestId);
    return {...result,requestId};
   },
   follow:(post,result,onUpdate)=>followMetaPublication(post.platform,result,id,onUpdate)
  });
  if(user?.id===id)toast('Carousel results are shown below. If Instagram is processing, use Continue publication in Channels.');
 }catch(error){toast(error.message);}finally{publishingAll=false;}
}

