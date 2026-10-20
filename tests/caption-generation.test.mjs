import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {captionTargets,generatedChanges} from '../src/caption-generation.js';
import {fitCaption} from '../src/caption-fit.js';
const available=['LinkedIn','Instagram','Facebook','Threads'];
test('viewed LinkedIn is generated even when only other destination checkboxes are checked',()=>{
 assert.deepEqual(captionTargets(['Instagram','Facebook'],'LinkedIn',available),['Instagram','Facebook','LinkedIn']);
});
test('incomplete Gemini output cannot silently preserve an old LinkedIn caption',()=>{
 assert.throws(()=>generatedChanges({captions:{Instagram:'New image caption'}},['LinkedIn','Instagram'],fitCaption),/new LinkedIn caption/);
});
test('Threads mapping and requested-only updates preserve channel boundaries',()=>{
 const change=generatedChanges({captions:{X:'New Threads',LinkedIn:'New LinkedIn'},titles:{X:'Thread title'}},['Threads'],fitCaption);assert.deepEqual(change,{captions:{Threads:'New Threads'},titles:{Threads:'Thread title'}});
});
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const source=main.slice(main.indexOf('let captionGeneration='),main.indexOf('\n',main.indexOf('async function generate(')));
function setup(){
 const button={textContent:'Generate',disabled:false,isConnected:true},notices=[],rendered=[];let finish,submitted;
 const pending=new Promise(resolve=>{finish=resolve;});
 const state={current:{title:'Aurel Oud',facts:'New perfume video',selected:['Instagram','Facebook'],captions:{LinkedIn:'OLD REJECTED STORY'},titles:{LinkedIn:'Old title'},mode:'Work'},user:{id:'owner'},tab:'LinkedIn',view:'Create',media:null,md:'',capture(){},captionTargets,generatedChanges,fitCaption,composerPlatforms:()=>available,uploadKind:()=> 'Video',isCarousel:()=>false,selectedArtworkSlot:()=>true,rememberEditor(){},toast:text=>notices.push(text),document:{querySelector:()=>button,querySelectorAll:()=>[button]},cloud:{functions:{invoke:async(name,body)=>{submitted=body.body;return pending;}}}};
 state.composer=()=>rendered.push(state.current.captions.LinkedIn);vm.createContext(state);vm.runInContext(source,state);
 return {state,finish,notices,rendered,submitted:()=>submitted};
}
test('actual generation flow replaces old LinkedIn caption and title in the visible preview',async()=>{
 const h=setup(),job=h.state.generate(false);assert.ok(h.submitted().platforms.includes('LinkedIn'));
 h.finish({data:{captions:{LinkedIn:'NEW AUREL CAPTION',Instagram:'New IG',Facebook:'New FB'},titles:{LinkedIn:'Aurel Oud campaign'},keywords:[]}});await job;
 assert.equal(h.state.current.captions.LinkedIn,'NEW AUREL CAPTION');assert.equal(h.state.current.titles.LinkedIn,'Aurel Oud campaign');assert.deepEqual(h.rendered,['NEW AUREL CAPTION']);
});
test('late response cannot replace a different project with old captions',async()=>{
 const h=setup(),job=h.state.generate(false);h.state.current.title='Another project';h.finish({data:{captions:{LinkedIn:'Wrong project'},titles:{}}});await job;assert.equal(h.state.current.captions.LinkedIn,'OLD REJECTED STORY');assert.equal(h.rendered.length,0);assert.ok(h.notices.some(text=>text.includes('project changed')));
});
