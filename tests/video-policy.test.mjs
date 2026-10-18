import test from 'node:test';
import assert from 'node:assert/strict';
import {videoPlan,preparedVideoNote,VIDEO_PUBLISH_LIMIT} from '../src/video-policy.js';
test('114-second 720p source receives an upload plan instead of duration rejection',()=>{
 const p=videoPlan(114.375,1280,720);assert.equal(p.width,960);assert.equal(p.height,540);assert.equal(p.frameRate,24);assert.ok((p.bitrate+p.audioBitrate)*114.375/8<VIDEO_PUBLISH_LIMIT);
});
test('adaptive plans preserve portrait and square proportions and never upscale',()=>{
 for(const [w,h] of [[720,1280],[720,720],[320,180]]){const p=videoPlan(114.375,w,h);assert.ok(p.width<=w&&p.height<=h);assert.ok(Math.abs(p.width/p.height-w/h)<.01);}
});
test('short HD clips retain 1080p and excessively long high-bitrate sources fail clearly',()=>{
 const p=videoPlan(30,3840,2160);assert.equal(p.width,1920);assert.equal(p.height,1080);assert.equal(p.frameRate,30);assert.throws(()=>videoPlan(900,1920,1080),/too long/);
});
test('prepared copy explains actual dimensions and original remains unchanged',()=>{
 const text=preparedVideoNote({size:50909294},{size:9000000},true,{width:960,height:540,frameRate:24});assert.match(text,/960 × 540 \/ 24 fps/);assert.match(text,/original in Photos is unchanged/i);
});
