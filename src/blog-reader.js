import {blogRoute} from './blog-route.js';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import './blog-reader.css';
const params=new URL(location.href).searchParams,root=document.querySelector('#article');let route;try{route=blogRoute(params);}catch(error){root.textContent=error.message;}const id=route?.id,owner=route?.author;
function safeCover(value){try{const url=new URL(value);return url.origin==='https://zymtasgzqcnlzqgqigqt.supabase.co'&&url.pathname.startsWith('/storage/v1/object/public/published-blog-covers/')?url.href:null;}catch{return null;}}
async function gallery(offset=0){
 const query=new URLSearchParams({offset:String(offset)});if(owner)query.set('author',owner);
 const response=await fetch('https://zymtasgzqcnlzqgqigqt.supabase.co/functions/v1/blog?'+query,{credentials:'omit',signal:AbortSignal.timeout(30000)}),data=await response.json();if(!response.ok||data.error)throw Error('Could not load the blog collection.');
 let grid=root.querySelector('.blog-grid');if(!grid){root.replaceChildren();document.title='All blogs · CreativeRelay';const title=document.createElement('h1');title.textContent='All blogs';root.append(title);grid=document.createElement('div');grid.className='blog-grid';root.append(grid);}
 root.querySelector('[data-more]')?.remove();
 for(const blog of data.blogs){const card=document.createElement('a');card.className='blog-card';const link=new URL('blog.html',location.href);link.searchParams.set('id',blog.id);if(owner)link.searchParams.set('author',owner);card.href=link.href;const cover=safeCover(blog.coverURL);if(cover&&blog.coverType!=='video/mp4'){const img=document.createElement('img');img.src=cover;img.alt=blog.title;img.loading='lazy';card.append(img);}const title=document.createElement('h2');title.textContent=blog.title;card.append(title);const details=document.createElement('p');details.textContent=blog.author+' · '+new Date(blog.publishedAt).toLocaleDateString();card.append(details);grid.append(card);}
 if(!grid.children.length){const empty=document.createElement('p');empty.textContent='No published blogs yet.';grid.append(empty);}
 if(data.nextOffset!==null){const more=document.createElement('button');more.dataset.more='';more.textContent='Load more blogs';more.onclick=async()=>{more.disabled=true;try{await gallery(data.nextOffset);}catch(error){more.disabled=false;more.textContent=error.message;}};root.append(more);}
}
async function load(){
 try{
  if(!route)return;
  if(route.kind==='collection'){await gallery();return;}
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||''))throw Error('Article not found.');
  const response=await fetch('https://zymtasgzqcnlzqgqigqt.supabase.co/functions/v1/blog?id='+encodeURIComponent(id),{credentials:'omit',signal:AbortSignal.timeout(30000)}),article=await response.json();
  if(!response.ok||article.error)throw Error('This article is unavailable.');
  document.title=article.title+' · CreativeRelay';root.replaceChildren();
  const back=document.createElement('a');back.href='blog.html'+(owner?'?author='+encodeURIComponent(owner):'');back.textContent='← All blogs';root.append(back);
  const heading=document.createElement('h1');heading.textContent=article.title;root.append(heading);
  const byline=document.createElement('p');byline.className='byline';byline.textContent=article.author+' · '+new Date(article.publishedAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});root.append(byline);
  if(article.coverURL){const cover=new URL(article.coverURL);if(cover.origin==='https://zymtasgzqcnlzqgqigqt.supabase.co'&&cover.pathname.startsWith('/storage/v1/object/public/published-blog-covers/')){const element=document.createElement(article.coverType==='video/mp4'?'video':'img');element.src=cover.href;if(element.tagName==='VIDEO')element.controls=true;else element.alt=article.title;element.className='cover';root.append(element);}}
  const body=document.createElement('article');body.innerHTML=DOMPurify.sanitize(marked.parse(article.markdown),{FORBID_TAGS:['iframe','form','input','button'],FORBID_ATTR:['style']});body.querySelectorAll('a').forEach(a=>{a.rel='noopener noreferrer';});root.append(body);
 }catch(error){root.textContent=error.message;}
}
void load();
