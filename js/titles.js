// Judul bersih (v41): tambahan promosi seperti "(Official Video)", "[HD]", "| Official Audio" disembunyikan
// dari tampilan. Judul asli tetap tersimpan apa adanya (dipakai pencarian, tag otomatis, lirik, export),
// dan tetap terlihat saat kursor diarahkan ke judul.

// Kata yang dianggap "tempelan" bila SEMUA isi sebuah kurung / ekor judul hanya terdiri dari kata-kata ini.
const NOISE = new Set([
  'official', 'officiel', 'oficial', 'offizielles', 'resmi',
  'music', 'musik', 'video', 'videoclip', 'clip', 'klip', 'mv', 'm/v', 'pv',
  'audio', 'lyric', 'lyrics', 'lirik', 'visualizer', 'visualiser', 'visual',
  'hd', 'hq', '4k', 'uhd', '1080p', '720p', '60fps', 'remastered hd',
  'with', 'w/', 'dan', 'and', '&', 'the', 'video musik', 'teks',
]);
// Ekor judul tanpa kurung ("… Official MV") hanya dibuang kalau memuat salah satu kata ini,
// supaya judul lagu yang memang berakhiran "Video" atau "Audio" tidak terpotong.
const STRONG = new Set(['official', 'officiel', 'oficial', 'resmi', 'mv', 'm/v', 'hd', 'hq', '4k', 'uhd', '1080p', '720p', 'visualizer', 'visualiser']);

const words = (s) => s.toLowerCase().replace(/[“”"'’.,:!]/g, ' ').split(/[\s_]+/).filter(Boolean);
const allNoise = (s) => { const w = words(s); return w.length > 0 && w.every((x) => NOISE.has(x)); };
const hasStrong = (s) => words(s).some((x) => STRONG.has(x));

/** Judul tanpa tempelan promosi. Kalau hasilnya kosong, judul asli dipakai. */
export function cleanTitle(title) {
  if (typeof title !== 'string') return title;
  let t = title;
  // 1) kurung yang isinya hanya tempelan: (Official Video) [HD] 【MV】 「Official Audio」
  t = t.replace(/\s*[(\[【「『]([^()\[\]【】「」『』]{1,48})[)\]】」』]/g, (m, inner) => (allNoise(inner) ? ' ' : m));
  // 2) ekor setelah " | ", " - ", " – ", " // " yang isinya hanya tempelan
  for (let i = 0; i < 3; i++) {
    const m = /^(.*\S)\s+(?:\||-|–|—|\/\/)\s+([^|–—]+)$/.exec(t);
    if (!m || !allNoise(m[2]) || !hasStrong(m[2])) break;
    t = m[1];
  }
  // 3) ekor tanpa pemisah: "Judul Official MV", "Judul MV", "Judul (Lyrics) HD"
  const tail = /^(.*?\S)((?:\s+(?:official|officiel|resmi|music|video|audio|mv|m\/v|hd|hq|4k|lyrics?|lirik|visuali[sz]er))+)\s*$/i.exec(t);
  if (tail && hasStrong(tail[2]) && words(tail[1]).length) t = tail[1];
  t = t.replace(/\s{2,}/g, ' ').replace(/[\s|\-–—:/]+$/, '').replace(/^[\s|\-–—:]+/, '').trim();
  return t || title.trim();
}

// Setelan dibaca sekali per render oleh main.js (store.ui.cleanTitles, bawaan aktif).
let enabled = true;
export function setCleanTitles(on) { enabled = on !== false; }
export const cleanTitlesOn = () => enabled;

/** Judul untuk ditampilkan: dibersihkan bila setelan aktif. null bila judul belum ada. */
export function titleOf(v) {
  if (!v || !v.title) return null;
  return enabled ? cleanTitle(v.title) : v.title;
}
