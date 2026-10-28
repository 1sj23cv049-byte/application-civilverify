/* CivilVerify service worker: offline start for the app shell, cached CDN libraries and fonts. */
const VER = 'cv-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=DotGothic16&family=Space+Mono:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Kannada:wght@400;700&family=Noto+Sans+Telugu:wght@400;700&family=Noto+Sans+Tamil:wght@400;700&display=swap'
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    // Best effort: libraries and font CSS (cross-origin, stored as opaque responses)
    await Promise.all(CDN.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VER) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname === 'api.open-meteo.com') return;              // weather: always live
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || /\/index\.html$/.test(url.pathname)) {
      // Network first, so a re-uploaded index.html reaches users; cache is the offline fallback.
      e.respondWith((async () => {
        try {
          const r = await fetch(req);
          const c = await caches.open(VER); c.put('index.html', r.clone());
          return r;
        } catch (_) {
          return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
        }
      })());
      return;
    }
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => { const cp = r.clone(); caches.open(VER).then(c => c.put(req, cp)); return r; })));
    return;
  }
  if (/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    // Stale while revalidate for libraries and fonts
    e.respondWith((async () => {
      const c = await caches.open(VER), m = await c.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
      return m || (await net) || Response.error();
    })());
  }
});
