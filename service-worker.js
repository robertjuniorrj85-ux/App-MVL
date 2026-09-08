const CACHE='mvl-v9-3-1';
const STATIC=[
  './index.html?v=9.3.1','./styles.css?v=9.3.1','./app.js?v=9.3.1','./firebase-config.js?v=9.3.1',
  './manifest.webmanifest?v=9.3.1','./logo-mvl.jpg','./mvl-icon-192-v4.png','./mvl-icon-512-v4.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;
  const html=event.request.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');
  if(html){
    event.respondWith(fetch(event.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp));return r;}).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(event.request,cp));}return r;})));
});
