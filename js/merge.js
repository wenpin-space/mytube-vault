// Sinkron yang menggabungkan (v44): bila data di HP dan di PC sama-sama berubah sejak sinkron terakhir,
// keduanya digabung per lagu dan per playlist — bukan memilih salah satu versi utuh.
//
// base   = data saat sinkron terakhir berhasil (disimpan di IndexedDB, kunci "sync-base")
// local  = data di perangkat ini, remote = data di Gist.
// Aturan:
//  • lagu/playlist yang hanya ada di satu sisi: baru → disimpan; sudah ada di base → dihapus sisi lain,
//    kecuali sisi ini mengubahnya sesudah itu (perubahan menang atas penghapusan).
//  • ada di kedua sisi: versi dengan updatedAt terbaru menang; jumlah putar diambil yang terbesar.
//  • isi playlist digabung per item: tambahan dari kedua sisi masuk, hapusan dari kedua sisi berlaku,
//    urutan mengikuti sisi yang terakhir mengubah playlist itu.
// Tanpa base (belum pernah tersimpan), tidak ada yang dianggap dihapus: hasilnya gabungan keduanya.

const t = (x) => String((x && x.updatedAt) || '');
const newer = (a, b) => (t(b) > t(a) ? b : a);

function mergeVideo(l, r) {
  const w = newer(l, r);
  const o = w === l ? r : l;
  const out = { ...w };
  out.playCount = Math.max(l.playCount || 0, r.playCount || 0);
  const lp = [l.lastPlayedAt, r.lastPlayedAt].filter(Boolean).sort();
  if (lp.length) out.lastPlayedAt = lp[lp.length - 1];
  if (!out.title && o.title) out.title = o.title;
  if (!out.channel && o.channel) out.channel = o.channel;
  if (!out.duration && o.duration) out.duration = o.duration;
  return out;
}

function mergeItems(lp, rp, bp) {
  const w = newer(lp, rp);
  const o = w === lp ? rp : lp;
  const inBase = new Set(bp ? bp.items.map((i) => i.itemId) : []);
  const inOther = new Set(o.items.map((i) => i.itemId));
  // hapusan dari sisi lain: item yang ada di base tapi sudah tidak ada di sisi lain
  const out = w.items.filter((i) => !(inBase.has(i.itemId) && !inOther.has(i.itemId)));
  const have = new Set(out.map((i) => i.itemId));
  const vids = new Set(out.map((i) => i.youtubeId));
  // tambahan dari sisi lain: diselipkan setelah item sebelumnya di sisi itu (atau di akhir)
  o.items.forEach((it, idx) => {
    if (have.has(it.itemId) || inBase.has(it.itemId) || vids.has(it.youtubeId)) return;
    let at = out.length;
    for (let k = idx - 1; k >= 0; k--) {
      const j = out.findIndex((x) => x.itemId === o.items[k].itemId);
      if (j >= 0) { at = j + 1; break; }
    }
    out.splice(at, 0, it);
    have.add(it.itemId); vids.add(it.youtubeId);
  });
  return { ...w, items: out };
}

function mergeMap(lm, rm, bm, mergeOne) {
  const out = {};
  const keys = new Set([...Object.keys(lm), ...Object.keys(rm)]);
  const stats = { added: 0, removed: 0, changed: 0 };
  for (const k of keys) {
    const l = lm[k]; const r = rm[k]; const b = bm ? bm[k] : undefined;
    if (l && r) { out[k] = mergeOne(l, r, b); if (t(r) > t(l)) stats.changed++; continue; }
    const only = l || r;
    if (!b) { out[k] = only; if (r && !l) stats.added++; continue; } // baru di satu sisi
    // ada di base, hilang di satu sisi → dihapus sisi itu; tetap disimpan kalau sisi lain mengubahnya sesudahnya
    if (t(only) > t(b)) { out[k] = only; continue; }
    if (l && !r) stats.removed++;
  }
  return { out, stats };
}

/** Hasil: { data, summary: { videosAdded, videosRemoved, playlistsChanged, ... } }. Tidak mengubah input. */
export function mergeData(local, remote, base = null) {
  const L = JSON.parse(JSON.stringify(local));
  const R = JSON.parse(JSON.stringify(remote));
  const B = base ? JSON.parse(JSON.stringify(base)) : null;
  const vids = mergeMap(L.videos || {}, R.videos || {}, B ? B.videos || {} : null, mergeVideo);

  const toMap = (arr) => Object.fromEntries((arr || []).map((p) => [p.id, p]));
  const pls = mergeMap(toMap(L.playlists), toMap(R.playlists), B ? toMap(B.playlists) : null, (l, r, b) => mergeItems(l, r, b));
  // urutan playlist: ikut data yang terakhir berubah, playlist baru dari sisi lain di akhir
  const w = t(R) > t(L) ? R : L;
  const o = w === R ? L : R;
  const order = [...(w.playlists || []).map((p) => p.id), ...(o.playlists || []).map((p) => p.id)];
  const seen = new Set();
  const playlists = order.filter((id) => pls.out[id] && !seen.has(id) && seen.add(id)).map((id) => pls.out[id]);
  // item yang menunjuk lagu yang sudah dihapus dibuang
  for (const p of playlists) p.items = p.items.filter((i) => vids.out[i.youtubeId]);

  const data = { ...w, videos: vids.out, playlists, settings: w.settings || o.settings };
  data.updatedAt = [t(L), t(R)].sort()[1] || new Date().toISOString();
  return {
    data,
    summary: {
      videosAdded: vids.stats.added, videosRemoved: vids.stats.removed,
      playlistsAdded: pls.stats.added, playlistsRemoved: pls.stats.removed, playlistsChanged: pls.stats.changed,
    },
  };
}
