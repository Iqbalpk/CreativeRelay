import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCaptionRefinement} from '../src/caption-refinement.js';
import {validateInput,buildGeminiRequest} from '../supabase/functions/generate/gemini.mjs';

test('Work generation excludes leftover article; Blog retains its article',()=>{
 for(const contentType of ['Work','Carousel'])assert.equal(validateInput({title:'New work',contentType,markdown:'OLD STORY',platforms:['LinkedIn']}).markdown,'');
 assert.equal(validateInput({title:'Article',contentType:'Blog',markdown:'Article text',platforms:['LinkedIn']}).markdown,'Article text');
 const input=validateInput({title:'Current work',platforms:['LinkedIn'],refinement:{instruction:'Change the title',title:'Before',caption:'Current caption',history:[]}});
 assert.equal(JSON.parse(buildGeminiRequest(input).contents[0].parts[0].text).refinement.instruction,'Change the title');
});
test('chat reviews suggestions, applies explicitly, and rejects edits made during generation',async()=>{
 const nodes=new Map(),root={isConnected:true,querySelector(s){if(!nodes.has(s))nodes.set(s,{value:'',append(){},replaceChildren(){}});return nodes.get(s);}},q=s=>root.querySelector(s);globalThis.document={createElement:()=>({})};let identity='one',resolve,applied=null;const notices=[];
 mountCaptionRefinement({root,context:()=>({identity,draftTitle:'Original',draftCaption:'Original caption'}),request:()=>new Promise(r=>resolve=r),apply:r=>applied=r,notice:t=>notices.push(t)});
 q('[data-instruction]').value='Shorter';let pending=q('[data-send]').onclick();resolve({title:'New',caption:'Shorter caption'});await pending;
 assert.equal(applied,null);assert.equal(q('[data-caption]').value,'Shorter caption');q('[data-apply]').onclick();assert.equal(applied.title,'New');
 q('[data-instruction]').value='Again';pending=q('[data-send]').onclick();identity='different';resolve({title:'Stale',caption:'Stale'});await pending;assert.ok(notices.some(t=>t.includes('draft changed')));assert.equal(applied.title,'New');
 delete globalThis.document;
});
