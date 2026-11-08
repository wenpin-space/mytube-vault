// Service worker: menyimpan "kerangka" aplikasi supaya bisa dibuka offline dan dipasang di Android.
// Data playlist TIDAK lewat sini (ada di LocalStorage); YouTube & GitHub selalu langsung ke jaringan.

const VERSION = 'v25';
const CACHE = `mytube-vault-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css', 'css/style.css?v=25', 'js/main.js?v=25',
  'js/main.js', 'js/store.js', 'js/sync.js', 'js/gist.js', 'js/envelope.js', 'js/crypto.js',
  'js/player.js', 'js/parser.js', 'js/metadata.js', 'js/ui.js', 'js/dialogs.js',
  'js/settings.js', 'js/utils.js', 'js/icons.js', 'js/mobile.js', 'js/sources.js', 'js/share.js', 'js/stats.js', 'js/lyrics.js', 'js/tint.js', 'js/palette.js', 'js/recommend.js', 'js/health.js', 'js/onboard.js', 'js/lobby.js', 'js/ambient.js', 'js/scenes.js', 'js/idb.js', 'js/room.js', 'js/paint.js', 'js/i18n.js', 'js/i18n-en.js',
  'fonts/poppins-latin-200-normal.woff2', 'fonts/poppins-latin-ext-200-normal.woff2', 'fonts/poppins-latin-300-normal.woff2', 'fonts/poppins-latin-ext-300-normal.woff2', 'fonts/poppins-latin-400-normal.woff2', 'fonts/poppins-latin-ext-400-normal.woff2', 'fonts/poppins-latin-500-normal.woff2', 'fonts/poppins-latin-ext-500-normal.woff2', 'fonts/poppins-latin-600-normal.woff2', 'fonts/poppins-latin-ext-600-normal.woff2', 'fonts/poppins-latin-700-normal.woff2', 'fonts/poppins-latin-ext-700-normal.woff2', 'fonts/poppins-latin-400-italic.woff2', 'fonts/poppins-latin-ext-400-italic.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('mytube-vault-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // YouTube, GitHub, thumbnail: jangan disentuh

  // Jaringan dulu, supaya semua modul JS selalu dari versi yang sama setelah update.
  // Kalau offline, pakai salinan terakhir dari cache.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) c.put(key, res.clone());
      return res;
    } catch {
      return (await c.match(key, { ignoreSearch: true })) || (await c.match('./')) || Response.error();
    }
  })());
});
