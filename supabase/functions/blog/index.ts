import {createClient} from 'npm:@supabase/supabase-js@2';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function validateArticle(body){
 if(!uuid(body.requestId))throw Error('Invalid article request.');
 if(typeof body.title!=='string'||!body.title.trim()||body.title.length>300)throw Error('Add a blog title under 300 characters.');
 if(typeof body.markdown!=='string'||!body.markdown.trim()||body.markdown.length>100000)throw Error('Add the full article in Article text (up to 100,000 characters).');
 let cover=null;
 if(body.cover){
  const {mimeType,data}=body.cover;if(!['image/jpeg','image/png','video/mp4'].includes(mimeType)||typeof data!=='string'||!data.length||data.length>16*1024*1024||data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Use JPG, PNG or MP4 up to 12 MB for the cover.');
  const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  if(bytes.length>12*1024*1024)throw Error('Cover must be under 12 MB.');
  if(mimeType==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('Invalid JPG cover.');
  if(mimeType==='image/png'&&![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))throw Error('Invalid PNG cover.');
  if(mimeType==='video/mp4'&&String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw Error('Invalid MP4 cover.');
  cover={mimeType,bytes};
 }
 return {id:body.requestId,title:body.title.trim(),markdown:body.markdown,cover};
}
function articleURL(id){if(!uuid(id))throw Error('Invalid article ID');return 'https://iqbalpk.github.io/CreativeRelay/blog.html?id='+id;}

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const database=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const bucket='published-blog-covers';
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const failure=result=>{if(result.error)throw Error('Could not manage blogs. Please refresh and try again.');return result;};
const fields='id,title,status,cover_path,cover_type,published_at,payload_hash,markdown';
function view(row,client){return {id:row.id,title:row.title,status:row.status,publishedAt:row.published_at,updatedAt:row.payload_hash,coverType:row.cover_type,coverURL:row.cover_path?client.storage.from('published-blog-covers').getPublicUrl(row.cover_path).data.publicUrl:null};}
function validateEdit(body){if(typeof body.title!=='string'||!body.title.trim()||body.title.length>300)throw Error('Add a title up to 300 characters.');if(typeof body.markdown!=='string'||!body.markdown.trim()||body.markdown.length>100000)throw Error('Add article text up to 100,000 characters.');return {title:body.title.trim(),markdown:body.markdown};}
async function manageBlogs(client,owner,body){
 if(!validId(owner)||body.userId!==owner)throw Error('Your signed-in account changed.');
 if(body.action==='manage-list'){
  const offset=body.offset??0,filter=body.filter??'all',sort=body.sort??'newest',search=String(body.search||'').trim();
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!['all','published','unpublished'].includes(filter)||!['newest','oldest','title'].includes(sort)||search.length>100)throw Error('Invalid blog filters.');
  let query=client.from('published_blogs').select(fields,{count:'exact'}).eq('user_id',owner);
  if(filter!=='all')query=filter==='published'?query.eq('status','published'):query.eq('status','preparing');
  if(search)query=query.ilike('title','%'+search.replace(/[\\%_]/g,'\\$&')+'%');
  if(sort==='title')query=query.order('title',{ascending:true});
  else query=query.order('published_at',{ascending:sort==='oldest',nullsFirst:false});
  query=query.order('id',{ascending:false}).range(offset,offset+23);
  const [list,published,unpublished]=await Promise.all([query,client.from('published_blogs').select('id',{count:'exact',head:true}).eq('user_id',owner).eq('status','published'),client.from('published_blogs').select('id',{count:'exact',head:true}).eq('user_id',owner).eq('status','preparing')]);
  [list,published,unpublished].forEach(failure);
  return {blogs:(list.data||[]).map(row=>view(row,client)),filteredCount:list.count||0,counts:{total:(published.count||0)+(unpublished.count||0),published:published.count||0,unpublished:unpublished.count||0}};
 }
 if(!['manage-get','manage-edit','manage-remove','manage-restore'].includes(body.action)||!validId(body.id))throw Error('Invalid blog action.');
 const {data:row}=failure(await client.from('published_blogs').select(fields).eq('user_id',owner).eq('id',body.id).maybeSingle());if(!row)throw Error('Blog not found in your account.');
 if(body.action==='manage-get')return {blog:{...view(row,client),markdown:row.markdown}};
 if(typeof body.version!=='string'||body.version!==row.payload_hash)throw Error('This blog changed elsewhere. Refresh before editing it.');
 let changes={payload_hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('managed:'+crypto.randomUUID()))),b=>b.toString(16).padStart(2,'0')).join('')};
 if(row.status==='preparing'&&!row.published_at)throw Error('This article is still being prepared. Manage its original draft in Your library.');
 if(body.action==='manage-edit')changes={...changes,...validateEdit(body)};
 else if(body.action==='manage-remove'){if(row.status!=='published')throw Error('This blog is already unpublished.');changes.status='preparing';}
 else{if(row.status==='published')throw Error('This blog is already published.');validateEdit(row);changes.status='published';if(!row.published_at)changes.published_at=new Date().toISOString();}
 const updated=failure(await client.from('published_blogs').update(changes).eq('user_id',owner).eq('id',body.id).eq('payload_hash',body.version).eq('status',row.status).select('id'));
 if(updated.data?.length!==1)throw Error('This blog changed elsewhere. Refresh before saving.');return {saved:true,id:body.id};
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 try{
  if(req.method==='GET'){
   const query=new URL(req.url).searchParams,id=query.get('id');
   if(!id){
    const owner=query.get('author'),offset=Number(query.get('offset')||0);if((owner&&!uuid(owner))||!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply({error:'Invalid blog collection'},400);
    const client=database();let request=client.from('published_blogs').select('id,title,author_name,cover_path,cover_type,published_at').eq('status','published').order('published_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+23);if(owner)request=request.eq('user_id',owner);
    const {data,error}=await request;if(error)return reply({error:'Could not load blogs'},500);
    return reply({blogs:(data||[]).map(row=>({id:row.id,title:row.title,author:row.author_name,publishedAt:row.published_at,coverType:row.cover_type,coverURL:row.cover_path?client.storage.from(bucket).getPublicUrl(row.cover_path).data.publicUrl:null})),nextOffset:data?.length===24?offset+24:null});
   }
   if(!uuid(id))return reply({error:'Article not found'},404);
   const client=database(),{data,error}=await client.from('published_blogs').select('id,title,markdown,author_name,cover_path,cover_type,published_at').eq('id',id).eq('status','published').maybeSingle();
   if(error||!data)return reply({error:'Article not found'},404);
   const coverURL=data.cover_path?client.storage.from(bucket).getPublicUrl(data.cover_path).data.publicUrl:null;
   return reply({id:data.id,title:data.title,markdown:data.markdown,author:data.author_name,coverURL,coverType:data.cover_type,publishedAt:data.published_at});
  }
  if(req.method!=='POST')return reply({error:'GET or POST required'},405);
  const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!),{data:{user},error}=await auth.auth.getUser(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'');
  if(error||!user)return reply({error:'Sign in required'},401);
  const raw=await req.text();if(raw.length>18*1024*1024)return reply({error:'Request too large'},413);
  const body=JSON.parse(raw),client=database();if(body.userId!==user.id)return reply({error:'Your signed-in account changed'},401);
  if(typeof body.action==='string'&&body.action.startsWith('manage-'))return reply(await manageBlogs(client,user.id,body));
  if(body.action!=='publish')return reply({error:'Unknown action'},400);
  const input=validateArticle(body),payloadHash=await digest(JSON.stringify({title:input.title,markdown:input.markdown,cover:body.cover||null}));
  const author=String(user.user_metadata?.full_name||user.user_metadata?.name||'CreativeRelay author').slice(0,150);
  const {error:reserveError}=await client.from('published_blogs').insert({id:input.id,user_id:user.id,title:input.title,markdown:input.markdown,author_name:author,payload_hash:payloadHash,status:'preparing'});
  if(reserveError){
   if(reserveError.code!=='23505')throw Error('Apply blog.sql before publishing articles.');
   const {data:previous,error:readError}=await client.from('published_blogs').select('payload_hash,status').eq('id',input.id).eq('user_id',user.id).maybeSingle();
   if(readError||!previous||previous.payload_hash!==payloadHash)throw Error('Article request does not match this account or content.');
   if(previous.status==='published')return reply({published:true,id:input.id,url:articleURL(input.id)});
  }
  let path=null;
  if(input.cover){
   const {data:existing,error:bucketError}=await client.storage.getBucket(bucket);
   if(!existing){if(bucketError?.message&&!/not found/i.test(bucketError.message))throw Error('Could not check blog cover storage.');const {error:createError}=await client.storage.createBucket(bucket,{public:true,fileSizeLimit:12*1024*1024,allowedMimeTypes:['image/jpeg','image/png','video/mp4']});if(createError&&!/already exists/i.test(createError.message))throw Error('Could not create blog cover storage.');}
   else if(!existing.public)throw Error('Blog cover bucket must allow public reading.');
   const extension=input.cover.mimeType==='video/mp4'?'mp4':input.cover.mimeType==='image/png'?'png':'jpg';path=input.id+'.'+extension;
   const {error:uploadError}=await client.storage.from(bucket).upload(path,input.cover.bytes,{contentType:input.cover.mimeType,upsert:true});if(uploadError)throw Error('Could not publish the article cover.');
  }
  const {data:updated,error:saveError}=await client.from('published_blogs').update({status:'published',cover_path:path,cover_type:input.cover?.mimeType||null,published_at:new Date().toISOString()}).eq('id',input.id).eq('user_id',user.id).eq('payload_hash',payloadHash).select('id');
  if(saveError||updated?.length!==1)throw Error('Could not publish the article.');
  return reply({published:true,id:input.id,url:articleURL(input.id)});
 }catch(error){return reply({error:error instanceof Error?error.message:'Blog publishing failed'},400);}
});
