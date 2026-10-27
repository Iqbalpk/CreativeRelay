import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanGeneratedText} from '../src/caption-style.js';
import {validateInput,buildGeminiRequest,parseGeminiOutput} from '../supabase/functions/generate/gemini.mjs';
test('hashtags become inline words while standalone hashtag and keyword blocks disappear',()=>{
 assert.equal(cleanGeneratedText('My #BrandDesign process.\n\n#Design #Portfolio\nKeywords for reach: branding, design'),'My Brand Design process.');
 assert.equal(cleanGeneratedText('# Article heading\nC# code and https://example.com/page#section\nOur #تصميم work'), '# Article heading\nC# code and https://example.com/page#section\nOur تصميم work');
});
test('generation and refinement share the no-hashtag policy and omit keyword schema',()=>{
 for(const refinement of [null,{instruction:'Rewrite it',caption:'Old #Design',title:'Old'}]){
 const request=buildGeminiRequest(validateInput({title:'Current project',platforms:['LinkedIn'],refinement}));
 assert.match(request.systemInstruction.parts[0].text,/use no hashtags/);assert.equal(request.generationConfig.responseJsonSchema.properties.keywords,undefined);
 }
});
test('provider hashtag drift is cleaned for all channels without returning keyword metadata',()=>{
 const platforms=['LinkedIn','Instagram','Facebook','X','Blog'];const output={captions:Object.fromEntries(platforms.map(p=>[p,'A visual identity built around thoughtful typography.\n\n#Branding #Design'])),titles:Object.fromEntries(platforms.map(p=>[p,'A #BrandDesign process'])),keywords:['unwanted']};
 const result=parseGeminiOutput({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]},platforms);
 for(const p of platforms){assert.equal(result.captions[p],'A visual identity built around thoughtful typography.');assert.equal(result.titles[p],'A Brand Design process');}assert.deepEqual(result.keywords,[]);
});
