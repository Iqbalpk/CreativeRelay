// Only metadata for the authenticated owner is returned; media and tokens never leave the server.
export async function publicationHistory(client,owner,platform,username=''){
 const table=platform==='Instagram'?'instagram_publish_attempts':platform==='Facebook'?'facebook_publish_attempts':null;
 if(!table)throw Error('Unsupported publication history.');
 const {data,error}=await client.from(table).select('request_id,status,post_id,created_at').eq('user_id',owner).order('created_at',{ascending:false}).limit(5);
 if(error)throw Error('Could not load recent publications.');
 return {attempts:(data||[]).map(row=>({requestId:row.request_id,status:row.status,postId:row.post_id,createdAt:row.created_at,
  url:row.status==='published'?(platform==='Facebook'&&/^\d+(?:_\d+)?$/.test(row.post_id||'')?'https://www.facebook.com/'+row.post_id:platform==='Instagram'&&username?'https://www.instagram.com/'+encodeURIComponent(username)+'/':null):null}))};
}
// Preserve slide order and wait for all active workers before cleanup after any failure.
export async function mapSlides(items,prepare,concurrency=3){
 const results=new Array(items.length);let cursor=0,failure;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(!failure){const index=cursor++;if(index>=items.length)return;
   try{results[index]=await prepare(items[index],index);}catch(error){failure=error;}
  }
 }));
 if(failure)throw failure;
 return results;
}

