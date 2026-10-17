import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverPublishResponse} from '../src/pending-publication.js';
const options={requestId:'same-id',owner:'owner',isOwner:()=>true};
test('lost carousel response checks same request without resending',async()=>{
 let sends=0;const calls=[];
 const result=await recoverPublishResponse(async()=>{sends++;throw Error('Failed to send a request to the Edge Function');},{...options,request:async body=>{calls.push(body);return {published:true};}});
 assert.equal(sends,1);assert.deepEqual(calls,[{action:'continue',requestId:'same-id',userId:'owner'}]);assert.equal(result.published,true);
});
test('validation errors never invoke continuation',async()=>{
 let checks=0;await assert.rejects(recoverPublishResponse(async()=>{throw Error('Invalid image');},{...options,request:async()=>checks++}),/Invalid image/);assert.equal(checks,0);
});
test('unavailable recovery remains explicitly unconfirmed',async()=>{
 await assert.rejects(recoverPublishResponse(async()=>{throw Error('Failed to fetch');},{...options,request:async()=>{throw Error('not found');}}),/unconfirmed/);
});
test('account change prevents recovery',async()=>{
 let checks=0;await assert.rejects(recoverPublishResponse(async()=>{throw Error('Failed to fetch');},{...options,isOwner:()=>false,request:async()=>checks++}));assert.equal(checks,0);
});

import {runCarouselQueue,followPending,readPendingInstagram,rememberPendingInstagram,forgetPendingInstagram} from '../src/pending-publication.js';
test('Instagram preparation and polling cannot hold up Facebook carousel submission',async()=>{
 const sent=[];let finish;const wait=new Promise(resolve=>{finish=resolve;});
 const job=runCarouselQueue([{platform:'LinkedIn'},{platform:'Instagram'},{platform:'Facebook'}],{
  submit:async post=>{sent.push(post.platform);if(post.platform==='Instagram')return {pending:true,requestId:'ig'};return {published:true};},
  follow:async()=>{await wait;return {published:true};}
 });
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(sent,['LinkedIn','Facebook','Instagram']);finish();await job;
});
test('one destination error does not stop remaining carousel destinations',async()=>{
 const sent=[];const results=await runCarouselQueue([{platform:'Instagram'},{platform:'Facebook'}],{
  submit:async post=>{sent.push(post.platform);if(post.platform==='Facebook')throw Error('lost response');return {published:true};},follow:()=>{}
 });
 assert.deepEqual(sent,['Facebook','Instagram']);assert.equal(results.find(x=>x.platform==='Instagram').published,true);
});
test('carousel upload stops on account change',async()=>{
 let same=true;const sent=[];await runCarouselQueue([{platform:'LinkedIn'},{platform:'Facebook'}],{isOwner:()=>same,
  submit:async post=>{sent.push(post.platform);same=false;return {published:true};},follow:()=>{}});
 assert.deepEqual(sent,['LinkedIn']);
});
test('temporary mobile network loss retries status only',async()=>{
 let checks=0;const result=await followPending({pending:true,requestId:'same-id'},{...options,sleep:async()=>{},checks:3,request:async body=>{
  assert.equal(body.action,'continue');assert.equal(body.requestId,'same-id');if(++checks===1)throw Error('Failed to fetch');return {published:true};
 }});assert.equal(checks,2);assert.equal(result.published,true);
});
test('pending request survives session closure, isolates owners and clears only matching ID',()=>{
 const store=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
 globalThis.localStorage=store();globalThis.sessionStorage=store();
 rememberPendingInstagram('one','original');globalThis.sessionStorage=store();
 assert.equal(readPendingInstagram('one'),'original');assert.equal(readPendingInstagram('two'),null);
 rememberPendingInstagram('one','newer');forgetPendingInstagram('one','original');assert.equal(readPendingInstagram('one'),'newer');
 forgetPendingInstagram('one','newer');assert.equal(readPendingInstagram('one'),null);
 delete globalThis.localStorage;delete globalThis.sessionStorage;
});
