// Service worker: menyimpan "kerangka" aplikasi supaya bisa dibuka offline dan dipasang di Android.
// Data playlist TIDAK lewat sini (ada di LocalStorage); YouTube & GitHub selalu langsung ke jaringan.

const VERSION = 'v47';
const CACHE = `mytube-vault-${VERSION}`;
const SOUND_CACHE = 'mytube-vault-sounds-1'; // rekaman suara alam: disimpan terpisah, tidak diunduh ulang tiap update
// v44: thumbnail & lirik yang pernah dibuka tetap tampil saat offline (cache terpisah, dibatasi jumlahnya)
const MEDIA_CACHE = 'mytube-vault-media-1';
const MEDIA_MAX = 600;
let trimTick = 0;
async function trimMedia(c) {
  const keys = await c.keys();
  if (keys.length > MEDIA_MAX) await Promise.all(keys.slice(0, keys.length - MEDIA_MAX).map((k) => c.delete(k)));
}
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css', 'css/style.css?v=47', 'js/main.js?v=47',
  'js/main.js', 'js/store.js', 'js/sync.js', 'js/gist.js', 'js/envelope.js', 'js/crypto.js',
  'js/player.js', 'js/parser.js', 'js/metadata.js', 'js/ui.js', 'js/dialogs.js',
  'js/settings.js', 'js/utils.js', 'js/icons.js', 'js/mobile.js', 'js/sources.js', 'js/share.js', 'js/stats.js', 'js/lyrics.js', 'js/tint.js', 'js/palette.js', 'js/recommend.js', 'js/health.js', 'js/onboard.js', 'js/lobby.js', 'js/ambient.js', 'js/scenes.js', 'js/idb.js', 'js/room.js', 'js/paint.js', 'js/sleep.js', 'js/weather.js', 'js/cafe.js', 'js/visitors.js', 'js/paintkit.js', 'js/rowdrag.js', 'js/seekbar.js', 'js/trim.js', 'js/playerbar.js', 'js/panels.js', 'js/lobby-host.js', 'js/session.js', 'js/nowpanel.js', 'js/autotag.js', 'js/seasons.js', 'js/titles.js', 'js/dupes.js', 'js/dupes-ui.js', 'js/addpreview.js', 'js/mediasession.js', 'js/swipe.js', 'js/navdrag.js', 'js/ytlist.js', 'js/i18n.js', 'js/i18n-en.js',
  'js/app-actions.js', 'js/app-events.js', 'js/app-input.js', 'js/app-library.js', 'js/app-state.js', 'js/autobackup.js', 'js/kv.js', 'js/merge.js', 'js/minipip.js', 'js/pinyin-data.js', 'js/romanize.js', 'js/spotify.js', 'js/together.js', 'js/wrapped.js',
  'fonts/poppins-latin-200-normal.woff2', 'fonts/poppins-latin-ext-200-normal.woff2', 'fonts/poppins-latin-300-normal.woff2', 'fonts/poppins-latin-ext-300-normal.woff2', 'fonts/poppins-latin-400-normal.woff2', 'fonts/poppins-latin-ext-400-normal.woff2', 'fonts/poppins-latin-500-normal.woff2', 'fonts/poppins-latin-ext-500-normal.woff2', 'fonts/poppins-latin-600-normal.woff2', 'fonts/poppins-latin-ext-600-normal.woff2', 'fonts/poppins-latin-700-normal.woff2', 'fonts/poppins-latin-ext-700-normal.woff2', 'fonts/poppins-latin-400-italic.woff2', 'fonts/poppins-latin-ext-400-italic.woff2',
  'icons/logo.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('mytube-vault-') && k !== CACHE && k !== SOUND_CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Thumbnail YouTube: cache dulu. Diambil dengan CORS supaya tidak tersimpan sebagai respons "opaque"
  // (yang dihitung browser sangat besar terhadap kuota). Gagal CORS → biarkan browser seperti biasa.
  if (url.hostname === 'i.ytimg.com' && /\/vi\/[\w-]{11}\/(default|mqdefault|hqdefault)\.jpg$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(MEDIA_CACHE);
      const hit = await c.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
        if (res.ok) { c.put(req.url, res.clone()); if (++trimTick % 50 === 0) trimMedia(c); }
        return res;
      } catch { return fetch(req); }
    })());
    return;
  }
  // Lirik (lrclib.net): jaringan dulu, salinan terakhir dipakai saat offline.
  if (url.hostname === 'lrclib.net' && url.pathname.startsWith('/api/')) {
    e.respondWith((async () => {
      const c = await caches.open(MEDIA_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req.url, res.clone());
        return res;
      } catch {
        return (await c.match(req.url)) || Response.error();
      }
    })());
    return;
  }
  if (url.origin !== self.location.origin) return; // YouTube, GitHub, dll.: jangan disentuh

  // Rekaman suara alam: cache dulu (file besar & tidak berubah), diunduh hanya saat pertama dinyalakan.
  if (url.pathname.includes('/sounds/') && url.pathname.endsWith('.mp3')) {
    e.respondWith((async () => {
      const c = await caches.open(SOUND_CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }

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
