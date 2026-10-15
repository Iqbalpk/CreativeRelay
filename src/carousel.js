import {fitGeometry,INSTAGRAM_IMAGE_POLICY} from './image-fit.js';
export const CAROUSEL_LIMIT = 10;
export async function prepareSlide(file) {
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose JPG, PNG or WebP images for carousel slides.');
 if(file.size>30*1024*1024)throw Error('Each original image must be under 30 MB.');
 const image=await createImageBitmap(file);
 try {
  const scale=Math.min(1,1440/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  let quality=0.9,blob;
  do {blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=0.1;}while(blob?.size>700000&&quality>=0.3);
  if(!blob||blob.size>1024*1024)throw Error('This image is too detailed to prepare under 1 MB. Resize it first.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read slide.'));reader.readAsDataURL(blob);});
  return {name:file.name,mimeType:'image/jpeg',data,width:canvas.width,height:canvas.height};
 }finally{image.close();}
}
export function slideSource(slide){return 'data:image/jpeg;base64,'+slide.data;}
export async function instagramSlides(slides){
 const output=[];let targetRatio;
 for(const slide of slides){
  const bytes=Uint8Array.from(atob(slide.data),c=>c.charCodeAt(0));
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
  try{
   targetRatio??=Math.max(INSTAGRAM_IMAGE_POLICY.minRatio,Math.min(INSTAGRAM_IMAGE_POLICY.maxRatio,bitmap.width/bitmap.height));
   const plan=fitGeometry(bitmap.width,bitmap.height,targetRatio),canvas=document.createElement('canvas');
   canvas.width=plan.width;canvas.height=plan.height;
   const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,plan.width,plan.height);
   context.drawImage(bitmap,plan.x,plan.y,plan.drawWidth,plan.drawHeight);
   let quality=0.9,blob;
   do{blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=0.1;}while(blob?.size>700000&&quality>=0.3);
   if(!blob||blob.size>1024*1024)throw Error('Could not prepare this Instagram slide under 1 MB.');
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not prepare Instagram slide.'));reader.readAsDataURL(blob);});
   output.push({...slide,data,width:plan.width,height:plan.height,padded:plan.padded});
  }finally{bitmap.close();}
 }
 return output;
}
export async function carouselAnalysisFile(slides){
 if(slides.length<2||slides.length>10)throw Error('Add 2–10 slides before analysing your carousel.');
 const columns=2,tileWidth=600,tileHeight=800,canvas=document.createElement('canvas');
 canvas.width=columns*tileWidth;canvas.height=Math.ceil(slides.length/columns)*tileHeight;
 const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
 for(let i=0;i<slides.length;i++){
  const bytes=Uint8Array.from(atob(slides[i].data),c=>c.charCodeAt(0));
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
  try{
   const left=(i%columns)*tileWidth,top=Math.floor(i/columns)*tileHeight,scale=Math.min(560/bitmap.width,730/bitmap.height),width=bitmap.width*scale,height=bitmap.height*scale;
   context.fillStyle='#121619';context.font='bold 24px sans-serif';context.fillText('Slide '+(i+1)+' of '+slides.length,left+20,top+32);
   context.drawImage(bitmap,left+(tileWidth-width)/2,top+50+(730-height)/2,width,height);
  }finally{bitmap.close();}
 }
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
 if(!blob||blob.size>12*1024*1024)throw Error('Could not prepare a carousel overview under 12 MB.');
 return new File([blob],'carousel-slide-overview.jpg',{type:'image/jpeg'});
}
export function moveSlide(slides,index,offset){const next=index+offset;if(next<0||next>=slides.length)return slides;const copy=slides.slice();[copy[index],copy[next]]=[copy[next],copy[index]];return copy;}
export function mountCarousel({current,escape:esc,changed,toast,owner}){
 const input=document.querySelector('#media');if(!input||current.mode!=='Carousel')return;
 const drop=input.closest('.drop'),container=document.createElement('div');container.className='carousel-editor';
 drop.after(container);
 function refresh(){
  const active=true;drop.hidden=active;document.querySelector('#filename').hidden=active;container.hidden=!active;
  if(!active)return;
  const slides=current.carousel||[];
  container.innerHTML=`<p class="muted">Choose 2–10 image slides. Prepared as JPG, up to 1 MB each. Any image proportions are accepted, including 3:4, tall posters and wide artwork. Instagram copies are fitted without cropping; review any padding before publishing. Slides are saved with your draft.</p><label>Add carousel images<input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Add carousel images"></label><p role="status">${slides.length} / 10 slides · reorder below</p><div class="carousel-slides">${slides.map((slide,i)=>`<article class="carousel-slide"><img src="${slideSource(slide)}" alt="Slide ${i+1}: ${esc(slide.name)}"><strong>Slide ${i+1}</strong><small>${esc(slide.name)}</small><div class="row"><button type="button" class="secondary" data-move="${i}" data-offset="-1" aria-label="Move slide ${i+1} earlier" ${i===0?'disabled':''}>←</button><button type="button" class="secondary" data-move="${i}" data-offset="1" aria-label="Move slide ${i+1} later" ${i===slides.length-1?'disabled':''}>→</button><button type="button" class="secondary" data-remove="${i}" aria-label="Remove slide ${i+1}">Remove</button></div></article>`).join('')}</div><p class="muted">Carousel publishing: Instagram, Facebook Page and LinkedIn. Threads is excluded.</p>`;
  container.querySelector('input').onchange=async event=>{
   const files=[...event.target.files];if(slides.length+files.length>10)return toast('A carousel can contain up to 10 slides.');
   const account=owner();event.target.disabled=true;
   try{const prepared=[];for(const file of files)prepared.push(await prepareSlide(file));if(owner()!==account||!container.isConnected)return;current.carousel=[...slides,...prepared];changed();refresh();}catch(error){toast(error.message);}finally{if(event.target.isConnected)event.target.disabled=false;}
  };
  container.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{current.carousel=moveSlide(current.carousel,Number(button.dataset.move),Number(button.dataset.offset));changed();refresh();});
  container.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{current.carousel=current.carousel.filter((_,i)=>i!==Number(button.dataset.remove));changed();refresh();});
  const preview=document.querySelector('.preview');preview.innerHTML=slides.length?`<div class="carousel-preview">${slides.map((slide,i)=>`<figure><img src="${slideSource(slide)}" alt="Carousel slide ${i+1}"><figcaption>${i+1} / ${slides.length}</figcaption></figure>`).join('')}</div>`:'<p class="muted">Add images to preview your carousel.</p>';
 }
 refresh();
}
