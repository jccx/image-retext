/* 查缺补漏 service worker.
   - The app itself (page, icons, manifest) is kept on the device, so it opens without a network.
   - Fonts: answered from the downloaded packs (Cache Storage "overwrite-fonts") when present, otherwise from the network.
   - A new version is fetched in the background and used from the next launch.
   - What the app stored under its former name (retext-…) is removed: those copies belong to the old address. */
const VERSION = '__VERSION__';
const SHELL = 'overwrite-shell-' + VERSION, FONTS = 'overwrite-fonts';
const SHELL_FILES = __SHELL__;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('overwrite-shell-') && k !== SHELL) || k.startsWith('retext-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  /* fonts and the PDF helper files (character maps, standard fonts, image decoders): from the downloaded packs when present,
     otherwise from the network; a helper file fetched once is kept for later use without a network */
  const helper = rel.startsWith('pdf/') && !SHELL_FILES.includes(rel);
  if ((rel.startsWith('fonts/') && rel !== 'fonts/packs.json') || helper) {
    e.respondWith((async () => {
      const hit = (await (await caches.open(FONTS)).match(req.url)) || (await caches.match(req.url));
      if (hit) return hit;
      const r = await fetch(req);
      if (helper && r.ok) (await caches.open(SHELL)).put(req.url, r.clone());
      return r;
    })());
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
