const CACHE='one-station-v1';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Vite's content hashes change on every edit. Existing hashed files are safe
 // to serve immediately; HTML still checks the network for the newest release.
 const immutable=/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/.test(url.pathname);
 event.respondWith((async()=>{
  const cached=await caches.match(request);
  if(immutable&&cached)return cached;
  try{const response=await fetch(request);
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));}
   return response;
  }catch{return cached||Response.error();}
 })());
});
