/* 图片改字 service worker.
   - The app itself (page, icons, manifest) is kept on the device, so it opens without a network.
   - Fonts: answered from the downloaded packs (Cache Storage "retext-fonts") when present, otherwise from the network.
   - A new version is fetched in the background and used from the next launch. */
const VERSION = 'b79625a1ef';
const SHELL = 'retext-shell-' + VERSION, FONTS = 'retext-fonts';
const SHELL_FILES = ["./","index.html","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png","fonts/packs.json","fonts/ibm-plex-mono/ibm-plex-mono.css","fonts/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2","fonts/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('retext-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel.startsWith('fonts/') && rel !== 'fonts/packs.json') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req.url)).then(hit => hit || caches.match(req.url)).then(hit => hit || fetch(req)));
    return;
  }
  /* the app: from the device at once, refreshed in the background */
  const key = req.mode === 'navigate' ? new URL('index.html', scope).href : req.url;
  e.respondWith(caches.open(SHELL).then(async c => {
    const hit = await c.match(key, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(r => { if (r.ok && (hit || SHELL_FILES.some(f => new URL(f, scope).href === key))) c.put(key, r.clone()); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
