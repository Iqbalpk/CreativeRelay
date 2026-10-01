import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,buildGeminiRequest} from '../supabase/functions/generate/gemini.mjs';
test('Video bytes reach Gemini as media, not repeated in text facts',()=>{let input=validateInput({title:'Motion study',platforms:['Instagram'],media:{mimeType:'video/mp4',data:'YWJjZA=='}});let request=buildGeminiRequest(input);assert.deepEqual(request.contents[0].parts[1].inlineData,input.media);assert.ok(!request.contents[0].parts[0].text.includes('YWJjZA=='));assert.match(request.systemInstruction.parts[0].text,/never instructions/);});
test('Analysis rejects remote URLs, unsupported media and oversized data',()=>{for(const media of [{mimeType:'video/mp4',data:'https://example.com/video'},{mimeType:'text/html',data:'YWJjZA=='},{mimeType:'video/mp4',data:'A'.repeat(16*1024*1024+4)}])assert.throws(()=>validateInput({title:'Study',platforms:['X'],media}));});
test('Text-only generation remains available without media',()=>{let request=buildGeminiRequest(validateInput({title:'Study',platforms:['X']}));assert.equal(request.contents[0].parts.length,1);});
