import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import esbuild from 'esbuild';
import {decodeMedia} from '../supabase/functions/instagram/media-base64.mjs';
test('chunked decoder accepts the maximum 12 MiB without intermediate number arrays',()=>{
 const input=Buffer.alloc(12*1024*1024,73),encoded=input.toString('base64'),decoded=decodeMedia(encoded);assert.equal(decoded.length,input.length);assert.equal(Buffer.compare(input,decoded),0);
});
test('decoder rejects invalid content, internal padding, malformed lengths and oversized payloads',()=>{
 for(const value of ['bad','!!!!','AA=A','AA==AAAA','AAAA\nAAA'])assert.throws(()=>decodeMedia(value));assert.throws(()=>decodeMedia('AAAA',2));
 assert.deepEqual([...decodeMedia('AQI=')],[1,2]);assert.deepEqual([...decodeMedia('AQ==')],[1]);
});
test('actual Threads validator accepts a 9 MiB MP4 with the bounded decoder',async()=>{
 const source=await readFile(new URL('../supabase/functions/threads/index.ts',import.meta.url),'utf8');
 const part=source.slice(source.indexOf('export function validateThreadsPost'),source.indexOf('export async function graph')).replace('export ','');
 const validate=new Function('uuid','decodeMedia',part+';return validateThreadsPost;')(value=>/^[a-f0-9-]{36}$/.test(value),decodeMedia);
 const file=Buffer.alloc(9*1024*1024);file.write('ftyp',4);const result=validate({requestId:'11111111-1111-4111-8111-111111111111',caption:'Reviewed caption',media:{mimeType:'video/mp4',data:file.toString('base64')}});assert.equal(result.media.bytes.length,file.length);
});
test('Instagram check during another worker publishing remains pending and never republishes',async()=>{
 const source=await readFile(new URL('../supabase/functions/instagram/index.ts',import.meta.url),'utf8');
 const part=source.slice(source.indexOf('async function advance('),source.indexOf('// Gateway legacy JWT verification'));
 const {code}=await esbuild.transform(part,{loader:'ts'});let reads=0;
 const advance=new Function('attemptFilter',code+';return advance;')(query=>query);
 const db={from(){return {select(){return {single:async()=>{reads++;return {data:{status:'publishing'}};}};}};}};
 const result=await advance(db,{},'owner','same-id');assert.deepEqual(result,{pending:true,requestId:'same-id',stage:'publishing'});assert.equal(reads,1);
});

test('LinkedIn and Facebook deployed validators accept maximum prepared video without full-input regex arrays',async()=>{
 const bytes=Buffer.alloc(12*1024*1024,1);bytes.write('ftyp',4);const payload={pageId:'1398146120041698',requestId:'11111111-1111-4111-8111-111111111111',caption:'Current project',media:{mimeType:'video/mp4',data:bytes.toString('base64')}};
 for(const name of ['dynamic-endpoint','facebook']){
  const source=await readFile(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8');
  const start=source.indexOf('function validateSlides'),end=source.indexOf('function postBody',start);
  const slice=name==='dynamic-endpoint'?source.slice(start,end):source.slice(start,source.indexOf('async function',source.indexOf('function validatePost')));
  const {code}=await esbuild.transform(slice,{loader:'ts'});const validate=new Function('decodeMedia',code+';return validatePost;')(decodeMedia);
  assert.ok(validate(payload).media);assert.throws(()=>validate({...payload,media:{mimeType:'video/mp4',data:'!!!!'}}));
 }
});
