const CACHE = 'mvl-v11-0-0';
const VERSION = '11.0.0';

const STATIC = [
  `./index.html?v=${VERSION}`,
  `./styles.css?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  './firebase-config.js',
  './manifest.webmanifest',
  './logo-mvl.jpg',
  './mvl-icon-192-v4.png',
  './mvl-icon-512-v4.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isCritical =
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/firebase-config.js') ||
    url.pathname.endsWith('/styles.css');

  const isHtml =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');

  if (isHtml || isCritical) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;

          if (isHtml) {
            return (await caches.match(`./index.html?v=${VERSION}`)) ||
                   (await caches.match('./index.html'));
          }

          return Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
