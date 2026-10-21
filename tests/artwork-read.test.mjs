import test from 'node:test';
import assert from 'node:assert/strict';
import {retainArtwork,readableArtwork,artworkBase64} from '../src/artwork-read.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('selected bytes survive loss of access to the original picker file',async()=>{
 let available=true,reads=0;const original=new File([Buffer.alloc(700000,81)],'phone.mp4',{type:'video/mp4'}),slice=original.slice.bind(original);
 original.slice=(...args)=>{reads++;if(!available)return {arrayBuffer:async()=>{throw Error('NotReadableError');}};return slice(...args);};
 const copy=await retainArtwork(original);available=false;assert.equal(copy.name,'phone.mp4');assert.equal(copy.type,'video/mp4');assert.equal(copy.size,700000);
 const first=artworkBase64(copy);assert.equal(first,artworkBase64(copy),'publishers share one read');assert.deepEqual(Buffer.from(await first,'base64'),Buffer.alloc(700000,81));assert.equal(reads,2);
});
test('unreadable old attachment can recover from its private saved asset',async()=>{
 const broken=new Blob(['old']);broken.slice=()=>({arrayBuffer:async()=>{throw Error('NotReadableError');}});let downloads=0;
 const copy=await readableArtwork(broken,async()=>{downloads++;return new File(['saved artwork'],'saved.jpg',{type:'image/jpeg'});});assert.equal(await copy.text(),'saved artwork');assert.equal(downloads,1);
});
test('unrecoverable attachment fails before sending and does not cache a failed read',async()=>{
 const file=new Blob(['x']);let fail=true;file.slice=()=>({arrayBuffer:async()=>{if(fail)throw Error('gone');return new Uint8Array([120]).buffer;}});
 await assert.rejects(artworkBase64(file),/Select the photo or video again/);fail=false;assert.equal(await artworkBase64(file),'eA==');
});
test('base64 chunk boundaries preserve bytes at every padding length and maximum upload size',async()=>{
 for(const size of [1,2,3,196607,196608,196609,12*1024*1024]){const bytes=Buffer.alloc(size,167);assert.equal(await artworkBase64(new Blob([bytes])),bytes.toString('base64'));}
});
test('actual combined review stops an unreadable file before any dialog or send',async()=>{
 const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');const start=main.indexOf('async function reviewAllPublications('),source=main.slice(start,main.indexOf('\n',start));let dialogs=0;
 const state={artworkBase64,document:{createElement(){dialogs++;throw Error('Should not open review');}},URL};vm.createContext(state);vm.runInContext(source,state);
 const broken=new Blob(['x']);broken.slice=()=>({arrayBuffer:async()=>{throw Error('Lost Photos access');}});
 await assert.rejects(state.reviewAllPublications([{platform:'LinkedIn',file:broken},{platform:'Facebook',file:broken}]),/Select the photo or video again/);assert.equal(dialogs,0);
});
