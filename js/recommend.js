// "Mix untukmu": rekomendasi lokal dari library sendiri (tanpa server, tanpa akun).
// Skor = favorit + seberapa sering diputar + kedekatan channel/tag dengan yang sering kamu dengar
//        + bonus lagu yang lama tidak diputar, − lagu yang baru saja diputar, − video yang tidak tersedia.
// Sedikit acak harian supaya mix-nya berganti tiap hari tapi stabil sepanjang hari.

const DAY = 86400000;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

/**
 * videos: array video dari store; hasil: [{ video, score, reason }] terurut, maks. `limit`.
 * Murni (mudah diuji): `now` bisa diisi.
 */
export function recommend(videos, { now = Date.now(), limit = 50 } = {}) {
  const chan = new Map();
  const tags = new Map();
  let maxChan = 1;
  let maxTag = 1;
  for (const v of videos) {
    const w = (v.playCount || 0) + (v.favorite ? 3 : 0);
    if (!w) continue;
    if (v.channel) { const c = (chan.get(v.channel) || 0) + w; chan.set(v.channel, c); maxChan = Math.max(maxChan, c); }
    for (const t of v.tags || []) { const k = t.toLocaleLowerCase('id'); const c = (tags.get(k) || 0) + w; tags.set(k, c); maxTag = Math.max(maxTag, c); }
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const out = [];
  for (const v of videos) {
    if (v.unavailable === 'gone') continue;
    const plays = v.playCount || 0;
    const last = v.lastPlayedAt ? Date.parse(v.lastPlayedAt) : 0;
    const since = last ? (now - last) / DAY : Infinity;
    const chanAff = v.channel ? (chan.get(v.channel) || 0) / maxChan : 0;
    const tagAff = Math.max(0, ...(v.tags || []).map((t) => (tags.get(t.toLocaleLowerCase('id')) || 0) / maxTag));
    let score = 0;
    let reason = '';
    if (v.favorite) { score += 3; reason = 'Favoritmu'; }
    score += Math.min(3, Math.log2(1 + plays));
    score += chanAff * 3 + tagAff * 2;
    if (!reason && plays >= 3 && since > 14) { score += 2.5; reason = 'Lama tidak kamu putar'; }
    if (!reason && !plays && (chanAff > 0.3 || tagAff > 0.3)) { score += 2; reason = chanAff >= tagAff ? `Dari ${v.channel}` : 'Mirip yang sering kamu putar'; }
    if (!reason && plays >= 3) reason = 'Sering kamu putar';
    if (!reason && !plays) reason = 'Belum pernah diputar';
    if (since < 0.5) score -= 3; // baru saja diputar
    if (v.unavailable) score -= 5;
    score += hash(v.youtubeId + day) * 1.5;
    out.push({ video: v, score, reason });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
