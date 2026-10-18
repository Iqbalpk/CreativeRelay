import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {startAuth} from '../src/auth-startup.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const session=id=>({user:{id}});
function authHarness(initial=Promise.resolve({data:{session:null}})){
 const queued=[];let receive;const auth={onAuthStateChange:fn=>(receive=fn,{data:{subscription:{unsubscribe(){}}}}),getSession:()=>initial};
 return {auth,queued,emit:(event,value)=>receive(event,value),schedule:fn=>queued.push(fn),flush:async()=>{while(queued.length)queued.shift()();await tick();}};
}
test('auth callbacks return before session work can acquire the Supabase lock',async()=>{
 const h=authHarness();let locked=true,calls=0;
 startAuth(h.auth,{schedule:h.schedule,onSession(){assert.equal(locked,false);calls++;},onSignedOut(){}});
 assert.equal(h.emit('SIGNED_IN',session('one')),undefined);assert.equal(calls,0);locked=false;await h.flush();assert.equal(calls,1);
});
test('session bootstrap and token refresh do not reload the same workspace',async()=>{
 const h=authHarness(Promise.resolve({data:{session:session('one')}})),changes=[];
 const run=startAuth(h.auth,{schedule:h.schedule,onSession:(_,changed)=>changes.push(changed),onSignedOut(){}});
 h.emit('INITIAL_SESSION',session('one'));await run.ready;await h.flush();
 h.emit('TOKEN_REFRESHED',session('one'));await h.flush();assert.deepEqual(changes,[true,false]);
});
test('sign-out wins over stale getSession and queued sign-in responses',async()=>{
 let finish;const h=authHarness(new Promise(resolve=>{finish=resolve;})),events=[];
 const run=startAuth(h.auth,{schedule:h.schedule,onSession:()=>events.push('in'),onSignedOut:()=>events.push('out')});
 h.emit('SIGNED_IN',session('one'));h.emit('SIGNED_OUT',null);finish({data:{session:session('one')}});await run.ready;await h.flush();assert.deepEqual(events,['out']);
});
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
function workspace(view='Create'){
 let ready;const network=new Promise(resolve=>{ready=resolve;});const counts={render:0,lists:0,library:0};
 const context={user:{id:'one'},view,current:{},drive:{setOwner(){},restore:()=>network,connected:true,listDrafts:async()=>{counts.lists++;return [{id:'saved'}];}},restoreEditor:async()=>{},render:()=>counts.render++,storage:'drive',library:()=>counts.library++,toast(){},media:null,thumb:null,console};
 vm.createContext(context);vm.runInContext(main.slice(main.indexOf('let workspaceLoad='),main.indexOf('let cleanupBlogManager=')),context);
 return {context,counts,ready};
}
test('studio renders before slow Drive access and does not download the library at startup',async()=>{
 const w=workspace();await w.context.load();assert.equal(w.counts.render,1);assert.equal(w.counts.lists,0);w.ready();await tick();assert.equal(w.counts.lists,0);
});
test('Library renders its loading state before remote drafts arrive',async()=>{
 const w=workspace('Library'),job=w.context.load();await tick();assert.equal(w.counts.render,1);assert.equal(w.counts.lists,0);w.ready();await job;assert.equal(w.counts.lists,1);assert.equal(w.counts.library,1);assert.equal(w.context.drafts[0].id,'saved');
});
test('a delayed Drive restore cannot overwrite a replacement draft',async()=>{
 const w=workspace();let reads=0;w.context.current={driveMediaId:'old'};w.context.drive.readAsset=async()=>{reads++;return new Blob();};
 await w.context.load();w.context.current={title:'New draft'};w.ready();await tick();assert.equal(reads,0);assert.equal(w.context.current.title,'New draft');
});
const worker=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function workerHarness(){
 let listener,network=0;const cached=new Response('cached');const context={URL,Response,self:{location:{origin:'https://example.test'},addEventListener:(event,fn)=>{if(event==='fetch')listener=fn;}},caches:{match:async()=>cached,open:async()=>({put:async()=>{}})},fetch:async()=>{network++;return new Response('fresh');}};
 vm.createContext(context);vm.runInContext(worker,context);
 async function load(path){let result;listener({request:{url:'https://example.test'+path,method:'GET'},respondWith:r=>{result=r;},waitUntil(){}});return (await result).text();}
 return {load,network:()=>network};
}
test('repeat visits serve cached hashed scripts without waiting for the network',async()=>{const w=workerHarness();assert.equal(await w.load('/assets/app-1234abcd.js'),'cached');assert.equal(w.network(),0);});
test('HTML checks the network so cached scripts cannot pin the app to an old release',async()=>{const w=workerHarness();assert.equal(await w.load('/index.html'),'fresh');assert.equal(w.network(),1);});
