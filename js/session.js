// Lanjutkan sesi terakhir: antrean, lagu, dan posisinya disimpan di perangkat ini (tidak ikut sync,
// karena tiap perangkat punya sesi dengar sendiri). Saat aplikasi dibuka lagi, muncul kartu "Lanjutkan"
// di bawah; tidak pernah memutar sendiri.

export const SESSION_KEY = 'mytube_vault_session_v1';
export const SESSION_MAX_AGE_DAYS = 14;
const MAX_QUEUE = 3000;

/** Potret sesi player sekarang (murni). Hasil null bila tidak ada yang diputar. */
export function snapshotSession(player, { time = 0, source = null, now = Date.now() } = {}) {
  if (!player.current || !player.order.length) return null;
  // simpan hanya lagu yang masih ada di antrean (order), dengan urutan antrean asli tetap terjaga
  const alive = [...new Set(player.order)].sort((a, b) => a - b).slice(0, MAX_QUEUE);
  const remap = new Map(alive.map((qi, i) => [qi, i]));
  const queue = alive.map((qi) => {
    const q = player.queue[qi];
    return q.manual ? { k: q.key, y: q.youtubeId, m: 1 } : { k: q.key, y: q.youtubeId };
  });
  const order = player.order.filter((qi) => remap.has(qi)).map((qi) => remap.get(qi));
  const curQi = player.order[player.pos];
  const pos = Math.max(0, order.indexOf(remap.get(curQi)));
  return { v: 1, at: now, queue, order, pos, t: Math.max(0, Math.floor(time)), source: source || null };
}

/**
 * Baca & bersihkan sesi tersimpan (murni). Lagu yang sudah dihapus dari library dibuang; kalau lagu
 * terakhirnya sendiri sudah hilang, sesi dilanjutkan dari lagu berikutnya yang masih ada (dari awal).
 */
export function readSession(raw, { exists = () => true, now = Date.now(), maxAgeDays = SESSION_MAX_AGE_DAYS } = {}) {
  let s = raw;
  if (typeof raw === 'string') { try { s = JSON.parse(raw); } catch { return null; } }
  if (!s || s.v !== 1 || !Array.isArray(s.queue) || !Array.isArray(s.order) || !s.order.length) return null;
  if (!(now - (s.at || 0) <= maxAgeDays * 86400e3)) return null;
  const keep = s.queue.map((q) => !!(q && typeof q.y === 'string' && exists(q.y)));
  const remap = new Map();
  const queue = [];
  s.queue.forEach((q, i) => { if (keep[i]) { remap.set(i, queue.length); queue.push({ key: String(q.k ?? q.y), youtubeId: q.y, ...(q.m ? { manual: true } : {}) }); } });
  if (!queue.length) return null;
  const curOld = s.order[Math.min(Math.max(0, s.pos | 0), s.order.length - 1)];
  let t = Math.max(0, Number(s.t) || 0);
  let pos = -1;
  // lagu terakhir masih ada → tepat di situ; kalau tidak, lagu berikutnya yang masih ada (mulai dari awal)
  const start = s.order.indexOf(curOld);
  for (let k = start; k < s.order.length && pos < 0; k++) {
    if (remap.has(s.order[k])) { if (k !== start) t = 0; pos = k; }
  }
  if (pos < 0) return null;
  const order = [];
  let newPos = 0;
  s.order.forEach((qi, k) => {
    if (!remap.has(qi)) return;
    if (k === pos) newPos = order.length;
    order.push(remap.get(qi));
  });
  return { queue, order, pos: newPos, t, at: s.at, source: s.source || null };
}

export function loadSession(opts) {
  try { return readSession(localStorage.getItem(SESSION_KEY), opts); } catch { return null; }
}
export function saveSession(snap) {
  try {
    if (snap) localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* penyimpanan penuh: sesi memang opsional */ }
}
