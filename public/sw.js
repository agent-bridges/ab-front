const CACHE_NAME = 'ab-static-v1';
const STATIC_FILES = [
  '/app.webmanifest',
  '/favicon.svg',
  '/icons/ab-192.png',
  '/icons/ab-512.png',
  '/icons/ab-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name.startsWith('ab-static-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Authentication, daemon API, WebSockets and page navigations must always
  // reach the live server. Only immutable build assets and PWA metadata are
  // safe to cache.
  const isStaticAsset = url.pathname.startsWith('/assets/') || STATIC_FILES.includes(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
