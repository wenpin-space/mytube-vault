// Deteksi lagu ganda (v41): video berbeda yang sebenarnya lagu yang sama, mis. MV resmi dan versi
// "Artis - Topic", atau unggahan "(Official Video)" dan "(Lyrics)". Versi berbeda (live, remix, cover,
// acoustic, sped up, …) tidak dianggap sama karena keterangannya tetap ikut dibandingkan.

import { cleanTitle } from './titles.js';

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Nama artis/channel untuk dibandingkan: tanpa "- Topic", "VEVO", "Official", spasi & tanda baca. */
export function artistKey(s) {
  return fold(s)
    .replace(/\s*-\s*topic$/, '')
    .replace(/vevo$/, '')
    .replace(/\b(official|music|channel|records?|tv)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
const songPart = (s) => fold(s)
  .replace(/\s*[([](?:ft|feat|featuring)\.?\s[^)\]]*[)\]]/g, ' ')   // (feat. X) berbeda-beda penulisannya
  .replace(/\s+(?:ft|feat|featuring)\.?\s.*$/, '')
  .replace(/[“”"'’`]/g, '')
  .replace(/[^\p{L}\p{N}()[\]]+/gu, ' ')
  .replace(/[()[\]]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Kunci pembanding sebuah lagu: "artis|judul". Artis diambil dari "Artis - Judul" di judul, atau dari
 * nama channel. Hasil '' bila judul belum ada (lagu itu tidak ikut dibandingkan).
 */
export function songKey(title, channel = '') {
  if (!title) return '';
  const t = cleanTitle(title);
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(t);
  const artist = artistKey(m ? m[1] : channel);
  const song = songPart(m ? m[2] : t);
  if (!song || song.length < 2) return '';
  return `${artist}|${song}`;
}

/**
 * Kelompok lagu ganda di library: [{ key, ids }] (ids ≥ 2), id pertama = yang disarankan disimpan
 * (paling banyak playlist, lalu favorit, paling sering diputar, paling lama ada).
 */
export function findDuplicates(videos, playlists = []) {
  const inPl = new Map();
  for (const p of playlists) for (const it of p.items || []) inPl.set(it.youtubeId, (inPl.get(it.youtubeId) || 0) + 1);
  const groups = new Map();
  for (const v of Object.values(videos || {})) {
    const k = songKey(v.title, v.channel);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const score = (v) => [(inPl.get(v.youtubeId) || 0), v.favorite ? 1 : 0, v.unavailable ? -1 : 0, v.playCount || 0];
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => {
      const sa = score(a); const sb = score(b);
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
      return String(a.firstAddedAt).localeCompare(String(b.firstAddedAt));
    });
    out.push({ key, ids: list.map((v) => v.youtubeId) });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Video lain di library yang lagunya sama dengan `id` (dipakai saat lagu baru ditambahkan). */
export function similarTo(videos, id) {
  const v = videos[id];
  const k = v && songKey(v.title, v.channel);
  if (!k) return [];
  return Object.values(videos).filter((o) => o.youtubeId !== id && songKey(o.title, o.channel) === k).map((o) => o.youtubeId);
}
