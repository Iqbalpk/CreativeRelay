// Account-scoped unfinished drafts. Credentials never belong in this database.
import {artworkBytes} from './artwork-read.js';
export class EditorRecovery {
 constructor({read,write,onError=()=>{}}={}) { this.read=read;this.write=write;this.onError=onError;this.queue=Promise.resolve();this.pending=null;this.timer=null; }
 save(owner,value) { if(!owner)return;const snapshot=structuredClone({...value,media:null,thumb:null});snapshot.media=value.media||null;snapshot.thumb=value.thumb||null;this.pending={owner,value:snapshot};clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),350); }
 flush() { clearTimeout(this.timer);const item=this.pending;this.pending=null;if(!item)return this.queue;this.queue=this.queue.then(()=>this.write(item.owner,item.value)).catch(error=>this.onError(error));return this.queue; }
 async restore(owner) { await this.flush();return this.read(owner); }
}
export function browserRecovery(onError) {
 let database;
 const open=()=>database||=new Promise((resolve,reject)=>{const request=indexedDB.open('creativerelay-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('unfinished');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 async function transact(owner,value,write) { const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('unfinished',write?'readwrite':'readonly'),store=tx.objectStore('unfinished');const request=write?store.put(value,owner):store.get(owner);tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Draft recovery could not be saved.'));}); }
 return new EditorRecovery({read:async owner=>decodeRecovery(await transact(owner,null,false)),write:async(owner,value)=>transact(owner,await encodeRecovery(value),true),onError});
}
const encodedMedia=new WeakMap();
export async function encodeRecovery(value){
 const result={...value};for(const slot of ['media','thumb']){const file=value[slot];if(!(file instanceof Blob))continue;
  let job=encodedMedia.get(file);if(!job){job=(async()=>({artworkBytes:1,bytes:await artworkBytes(file),type:file.type,name:file.name||'artwork',lastModified:file.lastModified||Date.now()}))();encodedMedia.set(file,job);job.catch(()=>encodedMedia.delete(file));}
  result[slot]=await job;
 }return result;
}
export function decodeRecovery(value){
 if(!value)return value;const result={...value};for(const slot of ['media','thumb']){const item=value[slot];if(item?.artworkBytes===1&&item.bytes instanceof ArrayBuffer)result[slot]=new File([item.bytes],item.name,{type:item.type,lastModified:item.lastModified});}return result;
}
