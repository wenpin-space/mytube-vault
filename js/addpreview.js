// Pratinjau "Banyak link" (v41): sebelum disimpan, setiap link diperiksa — baru, sudah ada di library,
// sudah ada di playlist tujuan (dilewati), dobel, tidak valid, atau link playlist YouTube.

import { extractYouTubeId, extractPlaylistId } from './parser.js';

/**
 * Hasil: { rows: [{ id, status: 'new'|'lib'|'here' }], invalid: [token], dup: n, lists: [listId] }.
 * videos = library (objek id → video), inTarget = Set id yang sudah ada di playlist tujuan.
 */
export function classifyLinks(text, { videos = {}, inTarget = new Set() } = {}) {
  const tokens = String(text || '').replace(/(\S)(https?:\/\/)/gi, '$1 $2').split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set();
  const lists = [];
  const invalid = [];
  const rows = [];
  let dup = 0;
  for (const token of tokens) {
    const id = extractYouTubeId(token);
    if (!id) {
      const list = extractPlaylistId(token);
      if (list) { if (!lists.includes(list)) lists.push(list); continue; }
      if (/^https?:\/\/|\.\w{2,}\//i.test(token)) invalid.push(token);
      continue;
    }
    if (seen.has(id)) { dup++; continue; }
    seen.add(id);
    rows.push({ id, status: inTarget.has(id) ? 'here' : videos[id] ? 'lib' : 'new' });
  }
  return { rows, invalid, dup, lists };
}

/** Id yang benar-benar akan ditambahkan. */
export function idsToAdd(res, { skipLibrary = false } = {}) {
  return res.rows.filter((r) => r.status === 'new' || (r.status === 'lib' && !skipLibrary)).map((r) => r.id);
}
