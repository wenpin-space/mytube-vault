// Service worker: menyimpan "kerangka" aplikasi supaya bisa dibuka offline dan dipasang di Android.
// Data playlist TIDAK lewat sini (ada di LocalStorage); YouTube & GitHub selalu langsung ke jaringan.

const VERSION = 'v2';
const CACHE = `mytube-vault-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js', 'js/store.js', 'js/sync.js', 'js/gist.js', 'js/envelope.js', 'js/crypto.js',
  'js/player.js', 'js/parser.js', 'js/metadata.js', 'js/ui.js', 'js/dialogs.js',
  'js/settings.js', 'js/utils.js', 'js/icons.js', 'js/mobile.js',
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
