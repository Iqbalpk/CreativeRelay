// Read the bytes while the picker still grants access. Retaining a File handle
// alone does not guarantee its Photos/iCloud backing remains readable later.
const copies=new WeakMap(),encodings=new WeakMap();
const unavailable=()=>Error('This device can no longer read the attached artwork. Select the photo or video again above; your captions are safe. Nothing was sent for this attempt.');
async function readBytes(blob){
 try{return await blob.arrayBuffer();}catch(first){
  if(typeof FileReader!=='function')throw first;
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||first);reader.onabort=()=>reject(first);reader.readAsArrayBuffer(blob);});
 }
}
async function copyParts(file){
 const parts=[];
 try{for(let offset=0;offset<file.size;offset+=512*1024){const bytes=await readBytes(file.slice(offset,offset+512*1024));if(bytes.byteLength!==Math.min(512*1024,file.size-offset))throw Error('Incomplete range');parts.push(bytes);}return parts;}
 catch(error){
  // Some Photos-backed/restored files fail range reads while a whole-file read
  // still works. Limit that fallback to the prepared publishing size.
  if(file.size>12*1024*1024)throw error;
  try{const bytes=await readBytes(file);if(bytes.byteLength===file.size)return [bytes];}catch{}
  const url=URL.createObjectURL(file);
  try{const response=await fetch(url);if(!response.ok)throw error;const bytes=await response.arrayBuffer();if(bytes.byteLength!==file.size)throw error;return [bytes];}finally{URL.revokeObjectURL(url);}
 }
}
export async function retainArtwork(file){
 if(!(file instanceof Blob))throw unavailable();
 if(copies.has(file))return copies.get(file);
 const job=(async()=>{if(!file.size)throw unavailable();const parts=await copyParts(file);const copy=typeof File==='function'?new File(parts,file.name||'artwork',{type:file.type,lastModified:file.lastModified||Date.now()}):new Blob(parts,{type:file.type});copies.set(copy,Promise.resolve(copy));return copy;})();
 copies.set(file,job);try{return await job;}catch{copies.delete(file);throw unavailable();}
}
export async function readableArtwork(file,backup){
 try{if(file instanceof Blob)return await retainArtwork(file);}catch(error){if(!backup)throw error;}
 if(backup)return retainArtwork(await backup());
 throw unavailable();
}
export async function artworkBytes(file){return readBytes(await retainArtwork(file));}
export function artworkBase64(file){
 if(encodings.has(file))return encodings.get(file);
 const job=(async()=>{const copy=await retainArtwork(file),parts=[];
  // Multiple of three: each full chunk has no Base64 padding.
  for(let offset=0;offset<copy.size;offset+=196608){const bytes=new Uint8Array(await readBytes(copy.slice(offset,offset+196608)));let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);parts.push(btoa(binary));}
  return parts.join('');
 })();encodings.set(file,job);job.catch(()=>encodings.delete(file));return job;
}
