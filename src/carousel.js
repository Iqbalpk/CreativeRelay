export const CAROUSEL_LIMIT = 10;
export async function prepareSlide(file) {
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose JPG, PNG or WebP images for carousel slides.');
 if(file.size>30*1024*1024)throw Error('Each original image must be under 30 MB.');
 const image=await createImageBitmap(file);
 try {
  const ratio=image.width/image.height;
  if(ratio<0.8||ratio>1.91)throw Error('Use images between portrait 4:5 and landscape 1.91:1. Resize this slide before uploading.');
  const scale=Math.min(1,1440/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  let quality=0.9,blob;
  do {blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=0.1;}while(blob?.size>700000&&quality>=0.3);
  if(!blob||blob.size>1024*1024)throw Error('This image is too detailed to prepare under 1 MB. Resize it first.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read slide.'));reader.readAsDataURL(blob);});
  return {name:file.name,mimeType:'image/jpeg',data,width:canvas.width,height:canvas.height};
 }finally{image.close();}
}
export function slideSource(slide){return 'data:image/jpeg;base64,'+slide.data;}
export function moveSlide(slides,index,offset){const next=index+offset;if(next<0||next>=slides.length)return slides;const copy=slides.slice();[copy[index],copy[next]]=[copy[next],copy[index]];return copy;}
export function mountCarousel({current,escape:esc,changed,toast,owner}){
 const input=document.querySelector('#media');if(!input||current.mode!=='Carousel')return;
 const drop=input.closest('.drop'),container=document.createElement('div');container.className='carousel-editor';
 drop.after(container);
 function refresh(){
  const active=true;drop.hidden=active;document.querySelector('#filename').hidden=active;container.hidden=!active;
  if(!active)return;
  const slides=current.carousel||[];
  container.innerHTML=`<p class="muted">Choose 2–10 image slides. Prepared as JPG, up to 1 MB each. Keep the same aspect ratio across slides; Instagram may crop to match the first slide. Slides are saved with your draft.</p><label>Add carousel images<input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Add carousel images"></label><p role="status">${slides.length} / 10 slides · reorder below</p><div class="carousel-slides">${slides.map((slide,i)=>`<article class="carousel-slide"><img src="${slideSource(slide)}" alt="Slide ${i+1}: ${esc(slide.name)}"><strong>Slide ${i+1}</strong><small>${esc(slide.name)}</small><div class="row"><button type="button" class="secondary" data-move="${i}" data-offset="-1" aria-label="Move slide ${i+1} earlier" ${i===0?'disabled':''}>←</button><button type="button" class="secondary" data-move="${i}" data-offset="1" aria-label="Move slide ${i+1} later" ${i===slides.length-1?'disabled':''}>→</button><button type="button" class="secondary" data-remove="${i}" aria-label="Remove slide ${i+1}">Remove</button></div></article>`).join('')}</div><p class="muted">Carousel publishing: Instagram, Facebook Page and LinkedIn. Threads is excluded.</p>`;
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
