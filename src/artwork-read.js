// Read the bytes while the picker still grants access. Retaining a File handle
// alone does not guarantee its Photos/iCloud backing remains readable later.
const copies=new WeakMap(),encodings=new WeakMap();
const unavailable=()=>Error('This device can no longer read the attached artwork. Select the photo or video again above; your captions are safe. Nothing was sent for this attempt.');
export async function retainArtwork(file){
 if(!(file instanceof Blob))throw unavailable();
 if(copies.has(file))return copies.get(file);
 const job=(async()=>{const parts=[];for(let offset=0;offset<file.size;offset+=512*1024){const bytes=await file.slice(offset,offset+512*1024).arrayBuffer();if(bytes.byteLength!==Math.min(512*1024,file.size-offset))throw unavailable();parts.push(bytes);}if(!file.size)throw unavailable();const copy=typeof File==='function'?new File(parts,file.name||'artwork',{type:file.type,lastModified:file.lastModified||Date.now()}):new Blob(parts,{type:file.type});copies.set(copy,Promise.resolve(copy));return copy;})();
 copies.set(file,job);try{return await job;}catch{copies.delete(file);throw unavailable();}
}
export async function readableArtwork(file,backup){
 try{if(file instanceof Blob)return await retainArtwork(file);}catch(error){if(!backup)throw error;}
 if(backup)return retainArtwork(await backup());
 throw unavailable();
}
export function artworkBase64(file){
 if(encodings.has(file))return encodings.get(file);
 const job=(async()=>{const copy=await retainArtwork(file),parts=[];
  // Multiple of three: each full chunk has no Base64 padding.
  for(let offset=0;offset<copy.size;offset+=196608){const bytes=new Uint8Array(await copy.slice(offset,offset+196608).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);parts.push(btoa(binary));}
  return parts.join('');
 })();encodings.set(file,job);job.catch(()=>encodings.delete(file));return job;
}
