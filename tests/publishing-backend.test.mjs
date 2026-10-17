import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import esbuild from 'esbuild';
import {mapSlides,publicationHistory} from '../supabase/functions/instagram/publication-utils.mjs';
test('parallel slide preparation preserves order and waits for active uploads on failure',async()=>{
 let active=0,max=0,finished=0;
 const result=await mapSlides([1,2,3,4,5],async value=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,6-value));active--;return value*2;});
 assert.deepEqual(result,[2,4,6,8,10]);assert.equal(max,3);
 await assert.rejects(mapSlides([1,2,3,4],async value=>{await new Promise(r=>setTimeout(r,value));finished++;if(value===1)throw Error('bad slide');}),/bad slide/);
 assert.equal(finished,3);
});
test('recent publication metadata is scoped to owner and does not expose payloads',async()=>{
 const calls=[];const query={select:v=>(calls.push(['select',v]),query),eq:(k,v)=>(calls.push([k,v]),query),order:()=>query,limit:async()=>({data:[{request_id:'id',status:'published',post_id:'123_456',created_at:'now',token_cipher:'secret'}]})};
 const result=await publicationHistory({from:t=>(calls.push(['table',t]),query)},'owner','Facebook');
 assert.ok(calls.some(c=>c[0]==='user_id'&&c[1]==='owner'));assert.equal(result.attempts[0].url,'https://www.facebook.com/123_456');assert.ok(!JSON.stringify(result).includes('secret'));
});
test('Instagram acknowledges accepted artwork before preparation completes, then publishes once in background',async()=>{
 let release;const bucketWait=new Promise(resolve=>{release=resolve;});let handler,row=null,publishes=0;const tasks=[];
 const secret='unit-test-only';
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('CreativeRelay Instagram tokens:'+secret));
 const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('fake-token')));
 const b64=value=>Buffer.from(value).toString('base64');
 const connection={username:'test-account',instagram_id:'123',expires_at:'2099-01-01',token_cipher:b64(iv)+'.'+b64(bytes)};
 class Query{
  constructor(table){this.table=table;this.filters={};}
  select(){return this;}eq(k,v){this.filters[k]=v;return this;}maybeSingle(){return this;}single(){return this;}
  insert(data){this.inserted=data;return this;}update(data){this.updated=data;return this;}
  then(resolve,reject){return Promise.resolve(this.run()).then(resolve,reject);}
  run(){if(this.table==='instagram_connections')return {data:connection};
   if(this.inserted){if(row)return {error:{code:'23505'}};row={...this.inserted,created_at:new Date().toISOString()};return {error:null};}
   if(this.updated){if(this.filters.status&&row.status!==this.filters.status)return {data:[]};Object.assign(row,this.updated);return {data:[{request_id:row.request_id}]};}
   return {data:row};
  }
 }
 const client={auth:{getUser:async token=>({data:{user:token==='valid'?{id:'owner'}:null},error:token==='valid'?null:{}})},from:t=>new Query(t),storage:{getBucket:()=>bucketWait,from:()=>({upload:async()=>({}),createSignedUrl:async()=>({data:{signedUrl:'https://example.test/private.jpg'}}),remove:async()=>({})})}};
 const source=(await readFile(new URL('../supabase/functions/instagram/index.ts',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
 const {code}=await esbuild.transform(source,{loader:'ts',format:'esm'});
 const savedRuntime=globalThis.EdgeRuntime;globalThis.EdgeRuntime={waitUntil:task=>tasks.push(task)};
 let childId=200;
 const fetcher=async(url,options)=>{
  let data;if(String(url).includes('/media_publish')){publishes++;data={id:'999'};}
  else if(options.method==='POST')data={id:String(++childId)};
  else data=String(url).includes('permalink')?{permalink:'https://www.instagram.com/p/test/'}:{status_code:'FINISHED'};
  return new Response(JSON.stringify(data),{status:200});
 };
 try{
  new Function('Deno','createClient','publicationHistory','mapSlides','fetch',code)({env:{get:()=>secret},serve:fn=>{handler=fn;}},()=>client,publicationHistory,mapSlides,fetcher);
  const body={action:'publish',userId:'owner',requestId:'11111111-1111-4111-8111-111111111111',caption:'Caption',slides:Array.from({length:10},()=>({mimeType:'image/jpeg',data:'/9j/AA=='}))};
  const request=payload=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify(payload)});
  const response=await handler(request(body));assert.equal(response.status,202);assert.equal((await response.json()).pending,true);assert.equal(publishes,0);
  release({data:{public:false}});await Promise.all(tasks);assert.equal(row.status,'published');assert.equal(publishes,1);
  const retry=await handler(request(body));assert.equal((await retry.json()).published,true);assert.equal(publishes,1);
  assert.equal((await handler(request({action:'history',userId:'another-owner'}))).status,401);
  assert.equal((await handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({action:'history',userId:'owner'})}))).status,401);
 }finally{globalThis.EdgeRuntime=savedRuntime;}
});
