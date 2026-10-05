import {marked} from 'marked';
import DOMPurify from 'dompurify';
import './blog-reader.css';
const root=document.querySelector('#article'),id=new URL(location.href).searchParams.get('id');
async function load(){
 try{
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||''))throw Error('Article not found.');
  const response=await fetch('https://zymtasgzqcnlzqgqigqt.supabase.co/functions/v1/blog?id='+encodeURIComponent(id),{credentials:'omit',signal:AbortSignal.timeout(30000)}),article=await response.json();
  if(!response.ok||article.error)throw Error('This article is unavailable.');
  document.title=article.title+' · CreativeRelay';root.replaceChildren();
  const back=document.createElement('a');back.href='./';back.textContent='CreativeRelay';root.append(back);
  const heading=document.createElement('h1');heading.textContent=article.title;root.append(heading);
  const byline=document.createElement('p');byline.className='byline';byline.textContent=article.author+' · '+new Date(article.publishedAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});root.append(byline);
  if(article.coverURL){const cover=new URL(article.coverURL);if(cover.origin==='https://zymtasgzqcnlzqgqigqt.supabase.co'&&cover.pathname.startsWith('/storage/v1/object/public/published-blog-covers/')){const element=document.createElement(article.coverType==='video/mp4'?'video':'img');element.src=cover.href;if(element.tagName==='VIDEO')element.controls=true;else element.alt=article.title;element.className='cover';root.append(element);}}
  const body=document.createElement('article');body.innerHTML=DOMPurify.sanitize(marked.parse(article.markdown),{FORBID_TAGS:['iframe','form','input','button'],FORBID_ATTR:['style']});body.querySelectorAll('a').forEach(a=>{a.rel='noopener noreferrer';});root.append(body);
 }catch(error){root.textContent=error.message;}
}
void load();
