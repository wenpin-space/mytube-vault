// Metadata video tanpa API key:
//  - thumbnail: pola URL i.ytimg.com (selalu tersedia)
//  - judul & channel: oEmbed YouTube, cadangan noembed.com
//  - durasi: diambil dari player saat video diputar (lihat main.js)

// Sebagian video tidak punya thumbnail ukuran tertentu (YouTube mengembalikan gambar abu 120×90).
// Ukuran yang berhasil diingat per video; kalau tidak ada sama sekali dipakai gambar cadangan bergradasi.
const thumbResolved = new Map();
export const MISSING_THUMB = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="-6 -6 36 36" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><!--ytmissing--><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>')}`;
// Mode hemat (v41): thumbnail daftar memakai versi kecil (120×90, ±4 KB) alih-alih 320×180.
let liteThumbs = false;
export function setLiteThumbs(on) { liteThumbs = !!on; }
export const thumbUrl = (id, quality = 'mqdefault') => thumbResolved.get(id) || `https://i.ytimg.com/vi/${id}/${liteThumbs && quality === 'mqdefault' ? 'default' : quality}.jpg`;
/** Pasang sekali: memperbaiki thumbnail yang hilang di seluruh halaman. */
export function installThumbFallback() {
  const fix = (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const m = /i\.ytimg\.com\/vi\/([\w-]{11})\/(\w+)\.jpg/.exec(img.getAttribute('src') || '');
    if (!m) return;
    const missing = e.type === 'error' || (img.naturalWidth <= 120 && img.naturalHeight <= 90 && m[2] !== 'default');
    if (!missing) return;
    const tried = new Set((img.dataset.ytTried || '').split(',').filter(Boolean)); tried.add(m[2]);
    img.dataset.ytTried = [...tried].join(',');
    const next = ['hqdefault', 'mqdefault', 'sddefault'].find((q) => !tried.has(q));
    const src = next ? `https://i.ytimg.com/vi/${m[1]}/${next}.jpg` : MISSING_THUMB;
    if (!next) thumbResolved.set(m[1], MISSING_THUMB);
    img.src = src;
  };
  const ok = (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    // gambar sudah tampil → hentikan animasi kilau "sedang dimuat" di kotak thumbnail (lihat .thumb.ready)
    if (img.parentElement && img.parentElement.classList.contains('thumb')) img.parentElement.classList.add('ready');
    if (!img.dataset.ytTried) return;
    const m = /i\.ytimg\.com\/vi\/([\w-]{11})\/(\w+)\.jpg/.exec(img.getAttribute('src') || '');
    if (m && img.naturalWidth > 120) thumbResolved.set(m[1], img.getAttribute('src'));
  };
  document.addEventListener('error', fix, true);
  document.addEventListener('load', (e) => { fix(e); ok(e); }, true);
}
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

async function getJson(url, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMeta(id) {
  const w = encodeURIComponent(watchUrl(id));
  const sources = [
    `https://www.youtube.com/oembed?format=json&url=${w}`,
    `https://noembed.com/embed?url=${w}`,
  ];
  for (const src of sources) {
    const j = await getJson(src);
    if (j && !j.error && typeof j.title === 'string' && j.title.trim()) {
      return { title: j.title.trim(), channel: String(j.author_name || '').trim() };
    }
  }
  return null;
}

/** Antrean pengambilan judul dengan batas paralel, supaya tidak membanjiri jaringan. */
export function createMetaQueue(onResult, concurrency = 3) {
  const queue = [];
  const pending = new Set();
  let active = 0;
  function pump() {
    while (active < concurrency && queue.length) {
      const id = queue.shift();
      active++;
      fetchMeta(id)
        .then((meta) => onResult(id, meta))
        .catch(() => onResult(id, null))
        .finally(() => { active--; pending.delete(id); pump(); });
    }
  }
  return {
    add(ids) {
      for (const id of ids) {
        if (pending.has(id)) continue;
        pending.add(id);
        queue.push(id);
      }
      pump();
    },
    has: (id) => pending.has(id),
  };
}
