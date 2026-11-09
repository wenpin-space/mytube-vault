// "Kamar santai": ilustrasi kamar berlapis yang digambar dengan kode (komposisi orisinal).
// Pemandangan di luar jendela (lokasi), cuaca, dan waktu bisa diganti; bagian statis dirender sekali
// ke kanvas cadangan, bagian bergerak (hujan, awan, kucing, tanaman, uap, lampu) digambar tiap frame.

import { createPainter } from './paint.js';
import { putFile, getFile, deleteFile, listKeys } from './idb.js';
import { createCrowd, drawPersonFast, drawBaristaFast, drawCounterCup } from './visitors.js';
import { drawCafe, CAFE_SPRITES, CAFE_SPRITE_DRAW, createCafeAnimator, drawDrink, biteClip, drinkOf, LANTERNS, CUP, PLATE, COUNTER_Y, MACHINE, TABLET } from './cafe.js';
import { VW, VH, W, OW, HZ, BT, TAU, rnd, seeded, H, M, C, LI, DA, mix, css, ridgeLine, rr, lin, glow, softShadow, WARM, lighting, palette, woodGrain, shade, rimOf, leaf } from './paintkit.js';

export const LOCATIONS = [
  { id: 'mountain', name: 'Gunung & danau' },
  { id: 'city', name: 'Kota' },
  { id: 'beach', name: 'Pantai' },
  { id: 'forest', name: 'Hutan pinus' },
  { id: 'village', name: 'Pedesaan' },
  { id: 'ricefield', name: 'Sawah' },
];
export const WEATHERS = [
  { id: 'clear', name: 'Cerah', icon: 'sun' },
  { id: 'cloudy', name: 'Berawan', icon: 'cloud' },
  { id: 'rain', name: 'Hujan', icon: 'rain' },
  { id: 'storm', name: 'Badai', icon: 'bolt' },
  { id: 'snow', name: 'Salju', icon: 'snow' },
  { id: 'fog', name: 'Kabut', icon: 'wind' },
];
export const TIMES = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'morning', name: 'Pagi' },
  { id: 'day', name: 'Siang' },
  { id: 'dusk', name: 'Senja' },
  { id: 'night', name: 'Malam' },
];

/** 'auto' → waktu sesuai jam perangkat. */
export function resolveTime(t, hour = new Date().getHours()) {
  if (t && t !== 'auto') return t;
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'day';
  if (hour >= 16 && hour < 19) return 'dusk';
  return 'night';
}

/**
 * Lukisan dibuat per kelompok cuaca, bukan per cuaca: cerah, mendung (berawan/hujan/badai/kabut), salju.
 * Beda antar-cuaca dalam satu kelompok (hujan, kilat, kabut, gelapnya langit) digambar bergerak di atasnya,
 * jadi cuaca yang berubah-ubah tidak membuat Lobby melukis ulang.
 */
export function paintWeather(w) { return w === 'clear' || w === 'snow' ? w : 'grey'; }
/** Seberapa gelap suasana di atas lukisan "mendung" (0 = sama dengan lukisannya). */
const WX_DIM = { clear: 0, cloudy: 0, fog: 0.02, rain: 0.06, storm: 0.17, snow: 0, grey: 0 };
const hasRain = (w) => w === 'rain' || w === 'storm';
const BAR_TOP = 568; // meja bar kafe (untuk cahaya lampu)

/** Racikan suara alam yang cocok untuk lokasi + cuaca + waktu (murni, mudah diuji). */
export function roomSoundMix({ place = 'room', loc = 'mountain', weather = 'clear', time = 'night' } = {}) {
  if (place === 'cafe') { // di dalam kafe: obrolan & denting cangkir, cuaca luar terdengar lebih pelan
    const k = { cafe: 0.42 };
    if (weather === 'rain') k.rain = 0.32;
    if (weather === 'storm') Object.assign(k, { heavyrain: 0.38, thunder: 0.35 });
    if (weather === 'snow' || weather === 'fog') k.wind = 0.1;
    if (time === 'night') k.cafe = 0.3;
    return k;
  }
  const night = time === 'night';
  const m = {};
  const nature = night ? { crickets: 0.25 } : { birds: 0.2 };
  switch (loc) {
    case 'mountain': Object.assign(m, { wind: 0.12 }, nature); break;
    case 'city': Object.assign(m, { traffic: 0.22, cafe: 0.1 }); break;
    case 'beach': Object.assign(m, { waves: 0.55, wind: 0.1 }, night ? {} : { seagulls: 0.25 }); break;
    case 'forest': Object.assign(m, { stream: 0.18 }, night ? { crickets: 0.32, owl: 0.3 } : { birds: 0.3 }); break;
    case 'village': Object.assign(m, { wind: 0.08 }, night ? { crickets: 0.3 } : { birds: 0.22 }); break;
    case 'ricefield': Object.assign(m, { stream: 0.24 }, night ? { crickets: 0.35 } : { birds: 0.2 }); break;
    default: break;
  }
  if (weather === 'rain' || weather === 'storm' || weather === 'snow') { delete m.birds; delete m.crickets; delete m.seagulls; delete m.owl; }
  if (weather === 'rain') m.rain = 0.6;
  if (weather === 'storm') Object.assign(m, { heavyrain: 0.65, thunder: 0.6, wind: 0.3 });
  if (weather === 'snow') m.wind = Math.max(m.wind || 0, 0.35);
  if (weather === 'fog') m.wind = Math.max(m.wind || 0, 0.15);
  return m;
}

// ==================================================================================================
// Gaya "painted lofi": palet dingin (teal/biru keabuan) dengan aksen hangat, atmospheric perspective
// (yang jauh memudar ke kabut), bayangan & cahaya lembut, rim light, serat kayu, dan grain film.
// ==================================================================================================
/** Warna benda di luar: gelap saat malam, kelabu saat mendung, hangat saat senja. */
function outCol(base, L, P, depth = 0) {
  let c = H(base);
  c = M(c, H('8fa3ad'), L.overcast * 0.35);
  c = M(c, H('ff9a5c'), L.warm * 0.45);
  c = M(c, H('0a1222'), L.dark * 0.9);
  return M(c, P.haze, depth); // atmospheric perspective
}
// kompatibel: dipakai elemen bergerak
let curL = lighting('night', 'clear');
let curP = palette('night', curL);
const outTint = (base, L) => C(outCol(base, L || curL, curP));

// ---------- bentuk alam
function jaggedPine(c, x, y, h, col, r) {
  const tiers = 6;
  const left = [];
  for (let k = 0; k < tiers; k++) {
    const ty = y - h + ((k + 1) * h) / tiers;
    const hw = h * (0.07 + k * 0.055);
    left.push([x - hw * (0.85 + r() * 0.3), ty], [x - hw * 0.42, ty - h * 0.035]);
  }
  c.fillStyle = col;
  c.beginPath(); c.moveTo(x, y - h);
  left.forEach(([px, py]) => c.lineTo(px, py));
  c.lineTo(x - h * 0.05, y); c.lineTo(x + h * 0.05, y);
  for (let i = left.length - 1; i >= 0; i--) { const [px, py] = left[i]; c.lineTo(x + (x - px) * (0.9 + r() * 0.2), py); }
  c.closePath(); c.fill();
}
function treeBand(c, y, col, r, { minH = 30, maxH = 60, gap = [10, 20], fill = true } = {}) {
  const css2 = C(col);
  if (fill) { c.fillStyle = css2; c.fillRect(OW.x, y, OW.w, BT - y + 2); }
  for (let x = OW.x - 20; x < OW.x + OW.w + 20; x += gap[0] + r() * (gap[1] - gap[0])) jaggedPine(c, x, y + 4 + r() * 6, minH + r() * (maxH - minH), css2, r);
}
function mountain(c, pts, base, amp, col, P, r, { snow = false, mist = 0.45 } = {}) {
  const n = pts.length - 1;
  const xy = pts.map((v, i) => [OW.x + (i / n) * OW.w, base - v * amp]);
  const top = Math.min(...xy.map((p) => p[1]));
  c.fillStyle = lin(c, 0, top, 0, base + 10, [[0, C(LI(col, 0.06))], [0.6, C(col)], [1, C(M(col, P.haze, mist))]]);
  c.beginPath(); c.moveTo(OW.x, BT); xy.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(OW.x + OW.w, BT); c.closePath(); c.fill();
  // volume: lereng kiri terkena cahaya, lereng kanan dalam bayangan, salju di puncak (semua di dalam siluet)
  c.save();
  c.beginPath(); c.moveTo(OW.x, BT); xy.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(OW.x + OW.w, BT); c.closePath(); c.clip();
  for (let i = 1; i < n; i++) {
    if (!(pts[i] > pts[i - 1] && pts[i] >= pts[i + 1] && pts[i] > 0.3)) continue;
    let j = i; while (j > 0 && pts[j - 1] < pts[j]) j--;
    let k = i; while (k < n && pts[k + 1] < pts[k]) k++;
    const [px, py] = xy[i];
    const foot = base + 12;
    const sx = px - (foot - py) * (0.25 + r() * 0.15); // "tulang" lereng dari puncak turun ke kiri
    c.fillStyle = lin(c, 0, py, 0, foot, [[0, C(LI(col, 0.2), 0.5)], [1, C(LI(col, 0.2), 0)]]);
    c.beginPath(); for (let q = j; q <= i; q++) c.lineTo(xy[q][0], xy[q][1]);
    c.lineTo(sx, foot); c.closePath(); c.fill();
    c.fillStyle = lin(c, 0, py, 0, foot, [[0, C(DA(col, 0.22), 0.4)], [1, C(DA(col, 0.22), 0)]]);
    c.beginPath(); c.moveTo(px, py); for (let q = i; q <= k; q++) c.lineTo(xy[q][0], xy[q][1]);
    c.lineTo(xy[k][0] - (foot - xy[k][1]) * 0.3, foot); c.lineTo(sx, foot); c.closePath(); c.fill();
    // guratan lembah tipis
    c.strokeStyle = C(DA(col, 0.3), 0.25); c.lineWidth = 1.5;
    for (let g = 0; g < 3; g++) { const sx = px + (r() - 0.6) * 40; c.beginPath(); c.moveTo(sx, py + 14 + g * 10); c.quadraticCurveTo(sx - 10 + r() * 20, py + (foot - py) * 0.4, sx - 30 + r() * 60, py + (foot - py) * (0.6 + r() * 0.3)); c.stroke(); }
  }
  if (snow) {
    const top = Math.min(...xy.map((p) => p[1]));
    const line = top + amp * 0.3;
    c.fillStyle = 'rgba(236,242,248,0.88)';
    c.beginPath(); c.moveTo(OW.x, top - 5);
    c.lineTo(OW.x + OW.w, top - 5);
    for (let x = OW.x + OW.w; x >= OW.x; x -= 14) c.lineTo(x, line + Math.sin(x * 0.13) * 8 + (r() - 0.5) * 14);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(120,140,160,0.25)'; // sisi kanan salju lebih gelap
    for (let i = 1; i < n; i++) if (pts[i] > pts[i - 1] && pts[i] >= pts[i + 1]) { const [px, py] = xy[i]; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 40, py + 40); c.lineTo(px + 6, py + 44); c.closePath(); c.fill(); }
  }
  c.restore();
}
function mistBand(c, y, hgt, P, a) {
  c.fillStyle = lin(c, 0, y - hgt, 0, y + hgt, [[0, C(LI(P.haze, 0.15), 0)], [0.5, C(LI(P.haze, 0.15), a)], [1, C(LI(P.haze, 0.15), 0)]]);
  c.fillRect(OW.x, y - hgt, OW.w, hgt * 2);
}
function cloudMass(c, x, y, s, col, a) {
  for (let j = 0; j < 7; j++) {
    const cx = x + (j - 3) * 46 * s; const cy = y + Math.sin(j * 1.7) * 10 * s - (j % 3 === 1 ? 14 * s : 0);
    const g = c.createRadialGradient(cx, cy - 8 * s, 4, cx, cy, 70 * s);
    g.addColorStop(0, C(LI(col, 0.12), a)); g.addColorStop(1, C(col, 0));
    c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy, 80 * s, 40 * s, 0, 0, TAU); c.fill();
  }
}

// ------------------------------------------------------------------ pemandangan luar (statis)
function drawOutside(c, s) {
  const { loc, weather, time } = s;
  const L = lighting(time, weather);
  const P = palette(time, L);
  const r = seeded({ mountain: 11, city: 22, beach: 33, forest: 44, village: 55, ricefield: 66 }[loc] || 7);
  const night = time === 'night';
  const lit = night || (time === 'dusk' && L.overcast > 0.2);
  const oc = (b, d) => outCol(b, L, P, d);
  // langit
  c.fillStyle = lin(c, 0, OW.y, 0, HZ + 20, [[0, C(P.top)], [1, C(P.bot)]]);
  c.fillRect(OW.x, OW.y, OW.w, OW.h);
  if (night && L.overcast < 0.35) for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,252,235,${0.25 + r() * 0.6})`; c.fillRect(OW.x + r() * OW.w, OW.y + r() * (HZ - OW.y) * 0.9, r() < 0.1 ? 2.2 : 1.4, r() < 0.1 ? 2.2 : 1.4); }
  if (L.overcast < 0.55) {
    const sun = !night;
    const bx = W.x + W.w * (time === 'morning' ? 0.22 : time === 'dusk' ? 0.7 : 0.78);
    const by = W.y + W.h * (time === 'day' ? 0.15 : night ? 0.14 : 0.38);
    const rad = sun ? 30 : 24;
    glow(c, bx, by, rad * 7, sun ? H(time === 'dusk' ? 'ffbf8a' : 'fff0cf') : H('d8e2f0'), (sun ? 0.55 : 0.3) * (1 - L.overcast));
    c.fillStyle = sun ? (time === 'dusk' ? '#ffd7a8' : '#fff6dd') : '#eef0ea';
    c.globalAlpha = 1 - L.overcast * 0.9; c.beginPath(); c.arc(bx, by, rad, 0, TAU); c.fill(); c.globalAlpha = 1;
  }
  // gumpalan awan statis di dekat cakrawala
  const cloudCol = night ? M(P.top, [80, 95, 120], 0.4) : M(P.bot, [255, 255, 255], 0.35);
  for (let i = 0; i < 4 + Math.round(L.overcast * 6); i++) cloudMass(c, OW.x + r() * OW.w, OW.y + 30 + r() * (HZ - OW.y - 110), 0.7 + r() * 0.8, cloudCol, 0.35 + L.overcast * 0.35);

  const scenery = {
    mountain() {
      const rm = seeded(101); // seed tetap supaya pantulan di danau sama persis
      mountain(c, ridgeLine(33, 0.55, rm), HZ - 6, 200, oc('86a0ad', 0.6), P, rm, { snow: weather === 'snow', mist: 0.6 });
      mistBand(c, HZ - 40, 30, P, 0.35 + L.overcast * 0.3);
      mountain(c, ridgeLine(33, 0.6, rm), HZ + 4, 130, oc('5f7d8b', 0.4), P, rm, { mist: 0.5 });
      mistBand(c, HZ - 4, 22, P, 0.3 + L.overcast * 0.3);
      treeBand(c, HZ + 8, oc('3a5660', 0.28), rm, { minH: 18, maxH: 34, gap: [7, 13] });
    },
  };
  if (loc === 'mountain') {
    scenery.mountain();
    // danau dengan pantulan
    const lakeTop = HZ + 14;
    c.fillStyle = lin(c, 0, lakeTop, 0, BT, [[0, C(oc('8ea7b2', 0.35))], [1, C(oc('46636f', 0.12))]]);
    c.fillRect(OW.x, lakeTop, OW.w, BT - lakeTop);
    c.save(); c.beginPath(); c.rect(OW.x, lakeTop, OW.w, BT - lakeTop); c.clip();
    c.translate(0, 2 * lakeTop); c.scale(1, -1); c.globalAlpha = 0.28;
    scenery.mountain();
    c.restore();
    c.strokeStyle = C(LI(P.haze, 0.3), 0.18); c.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) { const y = lakeTop + 4 + r() * (BT - lakeTop - 70); const x = OW.x + r() * OW.w; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 20 + r() * 60, y); c.stroke(); }
    // hutan depan (kiri & kanan) sebagai bingkai
    const near = oc('22373d', 0.05);
    c.fillStyle = C(near); c.beginPath(); c.moveTo(OW.x + OW.w, BT); c.lineTo(OW.x + OW.w, BT - 150); c.quadraticCurveTo(OW.x + OW.w - 180, BT - 70, OW.x + OW.w - 360, BT); c.fill();
    for (let i = 0; i < 12; i++) jaggedPine(c, OW.x + OW.w - 20 - r() * 300, BT - 30 + r() * 30, 90 + r() * 110, C(near), r);
    c.beginPath(); c.moveTo(OW.x, BT); c.lineTo(OW.x, BT - 110); c.quadraticCurveTo(OW.x + 120, BT - 60, OW.x + 230, BT); c.fill();
    for (let i = 0; i < 7; i++) jaggedPine(c, OW.x + 10 + r() * 200, BT - 24 + r() * 20, 70 + r() * 90, C(near), r);
  } else if (loc === 'city') {
    mistBand(c, HZ - 60, 60, P, 0.25);
    const layer = (depth, minH, maxH, base, win) => {
      let x = OW.x - 10;
      const col = oc(base, depth);
      while (x < OW.x + OW.w) {
        const bw = 36 + r() * 70; const bh = minH + r() * (maxH - minH);
        const top = BT - 30 - bh;
        c.fillStyle = lin(c, x, 0, x + bw, 0, [[0, C(LI(col, 0.07))], [0.35, C(col)], [1, C(DA(col, 0.12))]]);
        c.fillRect(x, top, bw, bh + 40);
        if (r() < 0.35) { c.fillStyle = C(DA(col, 0.1)); c.fillRect(x + bw * 0.2, top - 10, bw * 0.25, 10); }
        if (r() < 0.25) { c.fillStyle = C(col); c.fillRect(x + bw * 0.6, top - 26, 3, 26); }
        for (let wy = top + 10; wy < BT - 34; wy += 13) for (let wx = x + 5; wx < x + bw - 7; wx += 10) {
          const on = lit ? r() < 0.4 : r() < 0.08;
          if (on) { c.fillStyle = lit ? C(win, 0.55 + r() * 0.4) : C(LI(P.haze, 0.3), 0.35); c.fillRect(wx, wy, 4.5, 6.5); }
        }
        x += bw + 2 + r() * 8;
      }
    };
    layer(0.6, 140, 280, '7c8fa0', [255, 214, 150]);
    mistBand(c, BT - 140, 40, P, 0.25 + L.overcast * 0.2);
    layer(0.3, 90, 210, '4c5f70', [255, 205, 130]);
    layer(0.08, 40, 120, '2b3946', [255, 196, 120]);
    // jalan basah
    c.fillStyle = C(oc('1f2a33', 0.05)); c.fillRect(OW.x, BT - 30, OW.w, 32);
    if (lit) for (let x = OW.x + 30; x < OW.x + OW.w; x += 86) { glow(c, x, BT - 34, 26, [255, 200, 130], 0.7); if (L.overcast > 0.4) { c.fillStyle = 'rgba(255,200,130,0.25)'; c.fillRect(x - 2, BT - 28, 4, 26); } }
  } else if (loc === 'beach') {
    mountain(c, ridgeLine(33, 0.5, r).map((v, i) => (i < 12 ? v : v * 0.15)), HZ, 70, oc('6c8796', 0.5), P, r, { mist: 0.5 });
    const seaTop = HZ + 2;
    c.fillStyle = lin(c, 0, seaTop, 0, BT, [[0, C(oc('7fa6bb', 0.35))], [0.5, C(oc('3e6f8c', 0.12))], [1, C(oc('2a5470', 0.04))]]);
    c.fillRect(OW.x, seaTop, OW.w, BT - seaTop);
    if (L.overcast < 0.55) { const sx = W.x + W.w * (time === 'morning' ? 0.22 : time === 'dusk' ? 0.7 : 0.78); c.fillStyle = lin(c, sx - 60, 0, sx + 60, 0, [[0, 'rgba(255,230,190,0)'], [0.5, `rgba(255,230,190,${0.25 * (1 - L.overcast)})`], [1, 'rgba(255,230,190,0)']]); c.fillRect(sx - 60, seaTop, 120, BT - seaTop - 60); }
    c.fillStyle = lin(c, 0, BT - 90, 0, BT, [[0, C(oc('d9c19a', 0.1))], [1, C(oc('b89a74', 0))]]);
    c.beginPath(); c.moveTo(OW.x, BT + 2); c.lineTo(OW.x, BT - 64); c.quadraticCurveTo(OW.x + OW.w * 0.5, BT - 96, OW.x + OW.w, BT - 44); c.lineTo(OW.x + OW.w, BT + 2); c.fill();
    const trunk = C(oc('3a2e26', 0)); const frond = oc('1f3533', 0);
    [[OW.x + OW.w - 130, BT - 50, 1], [OW.x + OW.w - 40, BT - 40, 0.78], [OW.x + 60, BT - 56, 0.7]].forEach(([x, y, k], idx) => {
      const dir = idx === 2 ? 1 : -1;
      c.strokeStyle = trunk; c.lineWidth = 13 * k; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + dir * 40 * k, y - 170 * k, x + dir * 70 * k, y - 310 * k); c.stroke();
      const tx = x + dir * 70 * k; const ty = y - 310 * k;
      for (let a = 0; a < 9; a++) {
        const ang = -Math.PI + a * 0.39 + (r() - 0.5) * 0.2;
        const len = (110 + r() * 40) * k;
        c.strokeStyle = C(frond); c.lineWidth = 3 * k;
        c.beginPath(); c.moveTo(tx, ty);
        const ex = tx + Math.cos(ang) * len; const ey = ty + Math.sin(ang) * len * 0.55 + len * 0.35;
        const mx = tx + Math.cos(ang) * len * 0.5; const my = ty + Math.sin(ang) * len * 0.5 - 10;
        c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
        for (let f = 0.15; f < 1; f += 0.08) { const px = tx + (ex - tx) * f; const py = ty + (ey - ty) * f - Math.sin(f * Math.PI) * 12; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 6 * k, py + 16 * k * (1 - f * 0.5)); c.stroke(); }
      }
    });
  } else if (loc === 'forest') {
    const cols = [['8fa6ad', 0.65], ['6d8890', 0.48], ['50707a', 0.32], ['375560', 0.16], ['223a42', 0.03]];
    cols.forEach(([b, d], i) => {
      const y = HZ - 80 + i * 50;
      treeBand(c, y, oc(b, d), r, { minH: 40 + i * 22, maxH: 70 + i * 34, gap: [12 + i * 6, 22 + i * 12] });
      if (i < 4) mistBand(c, y + 18, 26, P, 0.35 + L.overcast * 0.25);
    });
  } else if (loc === 'village') {
    mountain(c, ridgeLine(33, 0.5, r), HZ - 10, 120, oc('7d97a3', 0.55), P, r, { mist: 0.6 });
    mistBand(c, HZ - 10, 26, P, 0.35);
    const hill = (base, amp, b, d) => { const pts = ridgeLine(17, 0.42, r); const col = oc(b, d); c.fillStyle = lin(c, 0, base - amp, 0, BT, [[0, C(LI(col, 0.08))], [1, C(DA(col, 0.15))]]); c.beginPath(); c.moveTo(OW.x, BT); pts.forEach((v, i) => c.lineTo(OW.x + (i / 16) * OW.w, base - v * amp)); c.lineTo(OW.x + OW.w, BT); c.fill(); };
    hill(HZ + 20, 60, '7fa078', 0.35);
    // pohon bulat & rumah
    const blob = (x, y, rad, col) => { c.fillStyle = C(col); for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + (k - 2) * rad * 0.45, y - Math.abs(k - 2) * -rad * 0.15 - (k === 2 ? rad * 0.35 : 0), rad * (0.7 + (k % 2) * 0.2), 0, TAU); c.fill(); } c.fillStyle = C(LI(col, 0.12), 0.6); c.beginPath(); c.arc(x - rad * 0.3, y - rad * 0.5, rad * 0.45, 0, TAU); c.fill(); };
    for (let i = 0; i < 14; i++) blob(OW.x + r() * OW.w, HZ + 40 + r() * 20, 12 + r() * 10, oc('4f6e4c', 0.3));
    hill(HZ + 80, 50, '5e8456', 0.12);
    const houses = [[OW.x + 150, HZ + 92], [OW.x + 280, HZ + 106], [OW.x + 540, HZ + 84], [OW.x + 660, HZ + 100], [OW.x + 840, HZ + 116]];
    houses.forEach(([x, y], i) => {
      const wall = oc(['e3d6c0', 'd4c3a6', 'ece2cf'][i % 3], 0.12);
      c.fillStyle = C(wall); c.fillRect(x, y - 32, 50, 32);
      c.fillStyle = C(DA(wall, 0.25)); c.fillRect(x + 34, y - 32, 16, 32);
      const roof = oc(['8f4a3a', '6e4636', '5a4a63'][i % 3], 0.12);
      c.fillStyle = C(roof); c.beginPath(); c.moveTo(x - 7, y - 32); c.lineTo(x + 25, y - 56); c.lineTo(x + 57, y - 32); c.fill();
      c.fillStyle = C(DA(roof, 0.25)); c.beginPath(); c.moveTo(x + 25, y - 56); c.lineTo(x + 57, y - 32); c.lineTo(x + 40, y - 32); c.fill();
      c.fillStyle = C(DA(roof, 0.1)); c.fillRect(x + 36, y - 60, 7, 16);
      c.fillStyle = lit ? 'rgba(255,200,120,0.95)' : C(oc('5e7385', 0.1)); c.fillRect(x + 8, y - 24, 9, 9); c.fillRect(x + 22, y - 24, 9, 9);
      if (lit) glow(c, x + 20, y - 18, 30, [255, 190, 110], 0.35);
    });
    c.strokeStyle = C(oc('5a4636', 0.05)); c.lineWidth = 2;
    c.beginPath(); for (let x = OW.x; x < OW.x + OW.w; x += 22) { c.moveTo(x, BT - 46); c.lineTo(x, BT - 62); } c.moveTo(OW.x, BT - 56); c.lineTo(OW.x + OW.w, BT - 56); c.stroke();
    hill(BT - 24, 24, '46693f', 0.02);
    // menara kincir (baling-baling bergerak)
    const tw = oc('d3c8b2', 0.15);
    c.fillStyle = lin(c, W.x + 1030, 0, W.x + 1070, 0, [[0, C(LI(tw, 0.1))], [1, C(DA(tw, 0.2))]]);
    c.beginPath(); c.moveTo(W.x + 1028, HZ + 72); c.lineTo(W.x + 1043, HZ - 30); c.lineTo(W.x + 1057, HZ - 30); c.lineTo(W.x + 1072, HZ + 72); c.fill();
  } else if (loc === 'ricefield') {
    const vol = oc('71879b', 0.5);
    c.fillStyle = lin(c, W.x + 400, 0, W.x + 880, 0, [[0, C(LI(vol, 0.1))], [0.5, C(vol)], [1, C(DA(vol, 0.15))]]);
    c.beginPath(); c.moveTo(W.x + 360, HZ + 14); c.quadraticCurveTo(W.x + 520, W.y + 140, W.x + 588, W.y + 92); c.lineTo(W.x + 642, W.y + 90); c.quadraticCurveTo(W.x + 720, W.y + 150, W.x + 900, HZ + 14); c.fill();
    c.strokeStyle = C(DA(vol, 0.15), 0.6); c.lineWidth = 2;
    for (let k = 0; k < 9; k++) { const x0 = W.x + 590 + k * 6 - 20; c.beginPath(); c.moveTo(x0, W.y + 100); c.quadraticCurveTo(x0 - 40 + k * 10, W.y + 200, x0 - 120 + k * 32, HZ + 10); c.stroke(); }
    mistBand(c, HZ - 20, 30, P, 0.35 + L.overcast * 0.2);
    mountain(c, ridgeLine(17, 0.5, r), HZ + 18, 48, oc('5b7f5a', 0.3), P, r, { mist: 0.4 });
    const greens = ['9cbf68', '87ae57', '76a04c', '659343', '548439'];
    for (let i = 0; i < 6; i++) {
      const y0 = HZ + 34 + i * 26;
      const col = oc(greens[i % greens.length], Math.max(0, 0.22 - i * 0.04));
      c.fillStyle = lin(c, 0, y0 - 10, 0, y0 + 30, [[0, C(LI(col, 0.06))], [1, C(DA(col, 0.12))]]);
      c.beginPath(); c.moveTo(OW.x, BT);
      for (let x = 0; x <= OW.w; x += 30) c.lineTo(OW.x + x, y0 + Math.sin(x * 0.006 + i) * 10);
      c.lineTo(OW.x + OW.w, BT); c.fill();
      c.strokeStyle = C(LI(P.haze, 0.4), 0.4 * (1 - L.dark)); c.lineWidth = 1.5;
      c.beginPath(); for (let x = 0; x <= OW.w; x += 30) c.lineTo(OW.x + x, y0 + Math.sin(x * 0.006 + i) * 10); c.stroke();
    }
    const trunk = C(oc('3c3027', 0)); const frond = C(oc('24402c', 0));
    [[OW.x + 80, BT - 30], [OW.x + OW.w - 100, BT - 20]].forEach(([x, y]) => {
      c.strokeStyle = trunk; c.lineWidth = 8; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 15, y - 120, x + 5, y - 240); c.stroke();
      c.strokeStyle = frond; c.lineWidth = 3;
      for (let a = 0; a < 10; a++) { const ang = (a / 10) * TAU; const ex = x + 5 + Math.cos(ang) * 70; const ey = y - 240 + Math.sin(ang) * 26 + 20; c.beginPath(); c.moveTo(x + 5, y - 240); c.quadraticCurveTo(x + 5 + Math.cos(ang) * 35, y - 252, ex, ey); c.stroke(); }
    });
  }
  if (weather === 'snow') c.fillStyle = lin(c, 0, BT - 60, 0, BT, [[0, 'rgba(235,242,250,0)'], [1, `rgba(235,242,250,${0.55 - L.dark * 0.3})`]]), c.fillRect(OW.x, BT - 60, OW.w, 62);
  // kabut tipis menyeluruh saat mendung/hujan
  if (L.overcast > 0.25) { c.fillStyle = C(P.haze, L.overcast * 0.22); c.fillRect(OW.x, OW.y, OW.w, OW.h); }
}

// ------------------------------------------------------------------ interior (statis)

function drawRoom(c, s, L) {
  const r = seeded(9);
  const P = palette(s.time, L);
  const outsideLight = M(P.bot, [255, 255, 255], 0.2);
  // dinding teal keabuan
  c.fillStyle = lin(c, 0, 0, 0, VH, [[0, '#35474f'], [0.6, '#2c3c43'], [1, '#243237']]);
  c.fillRect(0, 0, VW, VH);
  // tekstur plester halus
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.025)`; c.fillRect(r() * VW, r() * 610, 2 + r() * 3, 2 + r() * 3); }
  // panel kayu bawah
  woodGrain(c, 0, 612, VW, 288, H('2e2622'), { vertical: true, planks: 20, a: 0.12 });
  c.fillStyle = '#211b18'; c.fillRect(0, 604, VW, 10);
  c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, 604, VW, 2);
  // lubang jendela + cahaya luar yang menyinari dinding sekitar
  c.fillStyle = lin(c, 0, W.y - 60, 0, W.y + W.h + 120, [[0, C(outsideLight, 0)], [0.5, C(outsideLight, 0.08 * (1 - L.dark))], [1, C(outsideLight, 0)]]);
  c.fillRect(W.x - 160, W.y - 60, W.w + 320, W.h + 180);
  c.clearRect(W.x, W.y, W.w, W.h);
  // kusen kayu gelap dengan bevel
  const frame = H('2b211c');
  const bar = (x, y, w, h, light = true) => {
    c.fillStyle = C(frame); c.fillRect(x, y, w, h);
    if (light) { c.fillStyle = C(M(frame, outsideLight, 0.35), 0.8); if (w > h) c.fillRect(x, y + h - 3, w, 3); else c.fillRect(x + w - 3, y, 3, h); }
    c.fillStyle = 'rgba(0,0,0,0.3)'; if (w > h) c.fillRect(x, y, w, 2); else c.fillRect(x, y, 2, h);
  };
  bar(W.x - 24, W.y - 24, W.w + 48, 24); bar(W.x - 24, W.y + W.h, W.w + 48, 12);
  bar(W.x - 24, W.y, 24, W.h); bar(W.x + W.w, W.y, 24, W.h);
  bar(W.x + W.w / 3 - 8, W.y, 16, W.h); bar(W.x + (2 * W.w) / 3 - 8, W.y, 16, W.h);
  bar(W.x, W.y + 138, W.w, 12);
  // ambang jendela kayu
  woodGrain(c, W.x - 46, W.y + W.h + 8, W.w + 92, 22, H('4a3830'), { a: 0.15 });
  c.fillStyle = C(M(H('4a3830'), outsideLight, 0.3)); c.fillRect(W.x - 46, W.y + W.h + 8, W.w + 92, 3);
  c.fillStyle = '#2a201b'; c.fillRect(W.x - 46, W.y + W.h + 30, W.w + 92, 9);
  softShadow(c, W.x + W.w / 2, W.y + W.h + 50, W.w * 0.55, 18, 0.4);
  // balok plafon
  woodGrain(c, 0, 0, VW, 44, H('1f1916'), { a: 0.18 });
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(0, 42, VW, 2);
  // rak buku kiri
  woodGrain(c, 22, 126, 226, 708, H('2a201b'), { vertical: true, a: 0.14 });
  c.fillStyle = '#18120f'; c.fillRect(36, 140, 198, 680);
  const books = ['3d6468', 'b18a4c', '8f4a37', 'cfc2a6', '394760', '5c7863', '6f5568', 'b89c78', '4f6f78'];
  [272, 412, 552, 692, 820].forEach((sy, si) => {
    c.fillStyle = lin(c, 0, sy - 140, 0, sy, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(36, sy - 140, 198, 140);
    woodGrain(c, 36, sy, 198, 12, H('3d2d24'), { a: 0.18 });
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(36, sy, 198, 2);
    if (si === 4) return;
    let x = 42;
    while (x < 222) {
      const bw = 12 + r() * 14; const bh = 72 + r() * 52;
      if ((si === 1 || si === 3) && x > 148) break;
      const col = H(books[Math.floor(r() * books.length)]);
      const draw = () => {
        c.fillStyle = lin(c, 0, 0, bw, 0, [[0, C(LI(col, 0.1))], [0.5, C(col)], [1, C(DA(col, 0.3))]]); c.fillRect(0, -bh, bw, bh);
        c.fillStyle = C(LI(col, 0.35), 0.5); c.fillRect(2, -bh + 12, bw - 4, 2); c.fillRect(2, -16, bw - 4, 2);
      };
      c.save(); c.translate(x, sy);
      if (r() < 0.1 && x < 190) { c.rotate(-0.18); draw(); c.restore(); x += bw + 16; continue; }
      draw(); c.restore();
      x += bw + 1.5;
    }
  });
  // piringan hitam, bola dunia, lilin aroma
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#141417' : '#1d1d22'; c.fillRect(158 + i * 6, 692 - 112, 4, 112); }
  c.fillStyle = lin(c, 160, 0, 230, 0, [[0, '#a8513e'], [1, '#7a3a2c']]); c.fillRect(186, 692 - 104, 40, 104);
  const gx = 190; const gy = 412 - 40;
  c.fillStyle = c.createRadialGradient(gx - 10, gy - 12, 4, gx, gy, 30); c.fillStyle.addColorStop(0, '#7fa6bf'); c.fillStyle.addColorStop(1, '#3d5f78');
  c.beginPath(); c.arc(gx, gy, 28, 0, TAU); c.fill();
  c.fillStyle = 'rgba(120,160,110,0.8)'; c.beginPath(); c.ellipse(gx - 6, gy - 6, 12, 9, 0.5, 0, TAU); c.fill();
  c.strokeStyle = '#6b5236'; c.lineWidth = 3; c.beginPath(); c.arc(gx, gy, 33, -2.4, 0.9); c.stroke();
  c.fillStyle = '#5a4430'; c.fillRect(gx - 18, 412 - 10, 36, 10);
  // tirai berlipit (bahan tebal, warna karat redup)
  const curtain = (x0, x1) => {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    for (let k = 0; k <= 8; k++) g.addColorStop(k / 8, k % 2 ? '#5b423b' : '#7a5a50');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x0, 94); c.lineTo(x1, 94); c.quadraticCurveTo(x1 - 12, 380, x1 + 8, 648); c.lineTo(x0 - 8, 648); c.quadraticCurveTo(x0 + 12, 380, x0, 94); c.fill();
    c.fillStyle = lin(c, 0, 94, 0, 648, [[0, 'rgba(0,0,0,0.25)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]); c.fill();
  };
  curtain(232, 336); curtain(1264, 1368);
  c.fillStyle = '#1b1512'; c.fillRect(206, 88, 1188, 8);
  c.beginPath(); c.arc(206, 92, 9, 0, TAU); c.arc(1394, 92, 9, 0, TAU); c.fill();
  // barang di ambang jendela
  const sill = W.y + W.h + 8;
  softShadow(c, 425, sill + 2, 34, 6); softShadow(c, 495, sill + 2, 22, 5); softShadow(c, 573, sill + 2, 24, 5);
  c.fillStyle = lin(c, 404, 0, 446, 0, [[0, '#b0644a'], [1, '#7c4232']]); c.beginPath(); c.moveTo(410, sill); c.lineTo(403, sill - 34); c.lineTo(447, sill - 34); c.lineTo(440, sill); c.fill();
  for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#4d7a5c' : '#3e6650'; c.beginPath(); c.ellipse(425 + Math.cos(i * 0.9) * 13, sill - 44 - Math.sin(i * 1.7) * 7, 9, 17, i * 0.8, 0, TAU); c.fill(); }
  c.fillStyle = '#d6cfc4'; rr(c, 480, sill - 30, 30, 30, 6); c.fill();
  c.fillStyle = lin(c, 474, 0, 504, 0, [[0, '#6f9a74'], [1, '#456b4d']]); rr(c, 486, sill - 74, 18, 46, 9); c.fill(); rr(c, 473, sill - 58, 12, 22, 6); c.fill();
  c.fillStyle = '#26211f'; rr(c, 556, sill - 56, 34, 56, 4); c.fill();
  c.fillStyle = 'rgba(255,225,180,0.18)'; c.fillRect(561, sill - 48, 24, 40);
  // tanaman besar kanan: pot terakota (daun digambar bergerak)
  softShadow(c, 1431, 838, 70, 10, 0.5);
  c.fillStyle = lin(c, 1384, 0, 1478, 0, [[0, '#b46849'], [0.6, '#934f36'], [1, '#6e3a28']]);
  c.beginPath(); c.moveTo(1384, 744); c.lineTo(1478, 744); c.lineTo(1466, 838); c.lineTo(1396, 838); c.fill();
  c.fillStyle = '#7f4430'; c.fillRect(1378, 738, 106, 14); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(1378, 738, 106, 2);
  // lampu berdiri
  c.strokeStyle = '#1d1a19'; c.lineWidth = 6; c.beginPath(); c.moveTo(1540, 838); c.lineTo(1540, 340); c.stroke();
  c.fillStyle = '#1d1a19'; c.beginPath(); c.ellipse(1540, 840, 40, 9, 0, 0, TAU); c.fill();
  c.fillStyle = lin(c, 1496, 0, 1584, 0, [[0, '#e9d4ad'], [1, '#bfa682']]);
  c.beginPath(); c.moveTo(1494, 362); c.lineTo(1586, 362); c.lineTo(1568, 296); c.lineTo(1512, 296); c.fill();
  // lantai kanan
  woodGrain(c, 1490, 838, 110, 62, H('2c211b'), { planks: 3, a: 0.15 });
  // meja kayu (depan)
  c.save();
  c.beginPath(); c.moveTo(70, 714); c.lineTo(1530, 714); c.lineTo(1650, VH); c.lineTo(-50, VH); c.closePath(); c.clip();
  woodGrain(c, -50, 714, 1700, 190, H('4a3227'), { planks: 5, a: 0.13 });
  c.fillStyle = lin(c, 0, 714, 0, VH, [[0, 'rgba(255,220,180,0.06)'], [1, 'rgba(0,0,0,0.35)']]); c.fillRect(-50, 714, 1700, 190);
  c.restore();
  c.fillStyle = '#6a4836'; c.fillRect(70, 708, 1460, 8); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(70, 708, 1460, 2);
  // tumpukan buku
  softShadow(c, 220, 790, 130, 14, 0.45);
  [['394760', 0], ['b18a4c', 1], ['5c7863', 2]].forEach(([col, i]) => {
    const cc = H(col);
    c.fillStyle = lin(c, 0, 772 - i * 22, 0, 794 - i * 22, [[0, C(LI(cc, 0.12))], [1, C(DA(cc, 0.25))]]);
    rr(c, 120 + i * 4, 772 - i * 22, 200 - i * 10, 22, 3); c.fill();
    c.fillStyle = '#e4dccb'; c.fillRect(126 + i * 4, 776 - i * 22, 186 - i * 10, 4);
  });
  // laptop (layar menghadap kita)
  softShadow(c, 510, 812, 210, 16, 0.5);
  c.fillStyle = lin(c, 360, 590, 660, 780, [[0, '#3a3f47'], [1, '#22252b']]); rr(c, 360, 590, 300, 190, 10); c.fill();
  c.fillStyle = '#0f1116'; rr(c, 372, 602, 276, 164, 4); c.fill();
  c.fillStyle = lin(c, 0, 780, 0, 808, [[0, '#4a4f58'], [1, '#2c3036']]); c.beginPath(); c.moveTo(340, 780); c.lineTo(680, 780); c.lineTo(702, 808); c.lineTo(318, 808); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(340, 780, 340, 2);
  c.fillStyle = '#3b4048'; c.fillRect(470, 795, 80, 6);
  // layar: pemutar musik bernuansa teal
  c.fillStyle = lin(c, 372, 602, 648, 766, [[0, '#1f3540'], [1, '#162530']]); c.fillRect(372, 602, 276, 164);
  c.fillStyle = lin(c, 392, 622, 482, 712, [[0, '#f0a274'], [1, '#c9694f']]); rr(c, 392, 622, 90, 90, 8); c.fill();
  c.fillStyle = 'rgba(255,240,225,0.85)'; c.beginPath(); c.arc(437, 667, 25, 0, TAU); c.fill(); c.fillStyle = '#1f3540'; c.beginPath(); c.arc(437, 667, 6, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(500, 632, 120, 8);
  c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(500, 650, 84, 6);
  for (let b = 0; b < 16; b++) { const hh = 6 + Math.abs(Math.sin(b * 1.7)) * 22; c.fillStyle = 'rgba(120,210,200,0.6)'; c.fillRect(500 + b * 8, 708 - hh, 5, hh); }
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(392, 732, 236, 4);
  c.fillStyle = '#f0a274'; c.fillRect(392, 732, 100, 4);
  // mug (uap digambar bergerak)
  softShadow(c, 772, 806, 50, 9, 0.5);
  c.fillStyle = lin(c, 735, 0, 797, 0, [[0, '#ece6dc'], [0.6, '#cfc7ba'], [1, '#a59d91']]); rr(c, 735, 736, 62, 70, 8); c.fill();
  c.strokeStyle = '#bdb5a9'; c.lineWidth = 9; c.beginPath(); c.arc(800, 769, 16, -1.2, 1.2); c.stroke();
  c.fillStyle = '#4a2f1e'; c.beginPath(); c.ellipse(766, 740, 27, 6, 0, 0, TAU); c.fill();
  c.fillStyle = '#b8614a'; c.fillRect(735, 762, 62, 10);
  // buku catatan terbuka + pena
  softShadow(c, 980, 842, 130, 12, 0.4);
  c.fillStyle = lin(c, 860, 790, 1095, 850, [[0, '#efe6d2'], [0.48, '#dfd5c0'], [0.52, '#cfc4ae'], [1, '#e8dfca']]);
  c.beginPath(); c.moveTo(860, 792); c.lineTo(1080, 780); c.lineTo(1096, 844); c.lineTo(868, 858); c.fill();
  c.strokeStyle = 'rgba(70,90,110,0.3)'; c.lineWidth = 1;
  for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(880, 804 + i * 9); c.lineTo(1076, 792 + i * 9); c.stroke(); }
  c.strokeStyle = '#26314d'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(1040, 838); c.lineTo(1110, 808); c.stroke();
  // lampu meja
  softShadow(c, 1205, 806, 70, 12, 0.5);
  c.fillStyle = lin(c, 1160, 0, 1250, 0, [[0, '#3c4b55'], [1, '#1f2a31']]); c.beginPath(); c.ellipse(1205, 801, 46, 12, 0, 0, TAU); c.fill();
  c.strokeStyle = '#2a3740'; c.lineWidth = 7; c.beginPath(); c.moveTo(1205, 796); c.lineTo(1230, 690); c.lineTo(1170, 630); c.stroke();
  c.fillStyle = lin(c, 1118, 612, 1196, 676, [[0, '#3c4b55'], [1, '#1f2a31']]); c.beginPath(); c.moveTo(1150, 612); c.lineTo(1196, 640); c.lineTo(1170, 676); c.lineTo(1118, 650); c.fill();
  // headphone
  softShadow(c, 1330, 840, 70, 9, 0.45);
  c.strokeStyle = '#191b20'; c.lineWidth = 9; c.beginPath(); c.arc(1330, 822, 42, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  c.fillStyle = '#191b20'; rr(c, 1280, 802, 22, 34, 8); c.fill(); rr(c, 1358, 802, 22, 34, 8); c.fill();
  c.fillStyle = '#b8614a'; rr(c, 1284, 808, 14, 22, 5); c.fill(); rr(c, 1362, 808, 14, 22, 5); c.fill();
  // gelas stek tanaman
  c.fillStyle = 'rgba(190,215,225,0.35)'; rr(c, 1418, 772, 34, 48, 6); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(1422, 776, 3, 38);
  c.strokeStyle = '#3e6b4c'; c.lineWidth = 3; c.beginPath(); c.moveTo(1435, 792); c.quadraticCurveTo(1430, 752, 1415, 732); c.moveTo(1435, 792); c.quadraticCurveTo(1445, 747, 1462, 730); c.stroke();
  c.fillStyle = '#4d7a5c'; c.beginPath(); c.ellipse(1413, 728, 10, 6, -0.5, 0, TAU); c.ellipse(1464, 726, 10, 6, 0.5, 0, TAU); c.fill();

  // ---- barang-barang kecil supaya kamar terasa ditinggali
  // polaroid dijepit di tali lampu
  [[0.12, -0.08, '#e9a27a', '#6a8fb0'], [0.27, 0.06, '#9cc3a0', '#f2d39b'], [0.71, -0.05, '#7f9fc9', '#e7b9a8'], [0.86, 0.09, '#f0c48a', '#5b7b8f']].forEach(([tt, rot, c1, c2]) => {
    const x = W.x + W.w * tt; const y = W.y - 4 + Math.sin(tt * Math.PI) * 30;
    c.save(); c.translate(x, y + 3); c.rotate(rot);
    softShadow(c, 2, 26, 22, 20, 0.35);
    c.fillStyle = '#efe9dc'; c.fillRect(-17, 4, 34, 42);
    c.fillStyle = lin(c, 0, 8, 0, 36, [[0, c1], [1, c2]]); c.fillRect(-13, 8, 26, 26);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(4, 16, 5, 0, TAU); c.fill();
    c.fillStyle = '#8a6b4e'; c.fillRect(-3, -2, 6, 9);
    c.restore();
  });
  // bingkai foto kecil di dinding kanan
  [[1392, 150, 62, 78, '#c98f6a', '#3f5d6e'], [1412, 246, 44, 54, '#88a77e', '#e8d2a6']].forEach(([x, y, w2, h2, a1, a2]) => {
    softShadow(c, x + w2 / 2 + 4, y + h2 + 4, w2 * 0.6, 8, 0.35);
    c.fillStyle = '#2a201b'; c.fillRect(x - 5, y - 5, w2 + 10, h2 + 10);
    c.fillStyle = '#e8e1d2'; c.fillRect(x, y, w2, h2);
    c.fillStyle = lin(c, x, y + 6, x, y + h2 - 6, [[0, a1], [1, a2]]); c.fillRect(x + 6, y + 6, w2 - 12, h2 - 12);
    c.fillStyle = 'rgba(20,30,40,0.55)'; c.beginPath(); c.moveTo(x + 6, y + h2 - 6); c.lineTo(x + w2 * 0.45, y + h2 * 0.5); c.lineTo(x + w2 - 6, y + h2 - 6); c.fill();
  });
  // catatan tempel di dinding bawah jendela
  [[905, 640, -0.08, '#f3d36b'], [948, 648, 0.06, '#f2a7a0'], [990, 638, -0.03, '#a9dcc0']].forEach(([x, y, rot, col]) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    softShadow(c, 3, 34, 22, 6, 0.4);
    c.fillStyle = col; c.fillRect(-18, 0, 36, 36);
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.beginPath(); c.moveTo(10, 36); c.lineTo(18, 28); c.lineTo(18, 36); c.fill();
    c.strokeStyle = 'rgba(40,40,60,0.45)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-12, 10); c.lineTo(10, 9); c.moveTo(-12, 17); c.lineTo(6, 17); c.moveTo(-12, 24); c.lineTo(12, 23); c.stroke();
    c.restore();
  });
  // kabel laptop menjuntai ke tepi meja
  c.strokeStyle = '#1b1d22'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(660, 790); c.bezierCurveTo(700, 800, 690, 850, 760, 862); c.bezierCurveTo(820, 872, 800, 890, 830, 905); c.stroke();
  // gumpalan kertas & pensil
  softShadow(c, 1135, 846, 20, 5, 0.4);
  c.fillStyle = '#e6dfcf';
  c.beginPath(); c.moveTo(1120, 840); c.lineTo(1128, 826); c.lineTo(1142, 824); c.lineTo(1152, 834); c.lineTo(1148, 846); c.lineTo(1132, 850); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(1126, 834); c.lineTo(1140, 838); c.lineTo(1146, 830); c.stroke();
  c.save(); c.translate(300, 860); c.rotate(-0.12);
  c.fillStyle = '#e2b04a'; c.fillRect(0, -4, 110, 8); c.fillStyle = '#f0d3a7'; c.beginPath(); c.moveTo(110, -4); c.lineTo(124, 0); c.lineTo(110, 4); c.fill();
  c.fillStyle = '#d98a8a'; c.fillRect(-10, -4, 10, 8); c.restore();

  // ambient occlusion: pojok & bawah plafon lebih gelap
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = lin(c, 0, 44, 0, 200, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, 44, VW, 160);
  c.fillStyle = lin(c, 0, 0, 220, 0, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, 0, 220, VH);
  c.fillStyle = lin(c, VW, 0, VW - 220, 0, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(VW - 220, 0, 220, VH);
  // gelap sesuai waktu & cuaca (biru kehijauan, bukan hitam)
  c.fillStyle = `rgba(8,18,34,${L.indoorDark * 0.76})`; c.fillRect(0, 0, VW, VH);
  if (L.warm) { c.fillStyle = `rgba(255,140,80,${L.warm * 0.3})`; c.fillRect(0, 0, VW, VH); }
  // cahaya lampu yang tumpah ke dinding, tirai, dan meja (hanya saat lampu menyala)
  if (L.lampsOn) {
    const k = Math.min(1, (L.indoorDark - 0.2) * 1.6);
    const spill = (x, y, rad, a, sy = 1) => { a *= 1.2; c.save(); c.translate(x, y); c.scale(1, sy); const g = c.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, C(WARM, a * k)); g.addColorStop(0.5, C(WARM, a * k * 0.4)); g.addColorStop(1, C(WARM, 0)); c.fillStyle = g; c.fillRect(-rad, -rad, rad * 2, rad * 2); c.restore(); };
    spill(1540, 400, 480, 0.42);
    spill(1090, 770, 360, 0.5, 0.42);
    spill(573, sill - 20, 170, 0.35);
    spill(780, 140, 700, 0.12, 0.25); // dari lampu-lampu kecil di atas jendela
    c.save(); c.translate(510, 760); c.scale(1, 0.35); { const g = c.createRadialGradient(0, 0, 0, 0, 0, 260); g.addColorStop(0, `rgba(110,170,210,${0.1 * k})`); g.addColorStop(1, 'rgba(110,170,210,0)'); c.fillStyle = g; c.fillRect(-260, -260, 520, 520); } c.restore(); // pendar laptop
    // rim light hangat di tepi benda dekat lampu
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = C(WARM, 0.55 * k); c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(1376, 100); c.quadraticCurveTo(1364, 380, 1376, 648); c.stroke();
    c.beginPath(); c.moveTo(1478, 746); c.lineTo(1466, 838); c.stroke();
    c.beginPath(); c.moveTo(797, 742); c.lineTo(797, 800); c.stroke();
    c.beginPath(); c.moveTo(1184, 640); c.lineTo(1196, 642); c.stroke();
    c.beginPath(); c.moveTo(1529, 714); c.lineTo(1648, VH); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ sprite bergerak (dilukis sekali, digerakkan dengan transformasi)
const SILL = W.y + W.h + 8;
const SPRITES = {
  hang: { x: 1086, y: 36, w: 128, h: 320, px: 1150, py: 44 },
  plantA: { x: 1140, y: 140, w: 600, h: 616, px: 1431, py: 744 },
  plantB: { x: 1140, y: 140, w: 600, h: 616, px: 1431, py: 744 },
  cat: { x: 1030, y: SILL - 70, w: 210, h: 76, px: 1150, py: SILL },
};
function drawHang(c, L) {
  c.save(); c.translate(1150, 44);
  c.strokeStyle = C(shade(L, '1d1612')); c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(-18, 148); c.moveTo(0, 0); c.lineTo(18, 148); c.stroke();
  const potC = shade(L, 'c9bca6');
  c.fillStyle = lin(c, -30, 0, 30, 0, [[0, C(LI(potC, 0.1))], [1, C(DA(potC, 0.3))]]);
  c.beginPath(); c.moveTo(-30, 148); c.lineTo(30, 148); c.quadraticCurveTo(26, 190, 0, 194); c.quadraticCurveTo(-26, 190, -30, 148); c.fill();
  for (let v = 0; v < 6; v++) {
    const sx = -26 + v * 10; const len = 70 + (v % 3) * 42; const sway = Math.sin(v * 2.1) * 6;
    c.strokeStyle = C(shade(L, '3c6650')); c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(sx, 152); c.bezierCurveTo(sx - 10, 152 + len * 0.4, sx + 10 + sway, 152 + len * 0.7, sx + sway, 152 + len); c.stroke();
    for (let lf = 1; lf < 6; lf++) { const yy = 152 + (len * lf) / 6; leaf(c, sx + sway * (lf / 6), yy, 15, 6.5, lf % 2 ? 0.6 : 2.5, shade(L, lf % 2 ? '4b7a5e' : '5a8a68'), 0); }
  }
  c.restore();
}
// [sudut, panjang, ukuran daun, lengkung]
const STEMS = [[-0.55, 250, 58, -60], [-0.28, 330, 66, -30], [0.04, 400, 72, 24], [0.3, 320, 66, 50], [0.56, 240, 56, 70], [-0.8, 170, 50, -40], [0.85, 170, 48, 50],
  [-0.1, 230, 56, -50], [0.18, 460, 64, 40], [0.43, 390, 60, -30], [-0.4, 400, 62, 40], [0.68, 300, 54, -40], [-0.65, 300, 54, 30], [0.1, 300, 60, -60]];
function drawPlant(c, L, group) {
  const rim = rimOf(L);
  const cols = ['2f5a4c', '3b6a56', '467560', '345f4f', '52806a'];
  STEMS.forEach(([ang, len, size, bend], i) => {
    if (i % 2 !== group) return;
    const a = ang - Math.PI / 2; const bx = 1431 + (i % 3 - 1) * 8; const by = 746;
    const tx = bx + Math.cos(a) * len; const ty = by + Math.sin(a) * len;
    const cx = bx + Math.cos(a) * len * 0.55 + bend; const cy = by + Math.sin(a) * len * 0.55;
    c.strokeStyle = C(shade(L, '2c4d3e')); c.lineWidth = 4.5 - (i % 3) * 0.7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(cx, cy, tx, ty); c.stroke();
    // arah ujung tangkai
    const ea = Math.atan2(ty - cy, tx - cx);
    const col = shade(L, cols[i % cols.length]);
    const rimA = (ang > 0 ? 0.55 : 0.2) * rim;
    // daun kecil di tengah tangkai
    const mt = 0.55; const mx = (1 - mt) ** 2 * bx + 2 * (1 - mt) * mt * cx + mt * mt * tx; const my = (1 - mt) ** 2 * by + 2 * (1 - mt) * mt * cy + mt * mt * ty;
    leaf(c, mx, my, size * 0.85, size * 0.34, ea + (i % 2 ? 0.9 : -0.9), M(col, [20, 40, 30], 0.1), rimA * 0.6);
    leaf(c, tx, ty, size * 1.6, size * 0.62, ea + (i % 2 ? 0.35 : -0.35), col, rimA);
  });
}
function drawCat(c, L) {
  const sill = SILL;
  const catC = shade(L, 'd08a4e'); const catD = DA(catC, 0.25);
  c.fillStyle = lin(c, 0, sill - 46, 0, sill, [[0, C(LI(catC, 0.1))], [1, C(DA(catC, 0.22))]]);
  c.beginPath(); c.ellipse(1150, sill - 22, 58, 24, 0, 0, TAU); c.fill();
  c.fillStyle = C(catD); for (let s2 = 0; s2 < 3; s2++) { c.beginPath(); c.ellipse(1140 + s2 * 22, sill - 34, 6, 12, 0.2, 0, TAU); c.fill(); }
  c.strokeStyle = C(catC); c.lineWidth = 11; c.lineCap = 'round';
  c.beginPath(); c.moveTo(1205, sill - 12); c.quadraticCurveTo(1225, sill + 2, 1170, sill - 3); c.quadraticCurveTo(1130, sill - 4, 1110, sill - 8); c.stroke();
  c.fillStyle = C(catC); c.beginPath(); c.arc(1098, sill - 24, 21, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(1082, sill - 36); c.lineTo(1086, sill - 56); c.lineTo(1098, sill - 42); c.fill();
  c.beginPath(); c.moveTo(1102, sill - 42); c.lineTo(1114, sill - 56); c.lineTo(1116, sill - 34); c.fill();
  c.fillStyle = C(LI(catC, 0.25)); c.beginPath(); c.ellipse(1096, sill - 14, 10, 6, 0, 0, TAU); c.fill();
  c.strokeStyle = C(DA(catC, 0.55)); c.lineWidth = 2; c.beginPath(); c.arc(1090, sill - 24, 4, 0.2, Math.PI - 0.2); c.moveTo(1106, sill - 24); c.arc(1102, sill - 24, 4, 0.2, Math.PI - 0.2); c.stroke();
  const rim = rimOf(L);
  if (rim) { c.strokeStyle = C(WARM, 0.5 * rim); c.lineWidth = 2.5; c.beginPath(); c.ellipse(1150, sill - 22, 58, 24, 0, -0.9, 0.4); c.stroke(); }
}
/** Tempat: Kamar santai atau Kafe — masing-masing punya lukisan interior & sprite sendiri. */
const PLACES = {
  room: { draw: (c, s, L) => drawRoom(c, s, L), sprites: () => SPRITES, spriteDraw: () => SPRITE_DRAW },
  cafe: { draw: drawCafe, sprites: () => CAFE_SPRITES, spriteDraw: () => CAFE_SPRITE_DRAW },
};
const placeOf = (s) => PLACES[s && s.place] ? s.place : 'room';
const SPRITE_DRAW = { hang: drawHang, plantA: (c, L) => drawPlant(c, L, 0), plantB: (c, L) => drawPlant(c, L, 1), cat: drawCat };

// ------------------------------------------------------------------ scene
// ------------------------------------------------------------------ cache lukisan
// Lukisan dibuat pada ukuran kanvas virtual tetap (VW×VH × k) supaya hasilnya bisa dipakai ulang
// walau ukuran jendela berubah, lalu disimpan: di memori (buka-tutup Lobby instan) dan di IndexedDB
// (buka aplikasi berikutnya instan). Versi dinaikkan setiap gaya lukisan berubah.
const PAINT_V = 'p7';
const MEM_MAX = 2;
const memCache = new Map(); // key → { outside, room, spr }
const IDB_PREFIX = 'roompaint:';
const IDB_MAX = 8;
function memPut(k, layers) {
  memCache.delete(k); memCache.set(k, layers);
  while (memCache.size > MEM_MAX) memCache.delete(memCache.keys().next().value);
}
const toBlob = (cv) => new Promise((res) => {
  try { cv.toBlob((b) => res(b), 'image/webp', 0.9); } catch { res(null); }
});
async function idbSave(k, layers) {
  try {
    const entry = { t: Date.now(), outside: await toBlob(layers.outside), room: await toBlob(layers.room), spr: {} };
    for (const [id, cv] of Object.entries(layers.spr)) entry.spr[id] = await toBlob(cv);
    if (!entry.outside || !entry.room || Object.values(entry.spr).some((x) => !x)) return;
    await putFile(IDB_PREFIX + k, entry);
    // simpan maksimal beberapa suasana terakhir; buang versi lama
    const keys = (await listKeys()).filter((x) => typeof x === 'string' && x.startsWith(IDB_PREFIX));
    const old = keys.filter((x) => !x.startsWith(`${IDB_PREFIX}${PAINT_V}|`));
    for (const x of old) await deleteFile(x);
    const cur = keys.filter((x) => x.startsWith(`${IDB_PREFIX}${PAINT_V}|`));
    if (cur.length > IDB_MAX) {
      const ages = await Promise.all(cur.map(async (x) => [x, ((await getFile(x)) || {}).t || 0]));
      ages.sort((a2, b2) => a2[1] - b2[1]).slice(0, cur.length - IDB_MAX).forEach(([x]) => deleteFile(x));
    }
  } catch { /* penyimpanan penuh / tidak tersedia: tidak masalah */ }
}
async function idbLoad(k, ids) {
  try {
    const e = await getFile(IDB_PREFIX + k);
    if (!e || !e.outside || !e.room) return null;
    const bmp = (b) => (typeof createImageBitmap === 'function' ? createImageBitmap(b) : Promise.reject(new Error('no bitmap')));
    const layers = { outside: await bmp(e.outside), room: await bmp(e.room), spr: {} };
    for (const id of ids) { if (!e.spr || !e.spr[id]) return null; layers.spr[id] = await bmp(e.spr[id]); }
    return layers;
  } catch { return null; }
}

// ------------------------------------------------------------------ siapkan lukisan di latar belakang
// Beberapa detik setelah aplikasi dibuka (saat perangkat senggang), lukisan suasana Lobby saat ini
// disiapkan supaya Lobby langsung tampil penuh begitu dibuka. Kalau Lobby dibuka saat persiapan
// belum selesai, Lobby melanjutkan pekerjaan yang sama (tidak mulai dari nol).
let warm = null; // { sc, ck, idle }
export function prewarmRoom(roomState, w, h, dpr) {
  if (warm || typeof document === 'undefined') return;
  const sc = roomScene();
  sc.warmStart(roomState, w, h, dpr);
  const me = (warm = { sc, ck: sc.warmKey(), idle: true });
  const ric = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 1000 }) : (fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 40);
  const loop = (dl) => {
    if (warm !== me || !me.idle) return;
    // pakai sisa waktu senggang di frame ini, sisakan sedikit untuk browser
    do {
      if (sc.warmStep(Math.max(3, Math.min(10, dl.timeRemaining() - 2)))) { warm = null; return; }
    } while (dl.timeRemaining() > 6);
    ric(loop);
  };
  ric(loop);
}
/** Lobby dibuka: hentikan kerja di waktu senggang (Lobby yang melanjutkan kalau suasananya sama). */
export function pausePrewarm() { if (warm) warm.idle = false; }

export function roomScene() {
  let outside = null; let room = null; let spr = {};
  let key = ''; let cacheKey = '';
  let job = null; // tahap pembuatan lukisan yang sedang berjalan
  let isWarm = false; // instans khusus persiapan latar belakang
  let fade = null; // { prev: {outside, room, spr, L}, t0 } → lukisan lama memudar ke lukisan baru
  let wfx = null; // { dim, rain, t0 } → cuaca berganti dalam kelompok yang sama: efeknya memudar
  let L = lighting('night', 'clear');
  let st = { loc: 'mountain', weather: 'rain', time: 'night' };
  let rainL = []; let snow = []; let clouds = []; let drops = []; let mist = []; let birds = [];
  let flash = 0; let nextFlash = 4; let bolt = null;
  let tf = { s: 1, ox: 0, oy: 0, dpr: 1 };
  const par = { x: 0, y: 0 };

  function setupDynamics() {
    const storm = st.weather === 'storm';
    // hujan tiga lapis: jauh (tipis, lambat), tengah, dekat (panjang, terang)
    rainL = [[0.45, 0.6, 150, 9, 0.18], [0.75, 1, 120, 16, 0.3], [1.1, 1.6, 60, 28, 0.45]].map(([v0, wd, n, len, a]) => ({
      wd, len, a: storm ? a * 1.2 : a,
      drops: Array.from({ length: Math.round(n * (storm ? 1.6 : 1)) }, () => ({ x: OW.x + Math.random() * OW.w, y: OW.y + Math.random() * OW.h, v: (650 + Math.random() * 300) * v0 * (storm ? 1.3 : 1) })),
    }));
    snow = Array.from({ length: 190 }, () => ({ x: OW.x + Math.random() * OW.w, y: OW.y + Math.random() * OW.h, r: rnd(0.8, 3.2), v: rnd(20, 60), ph: rnd(0, TAU) }));
    const nC = { clear: 2, cloudy: 6, rain: 7, storm: 8, snow: 5, fog: 3 }[st.weather];
    clouds = Array.from({ length: nC }, () => ({ x: OW.x + rnd(-200, OW.w), y: OW.y + rnd(20, (HZ - OW.y) * 0.55), s: rnd(0.6, 1.2), v: rnd(3, 9) * (storm ? 3 : 1) }));
    drops = Array.from({ length: 80 }, () => ({ x: W.x + Math.random() * W.w, y: W.y + Math.random() * W.h, r: rnd(1.2, 3.8), slide: false, v: 0, trail: 0 }));
    mist = Array.from({ length: 4 }, (_, i) => ({ x: OW.x + rnd(0, OW.w), y: HZ - 50 + i * 34, rx: rnd(260, 420), v: rnd(4, 10) * (i % 2 ? 1 : -1) }));
    birds = [];
  }
  const same = (a, b) => placeOf(a) === placeOf(b) && a.loc === b.loc && a.weather === b.weather && a.time === b.time;
  const sfx = (kind) => { try { window.dispatchEvent(new CustomEvent('cafe-sfx', { detail: kind })); } catch { /* */ } };
  const crowd = createCrowd({ onBell: () => sfx('bell') });
  const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cafeAnim = createCafeAnimator({ onClink: () => { try { window.dispatchEvent(new CustomEvent('cafe-sfx', { detail: 'clink' })); } catch { /* */ } } });
  /** Suasana yang tampil (cahaya, hujan, awan) — diganti tepat saat lukisannya ikut berganti. */
  function applyState(s) {
    const first = !rainL.length;
    if (!first && same(st, s)) return;
    if (!first && st.weather !== s.weather) wfx = { dim: WX_DIM[st.weather] || 0, rain: hasRain(st.weather), t0: performance.now() };
    st = { ...s };
    L = lighting(st.time, paintWeather(st.weather));
    curL = L; curP = palette(st.time, L);
    setupDynamics();
  }
  /** Pasang lukisan yang sudah jadi; kalau sebelumnya ada lukisan lain, pudarkan perlahan. */
  function swapIn(layers, s) {
    const prev = room && !isWarm && room !== layers.room ? { outside, room, spr, L } : null;
    outside = layers.outside; room = layers.room; spr = layers.spr;
    if (s) applyState(s);
    fade = prev ? { prev, t0: performance.now() } : null;
  }

  /** Gelapnya langit sesuai cuaca (di atas lukisan "mendung"), memudar saat cuaca berganti. */
  function weatherDim(c) {
    let dimV = WX_DIM[st.weather] || 0;
    if (wfx) { const q = Math.min(1, (performance.now() - wfx.t0) / 1500); dimV = wfx.dim + (dimV - wfx.dim) * q; if (q >= 1) wfx = null; }
    if (dimV > 0.004) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = `rgba(6,12,24,${dimV.toFixed(3)})`; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }
  }

  /** Bagian bergerak di Kafe: lampu kertas, barista, tanaman, meja kita (kopi & roti), pelayan. */
  function drawCafeInterior(c, o, state) {
    const { t, dt, w, h, lf, idk, pv, ff, layer } = o;
    const tc = M(H('c9a77c'), H('0a161e'), idk * 0.85); const bc = M(H('8c5f3e'), H('0a161e'), idk * 0.85);
    if (tf.oy > 0) { c.fillStyle = C(tc); c.fillRect(0, 0, w, tf.oy + 1); c.fillStyle = C(bc); c.fillRect(0, tf.oy + VH * tf.s - 1, w, h); }
    c.save(); c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s); layer(room, pv && pv.room, 0, 0, VW, VH); c.restore();
    if (tf.oy > 0) {
      const fz = Math.min(tf.oy, 28); const y1 = tf.oy; const y2 = tf.oy + VH * tf.s;
      let g = c.createLinearGradient(0, y1 - 1, 0, y1 + fz); g.addColorStop(0, C(tc)); g.addColorStop(1, C(tc, 0)); c.fillStyle = g; c.fillRect(0, y1 - 1, w, fz + 1);
      g = c.createLinearGradient(0, y2 + 1, 0, y2 - fz); g.addColorStop(0, C(bc)); g.addColorStop(1, C(bc, 0)); c.fillStyle = g; c.fillRect(0, y2 - fz, w, fz + 1);
    }
    c.save(); c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
    if (flash > 0) { c.fillStyle = `rgba(200,215,255,${flash * 0.1})`; c.fillRect(0, 0, VW, VH); }
    const sp = (id, { dx = 0, dy = 0, rot = 0, sc = 1, alpha = 1 } = {}) => {
      const b = CAFE_SPRITES[id]; const img = spr[id];
      if (!img) return;
      c.save(); c.translate(b.px + dx, b.py + dy); c.rotate(rot); c.scale(sc, sc);
      const old = pv && pv.spr[id];
      if (old && old !== img) { c.globalAlpha = alpha * (1 - ff); c.drawImage(old, b.x - b.px, b.y - b.py, b.w, b.h); c.globalAlpha = alpha * ff; } else c.globalAlpha = alpha;
      c.drawImage(img, b.x - b.px, b.y - b.py, b.w, b.h); c.restore();
    };
    // jam dinding: jarum mengikuti jam sebenarnya
    const now = new Date(); const hA = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU - Math.PI / 2; const mA = (now.getMinutes() + now.getSeconds() / 60) / 60 * TAU - Math.PI / 2;
    c.strokeStyle = C(M(H('2a1e16'), H('0a161e'), idk * 0.5)); c.lineCap = 'round';
    c.lineWidth = 3.5; c.beginPath(); c.moveTo(1412, 112); c.lineTo(1412 + Math.cos(hA) * 14, 112 + Math.sin(hA) * 14); c.stroke();
    c.lineWidth = 2.2; c.beginPath(); c.moveTo(1412, 112); c.lineTo(1412 + Math.cos(mA) * 21, 112 + Math.sin(mA) * 21); c.stroke();
    // lampu kertas berayun pelan
    LANTERNS.forEach((x, i) => sp('lantern', { dx: x - 800, rot: Math.sin(t * 0.45 + i * 1.7) * 0.018 }));
    sp('doorPlant', { rot: Math.sin(t * 0.5) * 0.012 });
    // pengunjung: masuk, memesan, duduk, minum & mengobrol, lalu pulang (urut dari yang terjauh)
    crowd.step(dt, { time: st.time, weather: st.weather, phone, L, budget: phone ? 2.5 : 3.5 }); // tokoh dilukis bertahap di sela animasi
    // barista di balik konter: dipotong di permukaan konter; tablet kasir tetap di depannya
    const bar = crowd.barista;
    c.save(); c.beginPath(); c.rect(-40, 0, 298, COUNTER_Y);
    { const cs = Math.cos(TABLET.rot); const sn = Math.sin(TABLET.rot); const pt = (x, y) => [TABLET.x + x * cs - y * sn, TABLET.y + x * sn + y * cs];
      [[TABLET.x0, TABLET.y0], [TABLET.x1, TABLET.y0], [TABLET.x1, TABLET.y1], [TABLET.x0, TABLET.y1]].forEach(([x, y], i) => { const [px, py] = pt(x, y); if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); }
    c.clip('evenodd'); drawBaristaFast(c, bar, L, t, phone); c.restore();
    if (bar.counterCup) drawCounterCup(c, bar.counterCup, L);
    if (bar.mode === 'brew') { // uap dari mesin espresso
      for (let i = 0; i < 4; i++) { const p = (t * 0.5 + i / 4) % 1; c.fillStyle = `rgba(245,245,245,${0.24 * (1 - p)})`; c.beginPath(); c.arc(MACHINE.x - 8 + Math.sin(t * 2 + i) * 6 + p * 10, MACHINE.steamY - p * 60, 5 + p * 14, 0, TAU); c.fill(); }
    }
    for (const pp of crowd.people()) drawPersonFast(c, pp, L, t, phone);
    globalThis.__cafePeople = crowd.count;
    // meja kita: piring & roti (berkurang dengan gigitan), cangkir & minuman (berkurang per teguk)
    cafeAnim.update(state && state.cafe, t);
    const tb = cafeAnim.tableState(t);
    const drawFood = (food, left, dx) => {
      if (!food) return;
      sp('plate', { dx });
      if (left <= 0.02) { // tinggal remah
        c.fillStyle = 'rgba(200,150,90,0.8)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(PLATE.x + dx - 30 + ((i * 37) % 60), PLATE.y - 6 + ((i * 13) % 7), 1.6 + (i % 3), 0, TAU); c.fill(); }
        return;
      }
      c.save(); biteClip(c, food, left, PLATE.x + dx, PLATE.y); sp(food, { dx }); c.restore();
    };
    const drawCup = (id, level, { dx = 0, dy = 0, sc = 1, alpha = 1 } = {}) => {
      if (!id) return;
      const d = drinkOf(id);
      c.save(); c.translate(CUP.x + dx, CUP.y + dy); c.scale(sc, sc); c.translate(-CUP.x, -CUP.y);
      sp(d.vessel, { alpha });
      c.globalAlpha = alpha; drawDrink(c, id, level, CUP.x, CUP.y, L, t);
      if (alpha > 0.9 && level > 0.15 && sc === 1) { // uap minuman hangat
        c.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
          c.beginPath();
          for (let y = 0; y < 70; y += 5) { const x = CUP.x - 8 + i * 16 + Math.sin(y * 0.08 + t * 1.6 + i * 2) * (3 + y * 0.08); if (y === 0) c.moveTo(x, CUP.y - 66 - y); else c.lineTo(x, CUP.y - 66 - y); }
          c.strokeStyle = `rgba(250,250,250,${(0.1 + 0.05 * Math.sin(t + i)) * Math.min(1, level * 2)})`; c.lineWidth = 6 - i * 1.5; c.stroke();
        }
      }
      c.restore();
    };
    drawFood(tb.food, tb.foodLeft, tb.plateDx);
    drawCup(tb.drink, tb.level, { dx: tb.cupDx, dy: tb.cupDy, sc: tb.cupScale, alpha: tb.cupAlpha });
    if (tb.carry) {
      if (tb.carry.kind === 'cup') drawCup(tb.carry.id, tb.carry.level, { dx: tb.carry.dx });
      else drawFood(tb.carry.id, tb.carry.left, tb.carry.dx);
    }
    if (tb.arm) sp('arm', { dx: tb.arm.x - 1010, dy: tb.arm.y - 700 });
    c.restore();
    weatherDim(c);
    // cahaya lampu kertas (selalu menyala, lebih terasa saat gelap)
    c.save(); c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
    c.globalCompositeOperation = 'lighter';
    const la = 0.35 + 0.65 * lf; const flick = 0.95 + 0.05 * Math.sin(t * 7) * Math.sin(t * 2.3);
    LANTERNS.forEach((x, i) => { const sx = x + Math.sin(t * 0.45 + i * 1.7) * 2.6; glow(c, sx, 222, 110, WARM, 0.32 * la * flick); glow(c, sx, 222, 40, [255, 226, 180], 0.35 * la); });
    c.save(); c.translate(800, BAR_TOP); c.scale(1, 0.18); glow(c, 0, 0, 520, WARM, 0.22 * la); c.restore();
    glow(c, 160, 360, 120, WARM, 0.12 * la);
    c.globalCompositeOperation = 'source-over';
    c.restore();
  }

  /** Mulai (ulang) suasana: pakai cache kalau ada, kalau tidak lukis bertahap di beberapa frame.
   *  Selama lukisan baru dibuat, lukisan lama tetap tampil (tidak ada layar "melukis dari nol"). */
  function prerender(w, h, dpr, want) {
    const s = h > w ? Math.max(w / 1000, (h / VH) * 0.55) : Math.max(w / VW, h / VH);
    tf = { s, ox: w / 2 - (VW / 2) * s, oy: (h - VH * s) / 2, dpr };
    // skala lukisan dibulatkan supaya cache tetap terpakai walau jendela sedikit berubah ukuran
    const k = Math.max(0.75, Math.min(1.5, Math.round(s * dpr * 4) / 4));
    const ck = `${PAINT_V}|${placeOf(want)}|${want.loc}|${paintWeather(want.weather)}|${want.time}|k${k}`;
    if (ck === cacheKey && (room || job)) { // lukisannya sama: cuma ukuran layar atau cuaca dalam kelompok yang sama berubah
      if (!job || job.live) applyState(want);
      if (job) job.want = { ...want };
      return;
    }
    cacheKey = ck;
    const live = !room || isWarm; // belum ada lukisan sama sekali: tampilkan proses melukisnya
    if (live) applyState(want);
    const mine = (job = { k, ck, want: { ...want }, live, phase: 'lookup', steps: [], painters: [] });
    const hit = memCache.get(ck);
    if (hit) { job = null; swapIn(hit, want); return; }
    if (!isWarm && warm && warm.ck === ck) { mine.phase = 'adopt'; return; } // lanjutkan persiapan latar belakang
    if (warm && !warm.idle) warm = null; // persiapan untuk suasana lain tidak dipakai lagi
    idbLoad(ck, Object.keys(PLACES[placeOf(want)].sprites())).then((layers) => {
      if (job !== mine) return;
      if (layers) { memPut(ck, layers); job = null; swapIn(layers, mine.want); return; }
      buildSteps(mine);
    });
  }

  function buildSteps(j) {
    const { k } = j;
    const mk = () => { const cv = document.createElement('canvas'); cv.width = Math.round(VW * k); cv.height = Math.round(VH * k); const cx = cv.getContext('2d'); cx.setTransform(k, 0, 0, k, 0, 0); return [cv, cx]; };
    const stS = { ...j.want, weather: paintWeather(j.want.weather) }; const stL = lighting(stS.time, stS.weather);
    let baseOut = null; let baseRoom = null;
    const local = { spr: {} };
    j.phase = 'build';
    j.steps = [
      () => { let cx; [baseOut, cx] = mk(); drawOutside(cx, stS); },
      () => { let cx; [baseRoom, cx] = mk(); PLACES[placeOf(stS)].draw(cx, stS, stL); },
      () => {
        const pOut = createPainter(baseOut, { unit: k, seed: 3, wobble: 1.4, scale: 1.2 });
        const pRoom = createPainter(baseRoom, { unit: k, seed: 5, wobble: 2.4 });
        j.painters.push(pOut, pRoom);
        local.outside = pOut.canvas; local.room = pRoom.canvas;
      },
      ...Object.entries(PLACES[placeOf(stS)].sprites()).map(([id, b]) => () => {
        const cv = document.createElement('canvas'); cv.width = Math.ceil(b.w * k); cv.height = Math.ceil(b.h * k);
        const sx = cv.getContext('2d'); sx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
        PLACES[placeOf(stS)].spriteDraw()[id](sx, stL);
        const pp = createPainter(cv, { unit: k, seed: id.length * 13, softEdge: 0.7, scale: 0.6, wobble: 1.2 });
        local.spr[id] = pp.canvas; j.painters.push(pp);
      }),
      () => {
        j.local = local;
        if (j.live) { outside = local.outside; room = local.room; spr = local.spr; }
        j.phase = 'paint';
      },
    ];
  }

  /** Kerjakan sebagian pekerjaan melukis dalam batas waktu per frame. */
  function work(budget) {
    const j = job;
    if (!j) { globalThis.__roomPainted = !!room; return; }
    const t0 = performance.now();
    if (j.phase === 'build') {
      while (j.steps.length && performance.now() - t0 < budget) j.steps.shift()();
      return;
    }
    if (j.phase === 'adopt') {
      const wm = warm;
      if (!wm || wm.ck !== j.ck) { cacheKey = ''; key = ''; job = null; return; } // mulai ulang sendiri
      if (wm.sc.warmStep(budget)) {
        warm = null;
        const hit = memCache.get(j.ck);
        job = null;
        if (hit) { swapIn(hit, j.want); globalThis.__roomPainted = true; } else { cacheKey = ''; key = ''; }
      } else if (j.live) { const pv = wm.sc.preview(); if (pv) { outside = pv.outside; room = pv.room; spr = pv.spr; } }
      return;
    }
    if (j.phase !== 'paint') return;
    for (const p of j.painters) {
      if (p.done) continue;
      p.step(Math.max(1, budget - (performance.now() - t0)));
      if (performance.now() - t0 > budget) break;
    }
    if (j.painters.every((p) => p.done)) {
      const layers = { outside: j.local.outside, room: j.local.room, spr: j.local.spr };
      memPut(j.ck, layers);
      job = null;
      if (!j.live) swapIn(layers, j.want);
      globalThis.__roomPainted = true;
      setTimeout(() => idbSave(j.ck, layers), 400);
    }
  }

  return {
    init() { key = ''; },
    warmStart(state, w, h, dpr) { key = 'warm'; isWarm = true; prerender(w, h, dpr, state); },
    warmStep(ms) { if (job) work(ms); return !job; },
    warmKey: () => cacheKey,
    preview: () => (room ? { outside, room, spr } : null),
    /** Sedang menyiapkan lukisan suasana baru (lukisan lama masih tampil). */
    get busy() { return !!job && !job.live; },
    draw(c, dt, t, w, h, state) {
      const want = state && state.room ? state.room : st;
      const dpr = c.getTransform().a || 1;
      const k = `${placeOf(want)}|${want.loc}|${want.weather}|${want.time}|${w}x${h}|${dpr}`;
      if (k !== key) { key = k; prerender(w, h, dpr, want); }
      if (job) globalThis.__roomPainted = false;
      work(job && job.phase === 'paint' ? (job.live ? 22 : 12) : 26); // melukis bertahap tanpa membuat animasi macet
      if (!room) { // belum ada gambar sama sekali (sepersekian detik): latar gelap senada
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        const g = c.createLinearGradient(0, 0, 0, c.canvas.height); g.addColorStop(0, '#1b262c'); g.addColorStop(1, '#0d1317');
        c.fillStyle = g; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
        return;
      }
      // pudar antar-lukisan (smoothstep ±0,9 detik)
      let ff = 1;
      if (fade) { ff = Math.min(1, (performance.now() - fade.t0) / 900); ff = ff * ff * (3 - 2 * ff); if (ff >= 1) fade = null; }
      const pv = fade ? fade.prev : null;
      const lampOf = (x) => (x.lampsOn ? 1 : 0);
      const lf = pv ? lampOf(pv.L) + (lampOf(L) - lampOf(pv.L)) * ff : lampOf(L); // lampu menyala/padam perlahan
      const idk = pv ? pv.L.indoorDark + (L.indoorDark - pv.L.indoorDark) * ff : L.indoorDark;
      const layer = (img, old, x, y, wd, ht) => {
        if (old && old !== img) { c.drawImage(old, x, y, wd, ht); c.globalAlpha = ff; }
        c.drawImage(img, x, y, wd, ht); c.globalAlpha = 1;
      };
      const ptr = (state && state.pointer) || { x: 0, y: 0 };
      par.x += (ptr.x - par.x) * Math.min(1, dt * 2.5);
      par.y += (ptr.y - par.y) * Math.min(1, dt * 2.5);
      const pdx = -par.x * 14; const pdy = -par.y * 7; // pemandangan bergeser sedikit (parallax)
      const night = st.time === 'night';

      // ---------- pemandangan luar
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
      c.save();
      c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
      c.beginPath(); c.rect(W.x - 8, W.y - 8, W.w + 16, W.h + 16); c.clip();
      c.translate(pdx, pdy);
      layer(outside, pv && pv.outside, 0, 0, VW, VH);
      // awan bergerak
      const cc = night ? M(curP.top, [70, 85, 110], 0.4) : M(curP.bot, [255, 255, 255], 0.4);
      for (const cl of clouds) { cl.x += cl.v * dt; if (cl.x > OW.x + OW.w + 300) cl.x = OW.x - 300; cloudMass(c, cl.x, cl.y, cl.s, cc, 0.3 + L.overcast * 0.35); }
      // kabut melayang di lereng
      for (const m of mist) {
        m.x += m.v * dt; if (m.x > OW.x + OW.w + m.rx) m.x = OW.x - m.rx; if (m.x < OW.x - m.rx) m.x = OW.x + OW.w + m.rx;
        c.save(); c.translate(m.x, m.y); c.scale(1, 0.16);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, m.rx);
        const a = (night ? 0.12 : 0.22) + L.overcast * 0.2 + (st.weather === 'fog' ? 0.15 : 0);
        g.addColorStop(0, C(LI(curP.haze, 0.2), a)); g.addColorStop(1, C(curP.haze, 0));
        c.fillStyle = g; c.fillRect(-m.rx, -m.rx, m.rx * 2, m.rx * 2); c.restore();
      }
      // gerak khusus lokasi
      if (st.loc === 'mountain' || st.loc === 'beach') {
        c.strokeStyle = C(LI(curP.haze, 0.4), 0.16 * (1 - L.dark * 0.5)); c.lineWidth = 1.4;
        for (let i = 0; i < 16; i++) { const y = HZ + 22 + i * ((BT - HZ - 100) / 16); const x = OW.x + ((i * 173 + t * (8 + i)) % OW.w); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 26 + (i % 3) * 16, y); c.stroke(); }
        if (st.loc === 'beach') {
          c.beginPath(); for (let x = 0; x <= OW.w; x += 14) c.lineTo(OW.x + x, BT - 70 + Math.sin(t * 1.2 + x * 0.02) * 3 + Math.sin(t * 0.5) * 7 + (x / OW.w) * 22);
          c.strokeStyle = 'rgba(240,248,250,0.12)'; c.lineWidth = 10; c.stroke();
          c.strokeStyle = 'rgba(240,248,250,0.4)'; c.lineWidth = 2.5; c.stroke();
          c.fillStyle = 'rgba(240,248,250,0.12)'; c.beginPath(); for (let x = 0; x <= OW.w; x += 14) c.lineTo(OW.x + x, BT - 70 + Math.sin(t * 1.2 + x * 0.02) * 3 + Math.sin(t * 0.5) * 7 + (x / OW.w) * 22); c.lineTo(OW.x + OW.w, BT); c.lineTo(OW.x, BT); c.fill();
        }
      }
      if (st.loc === 'city' && Math.sin(t * 2.4) > 0.3) { c.fillStyle = 'rgba(255,70,60,0.95)'; c.beginPath(); c.arc(W.x + 520, BT - 330, 3, 0, TAU); c.fill(); glow(c, W.x + 520, BT - 330, 16, [255, 70, 60], 0.5); }
      if (st.loc === 'village') {
        const hx = W.x + 1050; const hy = HZ - 30;
        c.strokeStyle = outTint('cfc4ae'); c.lineWidth = 6; c.lineCap = 'butt';
        for (let b = 0; b < 4; b++) { const a = t * 0.7 + (b * TAU) / 4; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a) * 62, hy + Math.sin(a) * 62); c.stroke(); }
        for (const [x, y] of [[OW.x + 186, HZ + 32], [OW.x + 576, HZ + 24]]) for (let i = 0; i < 5; i++) { const p = (t * 0.12 + i / 5) % 1; c.fillStyle = `rgba(220,225,230,${0.3 * (1 - p)})`; c.beginPath(); c.arc(x + p * 30 + Math.sin(t + i) * 4, y - p * 60, 4 + p * 12, 0, TAU); c.fill(); }
      }
      if (st.loc === 'ricefield') for (let i = 0; i < 7; i++) { const p = (t * 0.06 + i / 7) % 1; c.fillStyle = `rgba(215,218,224,${0.35 * (1 - p)})`; c.beginPath(); c.arc(W.x + 615 + p * 80 + Math.sin(t + i) * 8, W.y + 86 - p * 90, 10 + p * 30, 0, TAU); c.fill(); }
      // burung sesekali (cuaca cerah/berawan, siang)
      if (!night && (st.weather === 'clear' || st.weather === 'cloudy') && birds.length === 0 && Math.random() < dt * 0.05) { const y = rnd(W.y + 40, HZ - 80); for (let b = 0; b < 3; b++) birds.push({ x: OW.x - 30 - b * 24, y: y + b * 9, v: rnd(40, 60), ph: rnd(0, TAU) }); }
      c.strokeStyle = C(DA(curP.top, 0.55), 0.8); c.lineWidth = 1.6;
      birds = birds.filter((b) => b.x < OW.x + OW.w + 40);
      for (const b of birds) { b.x += b.v * dt; const f = Math.sin(t * 9 + b.ph) * 3.5; c.beginPath(); c.moveTo(b.x - 7, b.y - f); c.quadraticCurveTo(b.x - 3, b.y - 1.5, b.x, b.y); c.quadraticCurveTo(b.x + 3, b.y - 1.5, b.x + 7, b.y - f); c.stroke(); }
      // cuaca
      if (st.weather === 'rain' || st.weather === 'storm') {
        const slant = st.weather === 'storm' ? 0.32 : 0.14;
        const rc = night ? '175,195,215' : '220,232,240';
        const rin = wfx && !wfx.rain ? Math.min(1, (performance.now() - wfx.t0) / 1500) : 1; // hujan mulai turun perlahan
        for (const layer of rainL) {
          c.strokeStyle = `rgba(${rc},${layer.a * rin})`; c.lineWidth = layer.wd;
          c.beginPath();
          for (const d of layer.drops) { d.y += d.v * dt; d.x -= d.v * dt * slant; if (d.y > BT) { d.y = OW.y - layer.len; d.x = OW.x + Math.random() * (OW.w + 200); } c.moveTo(d.x, d.y); c.lineTo(d.x + layer.len * slant, d.y - layer.len); }
          c.stroke();
        }
      }
      if (st.weather === 'snow') {
        c.fillStyle = 'rgba(255,255,255,0.9)';
        for (const f of snow) { f.y += f.v * dt; f.x += Math.sin(t + f.ph) * 14 * dt; if (f.y > BT) { f.y = OW.y - 4; f.x = OW.x + Math.random() * OW.w; } c.globalAlpha = 0.35 + f.r / 5; c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
      if (st.weather === 'storm') {
        nextFlash -= dt;
        if (nextFlash <= 0) { flash = 1; nextFlash = rnd(6, 16); const x0 = W.x + rnd(100, W.w - 100); bolt = [[x0, W.y]]; let x = x0; for (let y = W.y; y < HZ; y += rnd(16, 32)) { x += rnd(-24, 24); bolt.push([x, y]); } }
        if (flash > 0) {
          c.fillStyle = `rgba(225,235,255,${flash * 0.5})`; c.fillRect(OW.x, OW.y, OW.w, OW.h);
          if (bolt && flash > 0.5) { c.strokeStyle = `rgba(255,255,255,${flash})`; c.lineWidth = 2.4; c.beginPath(); bolt.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
          flash = Math.max(0, flash - dt * (flash > 0.6 ? 2.5 : 1.5));
        }
      }
      c.restore();

      // kaca: tetes hujan dengan jejak, embun beku, pantulan & bayangan atas
      c.save(); c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
      c.beginPath(); c.rect(W.x - 8, W.y - 8, W.w + 16, W.h + 16); c.clip();
      if (st.weather === 'rain' || st.weather === 'storm') {
        for (const d of drops) {
          if (d.slide) { d.v = Math.min(d.v + 50 * dt, 170); d.y += d.v * dt; d.trail = Math.min(60, d.trail + d.v * dt); if (d.y > W.y + W.h + 6) { d.y = W.y + Math.random() * 60; d.slide = false; d.v = 0; d.trail = 0; } } else if (Math.random() < 0.0012) d.slide = true;
          if (d.trail > 2) { c.strokeStyle = 'rgba(210,225,235,0.14)'; c.lineWidth = d.r * 0.7; c.beginPath(); c.moveTo(d.x, d.y - d.trail); c.lineTo(d.x, d.y); c.stroke(); }
          const g = c.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.4, 0, d.x, d.y, d.r);
          g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(190,210,225,0.2)'); g.addColorStop(1, 'rgba(20,35,45,0.3)');
          c.fillStyle = g; c.beginPath(); c.ellipse(d.x, d.y, d.r * 0.8, d.r, 0, 0, TAU); c.fill();
        }
      }
      if (st.weather === 'snow') [[W.x, W.y], [W.x + W.w, W.y], [W.x, W.y + W.h], [W.x + W.w, W.y + W.h]].forEach(([x, y]) => glow(c, x, y, 150, [232, 240, 250], 0.45));
      c.fillStyle = lin(c, 0, W.y, 0, W.y + 40, [[0, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(W.x, W.y, W.w, 40);
      if (lf > 0.01) { // pantulan kamar di kaca
        const g = c.createLinearGradient(W.x, W.y, W.x + W.w, W.y + W.h);
        g.addColorStop(0.25, 'rgba(255,190,140,0)'); g.addColorStop(0.45, `rgba(255,190,140,${0.05 * idk * lf})`); g.addColorStop(0.6, 'rgba(255,190,140,0)');
        c.fillStyle = g; c.fillRect(W.x, W.y, W.w, W.h);
        glow(c, W.x + W.w - 40, W.y + 260, 120, WARM, 0.06 * idk * lf);
      }
      c.restore();

      if (placeOf(st) === 'cafe') { drawCafeInterior(c, { t, dt, w, h, lf, idk, pv, ff, layer }, state); return; }
      // ---------- kamar (statis)
      if (tf.oy > 0) { // layar tegak: perpanjang plafon & meja
        c.fillStyle = C(M(H('1f1916'), H('0a161e'), idk)); c.fillRect(0, 0, w, tf.oy + 1);
        c.fillStyle = C(M(H('3b271e'), H('0a161e'), idk)); c.fillRect(0, tf.oy + VH * tf.s - 1, w, h);
      }
      c.save(); c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s); layer(room, pv && pv.room, 0, 0, VW, VH); c.restore();
      if (tf.oy > 0) { // sambungan pita atas/bawah dibuat lembut (tanpa garis)
        const fz = Math.min(tf.oy, 28);
        const tc = M(H('1f1916'), H('0a161e'), idk); const bc = M(H('3b271e'), H('0a161e'), idk);
        const y1 = tf.oy; const y2 = tf.oy + VH * tf.s;
        let g = c.createLinearGradient(0, y1 - 1, 0, y1 + fz); g.addColorStop(0, C(tc)); g.addColorStop(1, C(tc, 0));
        c.fillStyle = g; c.fillRect(0, y1 - 1, w, fz + 1);
        g = c.createLinearGradient(0, y2 + 1, 0, y2 - fz); g.addColorStop(0, C(bc)); g.addColorStop(1, C(bc, 0));
        c.fillStyle = g; c.fillRect(0, y2 - fz, w, fz + 1);
      }
      c.save(); c.translate(tf.ox, tf.oy); c.scale(tf.s, tf.s);
      if (flash > 0) { c.fillStyle = `rgba(200,215,255,${flash * 0.12})`; c.fillRect(0, 0, VW, VH); }

      // berkas cahaya matahari (cerah/berawan, siang)
      if (lf < 0.99 && (st.weather === 'clear' || st.weather === 'cloudy')) {
        c.globalCompositeOperation = 'lighter';
        const a = (st.weather === 'clear' ? 0.065 : 0.03) * (1 + 0.15 * Math.sin(t * 0.7)) * (1 - lf) * (pv ? ff : 1);
        [[W.x + 120, 380], [W.x + 470, 330], [W.x + 800, 290]].forEach(([x, wdt]) => {
          c.fillStyle = lin(c, x, W.y, x - 220, 880, [[0, `rgba(255,238,205,${a})`], [1, 'rgba(255,238,205,0)']]);
          c.beginPath(); c.moveTo(x, W.y); c.lineTo(x + wdt * 0.6, W.y); c.lineTo(x + wdt * 0.4 - 220, 880); c.lineTo(x - 260, 880); c.fill();
        });
        for (let i = 0; i < 28; i++) { const px = W.x + ((i * 97 + t * 8) % 900); const py = 300 + ((i * 53 + t * 5) % 500); c.fillStyle = `rgba(255,245,220,${0.22 + 0.2 * Math.sin(t + i)})`; c.fillRect(px, py, 2, 2); }
        c.globalCompositeOperation = 'source-over';
      }

      // sprite yang dilukis: pot gantung berayun, tanaman bergoyang, kucing bernapas
      const sprite = (id, rot = 0, sy = 1) => {
        const b = SPRITES[id];
        c.save(); c.translate(b.px, b.py); c.rotate(rot); c.scale(1, sy);
        const old = pv && pv.spr[id];
        if (old && old !== spr[id]) { c.globalAlpha = 1 - ff; c.drawImage(old, b.x - b.px, b.y - b.py, b.w, b.h); c.globalAlpha = ff; }
        c.drawImage(spr[id], b.x - b.px, b.y - b.py, b.w, b.h); c.globalAlpha = 1; c.restore();
      };
      sprite('hang', Math.sin(t * 0.55) * 0.035);
      sprite('plantA', Math.sin(t * 0.6) * 0.014);
      sprite('plantB', Math.sin(t * 0.6 + 1.9) * 0.018);
      const sill = SILL;
      softShadow(c, 1150, sill + 2, 70, 7, 0.45);
      sprite('cat', 0, 1 + Math.sin(t * 1.6) * 0.03);

      weatherDim(c);

      // uap kopi
      c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        for (let y = 0; y < 100; y += 5) { const x = 752 + i * 14 + Math.sin(y * 0.07 + t * 1.8 + i * 2) * (3 + y * 0.09); if (y === 0) c.moveTo(x, 732 - y); else c.lineTo(x, 732 - y); }
        c.strokeStyle = `rgba(235,240,240,${0.05 + 0.03 * Math.sin(t + i)})`; c.lineWidth = 10 - i * 1.5; c.stroke();
        c.strokeStyle = `rgba(235,240,240,${0.13 + 0.06 * Math.sin(t + i)})`; c.lineWidth = 3 - i * 0.5; c.stroke();
      }

      // lampu & cahaya
      c.globalCompositeOperation = 'lighter';
      const flick = 0.93 + 0.07 * Math.sin(t * 9) * Math.sin(t * 3.7);
      for (let i = 0; i <= 26; i++) {
        const x = W.x + (W.w * i) / 26; const y = W.y - 4 + Math.sin((i / 26) * Math.PI) * 30;
        const tw = 0.65 + 0.35 * Math.sin(t * 1.6 + i * 1.7);
        const col = [[255, 186, 110], [255, 150, 118], [255, 218, 150]][i % 3];
        c.fillStyle = C(col, (0.5 + 0.45 * lf) * tw); c.beginPath(); c.arc(x, y, 3.2, 0, TAU); c.fill();
        if (lf > 0.01) glow(c, x, y, 26, col, 0.3 * tw * lf);
      }
      glow(c, 510, 684, 220, [110, 170, 220], 0.06 + idk * 0.1);
      if (lf > 0.01) {
        c.globalAlpha = lf;
        glow(c, 1540, 330, 280, WARM, 0.4 * flick);
        c.fillStyle = lin(c, 0, 362, 0, 870, [[0, C(WARM, 0.14 * flick)], [1, C(WARM, 0)]]); c.beginPath(); c.moveTo(1498, 362); c.lineTo(1582, 362); c.lineTo(1700, 870); c.lineTo(1380, 870); c.fill();
        for (let i = 0; i < 14; i++) { const p = ((t * 0.03 + i * 0.13) % 1); const dx = 1500 + Math.sin(i * 3.1 + t * 0.3) * 60 * p + i * 4; const dy = 380 + p * 420; c.fillStyle = C(WARM, 0.4 * (1 - p)); c.fillRect(dx, dy, 2, 2); }
        c.save(); c.translate(1080, 762); c.scale(1, 0.32); glow(c, 0, 0, 270, WARM, 0.4 * flick); c.restore();
        glow(c, 1150, 660, 50, WARM, 0.35 * flick);
        const cf = 0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 5.3);
        glow(c, 573, sill - 26, 70, WARM, 0.5 * cf);
        c.fillStyle = `rgba(255,222,155,${cf})`; c.beginPath(); c.ellipse(573, sill - 28, 3.5, 8, 0, 0, TAU); c.fill();
        c.globalAlpha = 1;
      }
      c.globalCompositeOperation = 'source-over';
      c.restore();
      // grain film: lapisan CSS terpisah (.lb-grain), tidak digambar ulang tiap frame
    },
  };
}
