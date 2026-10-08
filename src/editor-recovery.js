// Account-scoped unfinished drafts. Credentials never belong in this database.
export class EditorRecovery {
 constructor({read,write,onError=()=>{}}={}) { this.read=read;this.write=write;this.onError=onError;this.queue=Promise.resolve();this.pending=null;this.timer=null; }
 save(owner,value) { if(!owner)return;this.pending={owner,value:structuredClone(value)};clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),350); }
 flush() { clearTimeout(this.timer);const item=this.pending;this.pending=null;if(!item)return this.queue;this.queue=this.queue.then(()=>this.write(item.owner,item.value)).catch(error=>this.onError(error));return this.queue; }
 async restore(owner) { await this.flush();return this.read(owner); }
}
export function browserRecovery(onError) {
 let database;
 const open=()=>database||=new Promise((resolve,reject)=>{const request=indexedDB.open('creativerelay-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('unfinished');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 async function transact(owner,value,write) { const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('unfinished',write?'readwrite':'readonly'),store=tx.objectStore('unfinished');const request=write?store.put(value,owner):store.get(owner);tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Draft recovery could not be saved.'));}); }
 return new EditorRecovery({read:owner=>transact(owner,null,false),write:(owner,value)=>transact(owner,value,true),onError});
}
