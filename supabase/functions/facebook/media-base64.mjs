// Decode into one preallocated buffer. Keep regex/atob work bounded to 32 KiB
// so a 9–12 MiB video cannot allocate huge regex or callback intermediate arrays.
export function decodeMedia(value,maxBytes=12*1024*1024){
 if(typeof value!=='string'||!value.length||value.length%4||value.length>Math.ceil(maxBytes/3)*4)throw Error('Invalid encoded media size.');
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
 const size=value.length/4*3-padding;if(size>maxBytes)throw Error('Media exceeds the upload limit.');
 const bytes=new Uint8Array(size);let written=0;
 for(let offset=0;offset<value.length;offset+=32768){
  const chunk=value.slice(offset,offset+32768),last=offset+chunk.length===value.length;
  if(!(last?/^[A-Za-z0-9+/]*={0,2}$/:/^[A-Za-z0-9+/]+$/).test(chunk))throw Error('Invalid encoded media.');
  let decoded;try{decoded=atob(chunk);}catch{throw Error('Invalid encoded media.');}
  for(let i=0;i<decoded.length;i++)bytes[written++]=decoded.charCodeAt(i);
 }
 if(written!==size)throw Error('Invalid encoded media.');return bytes;
}
