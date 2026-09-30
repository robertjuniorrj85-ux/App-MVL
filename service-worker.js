const CACHE='mvl-v11-0-3';
const STATIC=[
  './index.html?v=11.0.3',
  './styles.css?v=11.0.3',
  './app.js?v=11.0.3',
  './firebase-config.js',
  './manifest.webmanifest?v=11.0.3',
  './logo-mvl.jpg',
  './mvl-icon-192-v4.png',
  './mvl-icon-512-v4.png'
];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const critical=url.pathname.endsWith('/app.js')||url.pathname.endsWith('/firebase-config.js')||url.pathname.endsWith('/styles.css')||url.pathname.endsWith('/manifest.webmanifest');
  const html=event.request.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');
  if(html||critical){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{
      if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(event.request,cp));}
      return r;
    }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html?v=11.0.3'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{
    if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(event.request,cp));}
    return r;
  })));
});
