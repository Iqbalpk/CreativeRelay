import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRecovery,decodeRecovery} from '../src/editor-recovery.js';
test('draft recovery persists plain video bytes and restores a fresh File after reload',async()=>{
 const source=new File(['MP4 bytes'],'iphone-upload.mp4',{type:'video/mp4'}),draft={current:{captions:{Threads:'Keep my caption'}},media:source,thumb:null};
 const encoded=await encodeRecovery(draft);assert.ok(encoded.media.bytes instanceof ArrayBuffer);assert.equal(encoded.media instanceof Blob,false);
 const persisted=structuredClone(encoded);const reopened=decodeRecovery(persisted);assert.ok(reopened.media instanceof File);assert.equal(reopened.media.name,source.name);assert.equal(reopened.media.type,'video/mp4');assert.equal(await reopened.media.text(),'MP4 bytes');assert.equal(reopened.current.captions.Threads,'Keep my caption');
 assert.equal((await encodeRecovery(draft)).media,encoded.media,'typing does not reread video bytes');
});
test('existing Blob-based recovery records remain readable',()=>{const file=new Blob(['legacy']);assert.equal(decodeRecovery({media:file}).media,file);});
