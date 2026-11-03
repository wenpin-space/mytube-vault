// Helper umum yang dipakai di seluruh aplikasi.

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const nowISO = () => new Date().toISOString();

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Fisher–Yates shuffle, mengembalikan array baru. */
export function shuffleArray(input) {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatTotal(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} jam ${m} mnt` : `${m} menit`;
}

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
  ? new Intl.RelativeTimeFormat('id', { numeric: 'auto' })
  : null;

export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (!Number.isFinite(abs)) return '—';
  if (abs < 45 || !rtf) return 'baru saja';
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, s] of units) {
    if (abs >= s) return rtf.format(Math.round(diff / s), unit);
  }
  return 'baru saja';
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function slugify(text) {
  return String(text || 'playlist')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'playlist';
}

export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* abaikan */ }
    ta.remove();
    return ok;
  }
}

/**
 * Urutan otomatis HANYA mengubah tampilan — array asli tidak disentuh.
 * Array.prototype.sort stabil, jadi item seri tetap mengikuti urutan aslinya.
 */
export function sortEntries(entries, mode) {
  const arr = [...entries];
  const title = (e) => (e.video.title || '￿').toLocaleLowerCase('id');
  switch (mode) {
    case 'addedNewest': return arr.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    case 'addedOldest': return arr.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    case 'titleAZ': return arr.sort((a, b) => title(a).localeCompare(title(b), 'id'));
    case 'titleZA': return arr.sort((a, b) => title(b).localeCompare(title(a), 'id'));
    case 'favoriteFirst': return arr.sort((a, b) => Number(b.video.favorite) - Number(a.video.favorite));
    case 'unwatchedFirst': return arr.sort((a, b) => Number(a.video.watched) - Number(b.video.watched));
    case 'watchedFirst': return arr.sort((a, b) => Number(b.video.watched) - Number(a.video.watched));
    default: return arr; // manual
  }
}

export function filterEntries(entries, query) {
  const q = String(query || '').trim().toLocaleLowerCase('id');
  if (!q) return entries;
  const tags = (v) => (v.tags || []).map((t) => t.toLocaleLowerCase('id'));
  // Beberapa kata: semuanya harus cocok (urutan bebas). "#lofi" → hanya tag yang diawali "lofi".
  const words = q.split(/\s+/).filter(Boolean);
  return entries.filter(({ video: v }) => {
    const title = (v.title || '').toLocaleLowerCase('id');
    const channel = (v.channel || '').toLocaleLowerCase('id');
    const tg = tags(v);
    return words.every((w) => {
      if (w.startsWith('#') && w.length > 1) return tg.some((x) => x.startsWith(w.slice(1)));
      return title.includes(w) || channel.includes(w) || tg.some((x) => x.includes(w)) || v.youtubeId.toLowerCase().includes(w);
    });
  });
}

/** Filter cepat di atas daftar. */
export const QUICK_FILTERS = [
  { id: 'unwatched', label: 'Belum ditonton', test: (v) => !v.watched, hideOn: ['unwatched'] },
  { id: 'fav', label: 'Favorit', test: (v) => v.favorite, hideOn: ['favorites'] },
  { id: 'never', label: 'Belum pernah diputar', test: (v) => !v.playCount, hideOn: ['history'] },
  { id: 'short', label: '< 5 menit', test: (v) => v.duration > 0 && v.duration < 300 },
  { id: 'long', label: '≥ 10 menit', test: (v) => v.duration >= 600 },
];
export function quickFilter(entries, id) {
  if (!id) return entries;
  if (id.startsWith('tag:')) {
    const t = id.slice(4);
    return entries.filter(({ video: v }) => (v.tags || []).some((x) => x.toLocaleLowerCase('id') === t));
  }
  const f = QUICK_FILTERS.find((x) => x.id === id);
  return f ? entries.filter(({ video: v }) => f.test(v)) : entries;
}

/** Kerangka (skeleton) baris saat memuat. */
export function skeletonRows(n = 4, { thumb = true } = {}) {
  return `<div class="sk-list" aria-busy="true" aria-label="Memuat">${Array.from({ length: n }, (_, i) => `
    <div class="sk-row">${thumb ? '<span class="sk sk-thumb"></span>' : ''}<span class="sk-col"><span class="sk sk-line" style="width:${[82, 64, 74, 58][i % 4]}%"></span><span class="sk sk-line sm" style="width:${[38, 46, 30, 42][i % 4]}%"></span></span></div>`).join('')}</div>`;
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Animasikan baris keluar dari daftar, lalu jalankan perubahan data. */
export function animateOut(keys, fn) {
  const set = new Set(keys);
  const rows = [...document.querySelectorAll('#video-list .vrow')].filter((r) => set.has(r.dataset.key));
  if (!rows.length || reduceMotion() || rows.length > 60) { fn(); return; }
  rows.forEach((r) => { r.style.height = `${r.offsetHeight}px`; r.classList.add('leaving'); });
  setTimeout(fn, 230);
}
