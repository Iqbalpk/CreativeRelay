// GEMINI_API_KEY stays on the server; deploy with JWT verification enabled.
import {createClient} from 'npm:@supabase/supabase-js@2';
import {validateInput,buildGeminiRequest,parseGeminiOutput} from './gemini.mjs';
const origin=Deno.env.get('APP_ORIGIN')||'http://127.0.0.1:5173';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json'};
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response('ok',{headers});
if(req.method!=='POST')return new Response(JSON.stringify({error:'POST required'}),{status:405,headers});
try{
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
 const {data:{user},error}=await db.auth.getUser();if(error||!user)return new Response(JSON.stringify({error:'Sign in required'}),{status:401,headers});
 if(Number(req.headers.get('content-length')||0)>18*1024*1024)throw Error('Analysis request too large. Use a file under 12 MB.');
 const input=validateInput(await req.json());const secret=Deno.env.get('GEMINI_API_KEY');if(!secret)throw Error('Gemini is not configured. Set GEMINI_API_KEY on the backend.');
 const {data:allowed,error:quotaError}=await db.rpc('consume_generation');if(quotaError)throw Error('Generation quota is not configured. Apply the schema.');if(!allowed)return new Response(JSON.stringify({error:'Daily generation limit reached'}),{status:429,headers});
 const model=Deno.env.get('GEMINI_MODEL')||'gemini-3.5-flash-lite';if(!/^[a-zA-Z0-9._-]+$/.test(model))throw Error('Invalid Gemini model configuration');
 let response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':secret,'Content-Type':'application/json'},body:JSON.stringify(buildGeminiRequest(input)),signal:AbortSignal.timeout(60000)});
 // Retry a temporary provider overload once; do not retry quota/key/input errors.
 if(response.status===503){await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,1500));response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':secret,'Content-Type':'application/json'},body:JSON.stringify(buildGeminiRequest(input)),signal:AbortSignal.timeout(60000)});}
 if(!response.ok){let detail;try{detail=await response.json();}catch{}const reason=String(detail?.error?.message||'No details returned').split(secret).join('[redacted]').replace(/AIza[A-Za-z0-9_-]+/g,'[redacted]').slice(0,700);throw Error(`Gemini ${response.status} (${model}): ${reason}`);}
 return new Response(JSON.stringify(parseGeminiOutput(await response.json(),input.platforms)),{headers});
}catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Generation failed'}),{status:400,headers});}
});
