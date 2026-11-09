// Alat gambar bersama untuk Lobby (Kamar santai & Kafe): ruang virtual 1600×900, jendela, warna,
// gradien, bayangan lembut, serat kayu, daun, serta cahaya sesuai waktu & cuaca.

export const VW = 1600;
export const VH = 900;
export const W = { x: 300, y: 110, w: 1000, h: 450 }; // kaca jendela (ruang virtual)
export const OW = { x: W.x - 30, y: W.y - 24, w: W.w + 60, h: W.h + 40 }; // area pemandangan (lebih lebar untuk parallax)
export const HZ = W.y + W.h * 0.56; // cakrawala
export const BT = OW.y + OW.h; // dasar pemandangan
export const TAU = Math.PI * 2;
export const rnd = (a, b) => a + Math.random() * (b - a);
export function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- warna (array [r,g,b])
export const H = (h) => h.match(/\w\w/g).map((x) => parseInt(x, 16));
export const M = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
export const C = (a, al = 1) => `rgba(${a[0]},${a[1]},${a[2]},${al})`;
export const LI = (a, t) => M(a, [255, 255, 255], t);
export const DA = (a, t) => M(a, [0, 0, 0], t);
// kompatibel dengan kode lama
export const mix = (a, b, t) => M(H(a), H(b), t);
export const css = C;

export function ridgeLine(n, rough, r) {
  const size = 2 ** Math.ceil(Math.log2(n - 1));
  const h = new Array(size + 1).fill(0);
  h[0] = r(); h[size] = r();
  for (let step = size, amp = 0.5; step > 1; step /= 2, amp *= rough) {
    for (let i = step / 2; i < size; i += step) h[i] = (h[i - step / 2] + h[i + step / 2]) / 2 + (r() - 0.5) * amp;
  }
  const mn = Math.min(...h); const mx = Math.max(...h);
  return h.slice(0, n).map((x) => (x - mn) / (mx - mn || 1));
}
export function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
export function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
export function glow(c, x, y, rad, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, C(col, a)); g.addColorStop(1, C(col, 0));
  c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}
export function softShadow(c, x, y, rx, ry, a = 0.35) {
  c.save(); c.translate(x, y); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore();
}
export const WARM = [255, 172, 112];

/** Cahaya & warna sesuai waktu dan cuaca. */
export function lighting(time, weather) {
  const dark = { morning: 0.12, day: 0.03, dusk: 0.4, night: 0.68 }[time];
  const overcast = { clear: 0, cloudy: 0.3, rain: 0.55, storm: 0.7, snow: 0.35, fog: 0.5, grey: 0.45 }[weather] ?? 0.45;
  const warm = { morning: 0.1, day: 0, dusk: 0.22, night: 0 }[time];
  const indoorDark = Math.min(0.8, dark + overcast * 0.25);
  return { dark, overcast, warm, indoorDark, lampsOn: indoorDark > 0.28 };
}
export const SKY = {
  morning: ['93b6cf', 'f0cdb0'],
  day: ['5d9ccc', 'c4dfec'],
  dusk: ['3b4170', 'e99877'],
  night: ['070d1c', '1b2a44'],
};
export function palette(time, L) {
  const grey = H(time === 'night' ? '1a2731' : time === 'dusk' ? '6f7783' : '93a7b0'); // kelabu kebiruan saat mendung
  const top = M(H(SKY[time][0]), grey, L.overcast * 0.85);
  const bot = M(H(SKY[time][1]), grey, L.overcast * 0.85);
  return { top, bot, haze: M(bot, top, 0.25) };
}
export function woodGrain(c, x, y, w, h, base, { vertical = false, planks = 0, a = 0.08 } = {}) {
  c.fillStyle = C(base); c.fillRect(x, y, w, h);
  const r = seeded(Math.round(x * 7 + y * 13 + w));
  c.strokeStyle = `rgba(0,0,0,${a})`; c.lineWidth = 1;
  const n = Math.round((vertical ? w : h) / 7);
  for (let i = 0; i < n; i++) {
    c.beginPath();
    if (vertical) { const xx = x + r() * w; c.moveTo(xx, y); c.bezierCurveTo(xx + (r() - 0.5) * 8, y + h * 0.3, xx + (r() - 0.5) * 8, y + h * 0.7, xx + (r() - 0.5) * 6, y + h); }
    else { const yy = y + r() * h; c.moveTo(x, yy); c.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 6, x + w * 0.7, yy + (r() - 0.5) * 6, x + w, yy + (r() - 0.5) * 4); }
    c.stroke();
  }
  if (planks) {
    c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 2;
    for (let i = 1; i < planks; i++) { c.beginPath(); if (vertical) { c.moveTo(x + (w * i) / planks, y); c.lineTo(x + (w * i) / planks, y + h); } else { c.moveTo(x, y + (h * i) / planks); c.lineTo(x + w, y + (h * i) / planks); } c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = 1; i < planks; i++) { c.beginPath(); if (vertical) { c.moveTo(x + (w * i) / planks + 2, y); c.lineTo(x + (w * i) / planks + 2, y + h); } else { c.moveTo(x, y + (h * i) / planks + 2); c.lineTo(x + w, y + (h * i) / planks + 2); } c.stroke(); }
  }
}

export const shade = (L, h) => M(H(h), [8, 18, 34], Math.min(0.9, L.indoorDark * 0.76));
export const rimOf = (L) => (L.lampsOn ? Math.min(1, (L.indoorDark - 0.2) * 1.6) : 0);
export function leaf(c, x, y, len, wid, ang, col, rim) {
  c.save(); c.translate(x, y); c.rotate(ang);
  const g = c.createLinearGradient(0, -wid, 0, wid);
  g.addColorStop(0, C(LI(col, 0.14))); g.addColorStop(1, C(DA(col, 0.28)));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * 0.25, -wid * 1.1, len * 0.75, -wid, len, 0); c.bezierCurveTo(len * 0.75, wid, len * 0.25, wid * 1.1, 0, 0); c.fill();
  c.strokeStyle = C(DA(col, 0.35), 0.6); c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, 0); c.lineTo(len * 0.92, 0); c.stroke();
  if (rim) { c.strokeStyle = C(WARM, rim); c.lineWidth = 2.4; c.beginPath(); c.moveTo(len * 0.1, wid * 0.7); c.bezierCurveTo(len * 0.35, wid * 1.05, len * 0.75, wid * 0.9, len, 0); c.stroke(); }
  c.restore();
}
