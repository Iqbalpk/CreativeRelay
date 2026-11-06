import test from 'node:test';
import assert from 'node:assert/strict';
import {requestGemini,busyError} from '../supabase/functions/generate/provider-request.mjs';
import {readFile} from 'node:fs/promises';
import esbuild from 'esbuild';
test('temporary overload is retried with increasing delays then succeeds',async()=>{
 let calls=0;const delays=[],response=await requestGemini('https://provider.invalid',{body:'same draft'},{fetcher:async(url,options)=>{assert.equal(options.body,'same draft');return new Response('{}',{status:++calls<3?503:200});},sleep:async ms=>delays.push(ms),now:()=>0,random:()=>0});
 assert.equal(response.status,200);assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);
});
test('permanent errors and quota errors are not retried',async()=>{
 for(const status of [400,401,403,429]){let calls=0;assert.equal((await requestGemini('https://provider.invalid',{}, {fetcher:async()=>{calls++;return new Response('{}',{status});},sleep:async()=>assert.fail('no retry')})).status,status);assert.equal(calls,1);}
});
test('persistent overload stops after three attempts and timeout is actionable',async()=>{
 let calls=0;const response=await requestGemini('https://provider.invalid',{}, {fetcher:async()=>{calls++;return new Response('{}',{status:503});},sleep:async()=>{},now:()=>0,random:()=>0});assert.equal(response.status,503);assert.equal(calls,3);assert.equal(busyError().status,503);assert.match(busyError().message,/draft is unchanged/);
 await assert.rejects(requestGemini('https://provider.invalid',{}, {fetcher:async()=>{throw new DOMException('timeout','TimeoutError');}}),e=>e.status===503);
});
test('retry-after is bounded and no retry starts beyond the deadline',async()=>{
 let clock=0,calls=0;const delays=[];await requestGemini('https://provider.invalid',{}, {fetcher:async()=>{calls++;clock+=24000;return new Response('{}',{status:503,headers:{'Retry-After':'999'}});},sleep:async ms=>{delays.push(ms);clock+=ms;},now:()=>clock,random:()=>0});assert.equal(calls,2);assert.deepEqual(delays,[8000]);
});
test('actual handler returns temporary 503 after retries and consumes app quota only once',async()=>{
 let handler,quota=0,fetches=0;const source=(await readFile(new URL('../supabase/functions/generate/index.ts',import.meta.url),'utf8')).replace(/^import .*;\s*$/gm,'');const {code}=await esbuild.transform(source,{loader:'ts'});
 const client=()=>({auth:{getUser:async()=>({data:{user:{id:'test-owner'}}})},rpc:async()=>{quota++;return {data:true};}});
 new Function('createClient','validateInput','buildGeminiRequest','parseGeminiOutput','requestGemini','busyError','Deno',code)(client,x=>({...x,platforms:['LinkedIn']}),()=>({}),()=>assert.fail('must not parse a failed response'),(url,options)=>requestGemini(url,options,{fetcher:async()=>{fetches++;return new Response('{}',{status:503});},sleep:async()=>{},now:()=>0,random:()=>0}),busyError,{env:{get:()=> 'test-setting'},serve:fn=>handler=fn});
 const response=await handler(new Request('https://app.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({title:'Current draft'})}));assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'20');assert.equal(quota,1);assert.equal(fetches,3);assert.match((await response.json()).error,/draft is unchanged/);
});
