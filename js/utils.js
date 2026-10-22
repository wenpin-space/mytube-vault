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
  return entries.filter(({ video: v }) =>
    (v.title || '').toLocaleLowerCase('id').includes(q) ||
    (v.channel || '').toLocaleLowerCase('id').includes(q) ||
    v.youtubeId.toLowerCase().includes(q));
}
