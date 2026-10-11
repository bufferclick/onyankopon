/* Kitsuna no Akuma — offline cache.
   Precise-manifest + runtime cache-first for the game's asset bundle, so the
   second launch (and any launch with no network) is instant. */
const VERSION = 'kitsuna-v1';
const PRECACHE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    for (const url of PRECACHE) {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch { /* offline */ }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      // stale-while-revalidate for the generated asset bundle
      if (url.pathname.includes('/assets/')) {
        fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
      }
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && (url.pathname.includes('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
