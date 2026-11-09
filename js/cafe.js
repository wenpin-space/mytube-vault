// "Kafe": kafe Jepang modern yang hangat — kayu oak terang, tirai noren di pintu, lampu kertas, konter
// barista, meja bar menghadap jendela besar, dan meja kita di depan (kopi & roti yang pelan-pelan habis
// lalu diantar lagi). Komposisi orisinal yang digambar dengan kode, lalu dilukis ulang oleh paint.js.
// Jendela memakai ruang yang sama dengan Kamar santai (W), jadi pemandangan & cuaca di luar dipakai bersama.

import { VW, VH, W, TAU, seeded, H, M, C, LI, DA, rr, lin, glow, softShadow, WARM, palette, woodGrain, shade, rimOf, leaf } from './paintkit.js';

export const FL = 640; // garis lantai di dinding belakang
export const BAR_Y = 568; // meja bar di bawah jendela
export const COUNTER_Y = 536; // permukaan konter depan (setinggi pinggang orang dewasa)
const BACK_DY = 46; // konter belakang & mesin espresso diturunkan, sepadan dengan tinggi barista
/** Mesin espresso (untuk uap) & tablet kasir — tablet digambar di depan barista. */
export const MACHINE = { x: 134, steamY: 382 + BACK_DY };
export const TABLET = { x: 214, y: COUNTER_Y, rot: -0.2, x0: -22, y0: -34, x1: 22, y1: -2 };
export const STOOLS = [490, 660, 830, 1000];
export const STOOL_SEAT = 622; // dudukan bangku bar: ±0,45 tinggi orang, meja bar ±1/5 tinggi orang di atasnya
export const STOOL_FOOT = 748;
export const STOOL_RING = STOOL_SEAT + 70; // cincin pijakan kaki

/** Menu: minuman & roti (id, nama, warna). */
export const DRINKS = [
  { id: 'latte', name: 'Caffè latte', vessel: 'cup', top: 'c49a6c', art: true },
  { id: 'matcha', name: 'Matcha latte', vessel: 'cup', top: '8fb06a', art: true },
  { id: 'kopisusu', name: 'Kopi susu', vessel: 'cup', top: 'a8774f', art: false },
  { id: 'ocha', name: 'Ocha hangat', vessel: 'yunomi', top: 'b9c46a', art: false },
];
export const FOODS = [
  { id: 'croissant', name: 'Croissant' },
  { id: 'melonpan', name: 'Melon pan' },
  { id: 'sando', name: 'Sando buah' },
];

// ------------------------------------------------------------------ interior (statis)
export function drawCafe(c, s, L) {
  const r = seeded(17);
  const P = palette(s.time, L);
  const outsideLight = M(P.bot, [255, 255, 255], 0.25);
  // dinding plester krem hangat
  c.fillStyle = lin(c, 0, 0, 0, FL, [[0, '#e3d6c2'], [0.7, '#d8c9b2'], [1, '#cdbca3']]);
  c.fillRect(0, 0, VW, FL);
  for (let i = 0; i < 1100; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,70,50'},0.035)`; c.fillRect(r() * VW, 60 + r() * (FL - 60), 2 + r() * 3, 2 + r() * 3); }
  // cahaya dari jendela di dinding sekitarnya
  c.fillStyle = lin(c, 0, W.y - 60, 0, FL, [[0, C(outsideLight, 0)], [0.5, C(outsideLight, 0.14 * (1 - L.dark))], [1, C(outsideLight, 0)]]);
  c.fillRect(W.x - 220, W.y - 60, W.w + 440, FL - W.y + 60);
  // panel kisi kayu oak di bawah (ciri kafe Jepang)
  woodGrain(c, 0, 586, VW, FL - 586, H('b48a5e'), { vertical: true, a: 0.1 });
  c.strokeStyle = 'rgba(70,45,25,0.35)'; c.lineWidth = 2;
  for (let x = 6; x < VW; x += 14) { c.beginPath(); c.moveTo(x, 588); c.lineTo(x, FL); c.stroke(); }
  // plafon kisi-kisi kayu
  woodGrain(c, 0, 0, VW, 62, H('c9a77c'), { a: 0.12 });
  c.strokeStyle = 'rgba(80,55,30,0.35)'; c.lineWidth = 3;
  for (let x = 10; x < VW; x += 26) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 60); c.stroke(); }
  c.fillStyle = '#8a6a4a'; c.fillRect(0, 58, VW, 6);

  // ---- lantai papan oak
  c.fillStyle = lin(c, 0, FL, 0, VH, [[0, '#b18d69'], [1, '#93704f']]); c.fillRect(0, FL, VW, VH - FL);
  // papan lantai memanjang ke arah kita (garis menuju titik hilang di tengah jendela)
  const vx = 800; const vy = 330;
  for (let i = -26; i <= 26; i++) {
    const x0 = vx + i * 64; const tt = (FL - vy) / (VH - vy);
    c.strokeStyle = `rgba(70,45,25,${0.22 + (i % 2 ? 0.05 : 0)})`; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(vx + (x0 - vx) * tt, FL); c.lineTo(x0, VH); c.stroke();
  }
  for (let k = 0; k < 140; k++) { // sambungan papan
    const i = Math.floor(r() * 52) - 26; const yy = FL + 6 + r() * (VH - FL - 6); const tt = (yy - vy) / (VH - vy);
    const xa = vx + i * 64 * tt; const xb = vx + (i + 1) * 64 * tt;
    c.strokeStyle = 'rgba(70,45,25,0.25)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(xa, yy); c.lineTo(xb, yy); c.stroke();
  }
  c.fillStyle = lin(c, 0, FL, 0, FL + 18, [[0, 'rgba(40,25,12,0.35)'], [1, 'rgba(40,25,12,0)']]); c.fillRect(0, FL, VW, 18);
  // cahaya jendela yang jatuh di lantai
  c.fillStyle = C(outsideLight, 0.16 * (1 - L.dark)); c.beginPath(); c.moveTo(W.x + 40, FL + 4); c.lineTo(W.x + W.w - 40, FL + 4); c.lineTo(W.x + W.w + 120, 790); c.lineTo(W.x - 80, 790); c.fill();
  // tanaman besar di lantai dekat konter
  softShadow(c, 405, 792, 54, 9, 0.45);
  c.fillStyle = lin(c, 373, 0, 437, 0, [[0, '#e6ddd0'], [1, '#b6ab9c']]); c.beginPath(); c.moveTo(371, 712); c.lineTo(439, 712); c.lineTo(431, 790); c.lineTo(379, 790); c.fill();
  c.strokeStyle = '#4a3a2c'; c.lineWidth = 5; c.beginPath(); c.moveTo(405, 712); c.quadraticCurveTo(399, 600, 411, 470); c.stroke();
  for (let i = 0; i < 16; i++) { const yy2 = 700 - i * 15; const side = i % 2 ? 1 : -1; leaf(c, 405 + Math.sin(i) * 4, yy2, 34 + (i % 4) * 4, 16, side > 0 ? -0.3 - (i % 3) * 0.2 : Math.PI + 0.3 + (i % 3) * 0.2, H(i % 3 ? '4e7c56' : '5f8f60'), 0); }

  // ---- jendela besar dengan rangka besi tipis
  c.clearRect(W.x, W.y, W.w, W.h);
  const fr = H('2b2724');
  const bar = (x, y, w, h) => { c.fillStyle = C(fr); c.fillRect(x, y, w, h); c.fillStyle = C(M(fr, outsideLight, 0.3), 0.7); if (w > h) c.fillRect(x, y + h - 2, w, 2); else c.fillRect(x + w - 2, y, 2, h); };
  bar(W.x - 12, W.y - 12, W.w + 24, 12); bar(W.x - 12, W.y + W.h, W.w + 24, 10);
  bar(W.x - 12, W.y, 12, W.h); bar(W.x + W.w, W.y, 12, W.h);
  bar(W.x + W.w / 3 - 4, W.y, 8, W.h); bar(W.x + (2 * W.w) / 3 - 4, W.y, 8, W.h);
  bar(W.x, W.y + 96, W.w, 6);
  // ---- meja bar menghadap jendela + bangku tinggi
  softShadow(c, W.x + W.w / 2, BAR_Y + 30, W.w * 0.5, 16, 0.35);
  woodGrain(c, W.x + 10, BAR_Y, W.w - 20, 16, H('c69a68'), { a: 0.14 });
  c.fillStyle = 'rgba(255,240,220,0.35)'; c.fillRect(W.x + 10, BAR_Y, W.w - 20, 3);
  c.fillStyle = '#7d5a3c'; c.fillRect(W.x + 10, BAR_Y + 16, W.w - 20, 5);
  [W.x + 40, W.x + W.w - 46].forEach((x) => { c.fillStyle = '#6e4f35'; c.fillRect(x, BAR_Y + 20, 8, FL - BAR_Y - 14); });
  STOOLS.forEach((x) => {
    softShadow(c, x, STOOL_FOOT + 2, 44, 7, 0.45);
    c.strokeStyle = '#3b2c22'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 20, STOOL_SEAT + 6); c.lineTo(x - 30, STOOL_FOOT); c.moveTo(x + 20, STOOL_SEAT + 6); c.lineTo(x + 30, STOOL_FOOT); c.moveTo(x - 6, STOOL_SEAT + 8); c.lineTo(x - 8, STOOL_FOOT - 6); c.moveTo(x + 6, STOOL_SEAT + 8); c.lineTo(x + 8, STOOL_FOOT - 6); c.stroke();
    c.lineWidth = 3.5; c.beginPath(); c.ellipse(x, STOOL_RING, 27, 5, 0, 0, TAU); c.stroke();
    c.fillStyle = '#7a5a3e'; c.beginPath(); c.ellipse(x, STOOL_SEAT + 5, 33, 9, 0, 0, TAU); c.fill();
    c.fillStyle = lin(c, x - 33, 0, x + 33, 0, [[0, '#dcb487'], [1, '#a77c54']]); c.beginPath(); c.ellipse(x, STOOL_SEAT, 33, 9, 0, 0, TAU); c.fill();
  });
  // barang kecil di meja bar
  c.fillStyle = '#e9e2d4'; rr(c, W.x + 520, BAR_Y - 30, 20, 30, 5); c.fill();
  c.strokeStyle = '#4f7a58'; c.lineWidth = 2; c.beginPath(); c.moveTo(W.x + 530, BAR_Y - 30); c.quadraticCurveTo(W.x + 522, BAR_Y - 58, W.x + 512, BAR_Y - 66); c.stroke();
  c.fillStyle = '#e7a6a0'; c.beginPath(); c.arc(W.x + 511, BAR_Y - 68, 6, 0, TAU); c.fill();

  // ---- area barista (kiri): papan menu, rak, konter belakang + mesin espresso, konter depan
  // papan menu kayu dengan tulisan kapur
  c.fillStyle = '#5d4330'; rr(c, 34, 82, 236, 118, 6); c.fill();
  c.fillStyle = '#2f2a26'; rr(c, 42, 90, 220, 102, 4); c.fill();
  c.fillStyle = 'rgba(245,238,225,0.85)'; c.font = '600 16px Poppins, sans-serif'; c.fillText('MENU', 56, 114);
  c.strokeStyle = 'rgba(245,238,225,0.55)'; c.lineWidth = 2;
  [128, 146, 164, 180].forEach((y, i) => { c.beginPath(); c.moveTo(56, y); c.lineTo(150 + (i % 2) * 22, y); c.moveTo(214, y); c.lineTo(244, y); c.stroke(); });
  c.strokeStyle = 'rgba(245,238,225,0.7)'; c.beginPath(); c.arc(220, 112, 11, 0, Math.PI); c.moveTo(231, 112); c.arc(234, 117, 4, -1.2, 1.4); c.stroke();
  // rak terbuka
  [236, 312].forEach((y, si) => {
    softShadow(c, 156, y + 8, 120, 6, 0.3);
    woodGrain(c, 26, y, 254, 10, H('a27b55'), { a: 0.15 });
    let x = 40;
    while (x < 262) {
      const kind = r();
      if (kind < 0.45) { // cangkir keramik
        const col = ['e8e0d2', '9fb3b8', 'c98d6e', '3f4a52'][Math.floor(r() * 4)];
        c.fillStyle = C(H(col)); rr(c, x, y - 22, 22, 22, 4); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 3, y - 20, 3, 16);
        x += 28;
      } else if (kind < 0.7) { // toples biji kopi
        c.fillStyle = 'rgba(210,225,230,0.5)'; rr(c, x, y - 40, 26, 40, 5); c.fill();
        c.fillStyle = '#4a2f1f'; c.fillRect(x + 3, y - 26, 20, 24);
        c.fillStyle = '#8a6a4a'; c.fillRect(x + 2, y - 44, 22, 5);
        x += 32;
      } else if (si === 0 && kind < 0.85) { // tanaman kecil
        c.fillStyle = '#c97f5f'; rr(c, x, y - 20, 22, 20, 3); c.fill();
        for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#5c8a5c' : '#4b7a50'; c.beginPath(); c.ellipse(x + 11 + Math.cos(k) * 7, y - 28 - Math.sin(k * 1.3) * 6, 5, 10, k, 0, TAU); c.fill(); }
        x += 30;
      } else x += 14;
    }
  });
  // konter belakang + mesin espresso
  c.save(); c.translate(0, BACK_DY);
  woodGrain(c, 0, 420, 300, 14, H('9c7653'), { a: 0.15 });
  c.fillStyle = '#5b4231'; c.fillRect(0, 434, 300, FL - 434);
  softShadow(c, 130, 424, 70, 6, 0.4);
  c.fillStyle = lin(c, 72, 0, 196, 0, [[0, '#c9ccd0'], [0.45, '#f1f2f3'], [1, '#8d9196']]); rr(c, 72, 344, 124, 78, 8); c.fill();
  c.fillStyle = '#b8614a'; c.fillRect(72, 352, 124, 10);
  c.fillStyle = '#2a2b2e'; c.fillRect(88, 380, 92, 6);
  c.fillStyle = '#1d1e20'; [100, 150].forEach((x) => { c.fillRect(x, 386, 18, 10); c.fillRect(x + 6, 396, 6, 8); });
  c.fillStyle = '#e9e3d8'; [104, 154].forEach((x) => { rr(c, x, 404, 14, 14, 3); c.fill(); });
  c.fillStyle = lin(c, 206, 0, 238, 0, [[0, '#3a3c40'], [1, '#202124']]); rr(c, 206, 352, 30, 70, 5); c.fill();
  c.fillStyle = 'rgba(120,80,50,0.8)'; c.beginPath(); c.moveTo(208, 352); c.lineTo(234, 352); c.lineTo(228, 330); c.lineTo(214, 330); c.fill();
  c.restore();
  // konter depan: kisi oak + lemari kaca roti
  softShadow(c, 180, 724, 210, 12, 0.45);
  woodGrain(c, -20, COUNTER_Y + 14, 390, 716 - COUNTER_Y - 14, H('c39a6c'), { vertical: true, a: 0.1 });
  c.strokeStyle = 'rgba(80,50,28,0.35)'; c.lineWidth = 2;
  for (let x = -14; x < 370; x += 12) { c.beginPath(); c.moveTo(x, COUNTER_Y + 16); c.lineTo(x, 700); c.stroke(); }
  c.fillStyle = '#3d2b20'; c.fillRect(-20, 700, 390, 16);
  woodGrain(c, -20, COUNTER_Y, 394, 16, H('e0c49e'), { a: 0.12 });
  c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(-20, COUNTER_Y, 394, 3);
  c.fillStyle = '#8f6c4b'; c.fillRect(-20, COUNTER_Y + 14, 394, 4);
  // lemari kaca roti
  c.fillStyle = 'rgba(214,230,235,0.32)'; rr(c, 258, COUNTER_Y - 58, 104, 58, 6); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; rr(c, 258, COUNTER_Y - 58, 104, 58, 6); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(258, COUNTER_Y - 30, 104, 2);
  [[278, COUNTER_Y - 38, 'd99a4a'], [312, COUNTER_Y - 40, 'e8c37e'], [342, COUNTER_Y - 38, 'cf8f45'], [282, COUNTER_Y - 10, 'e6c27a'], [318, COUNTER_Y - 10, 'd4934b']].forEach(([x, y, col]) => {
    c.fillStyle = C(H(col)); c.beginPath(); c.ellipse(x, y, 12, 6, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(x - 3, y - 2, 6, 2, 0, 0, TAU); c.fill();
  });
  // lonceng kecil & tablet kasir
  c.fillStyle = '#2b2d31'; c.save(); c.translate(214, COUNTER_Y); c.rotate(-0.2); rr(c, -22, -34, 44, 32, 4); c.fill(); c.fillStyle = '#87a9b7'; rr(c, -18, -30, 36, 24, 2); c.fill(); c.restore();

  // ---- pintu masuk (kanan) + tirai noren
  const dx = 1340; const dw = 144; const dy = 182;
  c.fillStyle = '#6e4f37'; c.fillRect(dx - 12, dy - 12, dw + 24, FL - dy + 12);
  c.fillStyle = lin(c, 0, dy, 0, FL, [[0, C(M(outsideLight, [255, 255, 255], 0.2), 0.95)], [1, C(M(outsideLight, [120, 130, 140], 0.4), 0.95)]]);
  c.fillRect(dx, dy, dw, FL - dy);
  c.fillStyle = '#8a6646'; c.fillRect(dx + dw / 2 - 3, dy, 6, FL - dy); c.fillRect(dx, dy + 250, dw, 8);
  c.fillStyle = '#c9a36c'; c.fillRect(dx + dw / 2 - 16, dy + 270, 4, 40); c.fillRect(dx + dw / 2 + 12, dy + 270, 4, 40);
  // noren: kain indigo dengan dua belahan
  c.fillStyle = '#3a2a1f'; c.fillRect(dx - 24, dy - 6, dw + 48, 8);
  const nw = (dw + 40) / 3;
  for (let i = 0; i < 3; i++) {
    const x0 = dx - 20 + i * nw + 2;
    c.fillStyle = lin(c, x0, 0, x0 + nw - 4, 0, [[0, '#2b4466'], [0.5, '#34527a'], [1, '#273e5d']]);
    c.beginPath(); c.moveTo(x0, dy); c.lineTo(x0 + nw - 4, dy); c.lineTo(x0 + nw - 6, dy + 116); c.lineTo(x0 + 2, dy + 118); c.fill();
  }
  c.strokeStyle = 'rgba(245,240,230,0.85)'; c.lineWidth = 3; c.beginPath(); c.arc(dx + dw / 2, dy + 52, 18, 0, TAU); c.stroke();
  c.beginPath(); c.ellipse(dx + dw / 2, dy + 52, 6, 10, 0.5, 0, TAU); c.stroke();
  // keset
  c.fillStyle = '#6a5a48'; c.beginPath(); c.moveTo(dx - 10, FL + 6); c.lineTo(dx + dw + 10, FL + 6); c.lineTo(dx + dw + 30, FL + 30); c.lineTo(dx - 30, FL + 30); c.fill();
  // jam dinding (jarumnya bergerak sesuai jam sebenarnya)
  c.fillStyle = '#3a2a1f'; c.beginPath(); c.arc(1412, 112, 34, 0, TAU); c.fill();
  c.fillStyle = '#f2ebde'; c.beginPath(); c.arc(1412, 112, 29, 0, TAU); c.fill();
  c.fillStyle = '#3a2a1f'; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.fillRect(1412 + Math.cos(a) * 24 - 1.5, 112 + Math.sin(a) * 24 - 1.5, 3, 3); }

  // ---- meja bundar untuk ngobrol (kanan tengah) + dua kursi — ukurannya sepadan dengan orang di depan bangku bar
  softShadow(c, 1200, 798, 120, 12, 0.42);
  const chair = (x, flip) => {
    const bx = x + (flip ? 30 : -30);
    c.strokeStyle = '#4a3324'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 22, 732); c.lineTo(x - 27, 796); c.moveTo(x + 22, 732); c.lineTo(x + 27, 796); c.stroke();
    c.lineWidth = 6; c.beginPath(); c.moveTo(bx, 732); c.lineTo(bx + (flip ? 5 : -5), 640); c.stroke();
    c.fillStyle = '#a77a50'; rr(c, bx - (flip ? 3 : 12), 634, 15, 52, 6); c.fill();
    c.fillStyle = '#7a5a3e'; c.beginPath(); c.ellipse(x, 734, 34, 9, 0, 0, TAU); c.fill();
    c.fillStyle = lin(c, x - 34, 0, x + 34, 0, [[0, '#d0a676'], [1, '#9c7149']]); c.beginPath(); c.ellipse(x, 730, 34, 9, 0, 0, TAU); c.fill();
  };
  chair(1096, false); chair(1304, true);
  c.strokeStyle = '#3d2b20'; c.lineWidth = 9; c.beginPath(); c.moveTo(1200, 696); c.lineTo(1200, 794); c.stroke();
  c.fillStyle = '#3d2b20'; c.beginPath(); c.ellipse(1200, 796, 34, 7, 0, 0, TAU); c.fill();
  c.fillStyle = '#7a5a3e'; c.beginPath(); c.ellipse(1200, 694, 88, 19, 0, 0, TAU); c.fill();
  c.fillStyle = lin(c, 1112, 0, 1288, 0, [[0, '#e1bd90'], [1, '#b08257']]); c.beginPath(); c.ellipse(1200, 689, 88, 18, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,240,215,0.25)'; c.beginPath(); c.ellipse(1180, 685, 50, 7, 0, 0, TAU); c.fill();

  // ---- meja kita (depan)
  c.save();
  c.beginPath(); c.moveTo(-40, 812); c.lineTo(VW + 40, 812); c.lineTo(VW + 40, VH); c.lineTo(-40, VH); c.closePath(); c.clip();
  woodGrain(c, -40, 812, VW + 80, VH - 812, H('8c5f3e'), { planks: 2, a: 0.14 });
  c.fillStyle = lin(c, 0, 812, 0, VH, [[0, 'rgba(255,225,190,0.12)'], [1, 'rgba(0,0,0,0.3)']]); c.fillRect(-40, 812, VW + 80, VH - 812);
  c.restore();
  c.fillStyle = '#b8875d'; c.fillRect(-40, 806, VW + 80, 8); c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(-40, 806, VW + 80, 2);
  // tumpukan buku & ponsel
  softShadow(c, 300, 870, 120, 10, 0.45);
  [['3e5a6b', 0], ['d9b57e', 1]].forEach(([col, i]) => { const cc = H(col); c.fillStyle = lin(c, 0, 846 - i * 18, 0, 864 - i * 18, [[0, C(LI(cc, 0.12))], [1, C(DA(cc, 0.25))]]); rr(c, 200 + i * 10, 846 - i * 18, 200 - i * 20, 18, 3); c.fill(); c.fillStyle = '#efe6d4'; c.fillRect(204 + i * 10, 850 - i * 18, 190 - i * 20, 3); });
  c.fillStyle = '#1e2024'; c.save(); c.translate(470, 868); c.rotate(0.12); rr(c, -26, -12, 52, 24, 5); c.fill(); c.restore();
  // vas bunga kecil
  softShadow(c, 610, 862, 22, 5, 0.4);
  c.fillStyle = lin(c, 596, 0, 624, 0, [[0, '#d7dfe0'], [1, '#9eb0b4']]); rr(c, 597, 818, 26, 44, 9); c.fill();
  c.strokeStyle = '#4f7a58'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(610, 820); c.quadraticCurveTo(604, 790, 596, 772); c.moveTo(610, 820); c.quadraticCurveTo(620, 792, 630, 780); c.stroke();
  c.fillStyle = '#f2d36b'; c.beginPath(); c.arc(596, 770, 7, 0, TAU); c.fill(); c.fillStyle = '#efb3a8'; c.beginPath(); c.arc(631, 778, 6, 0, TAU); c.fill();
  // buku sketsa terbuka + pensil
  softShadow(c, 1230, 878, 110, 9, 0.4);
  c.fillStyle = lin(c, 1130, 836, 1330, 884, [[0, '#f3ecdc'], [0.48, '#e5dcc7'], [0.52, '#d9cfb8'], [1, '#efe7d4']]);
  c.beginPath(); c.moveTo(1130, 846); c.lineTo(1320, 836); c.lineTo(1334, 880); c.lineTo(1136, 892); c.fill();
  c.strokeStyle = 'rgba(80,90,110,0.35)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(1150, 860); c.quadraticCurveTo(1180, 848, 1210, 862); c.moveTo(1240, 854); c.lineTo(1300, 850); c.moveTo(1240, 864); c.lineTo(1290, 861); c.stroke();
  c.save(); c.translate(1300, 888); c.rotate(-0.25); c.fillStyle = '#4f6f8a'; c.fillRect(0, -3, 90, 6); c.fillStyle = '#f0d3a7'; c.beginPath(); c.moveTo(90, -3); c.lineTo(100, 0); c.lineTo(90, 3); c.fill(); c.restore();

  // ---- ambient occlusion & cahaya sesuai waktu
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = lin(c, 0, 62, 0, 180, [[0, 'rgba(60,40,20,0.25)'], [1, 'rgba(60,40,20,0)']]); c.fillRect(0, 62, VW, 120);
  c.fillStyle = lin(c, 0, 0, 160, 0, [[0, 'rgba(40,25,10,0.3)'], [1, 'rgba(40,25,10,0)']]); c.fillRect(0, 0, 160, VH);
  c.fillStyle = lin(c, VW, 0, VW - 160, 0, [[0, 'rgba(40,25,10,0.3)'], [1, 'rgba(40,25,10,0)']]); c.fillRect(VW - 160, 0, 160, VH);
  // kafe lebih terang dari kamar: gelapnya sedikit lebih lembut, dengan nada hangat
  c.fillStyle = `rgba(16,20,34,${L.indoorDark * 0.62})`; c.fillRect(0, 0, VW, VH);
  if (L.warm) { c.fillStyle = `rgba(255,140,80,${L.warm * 0.3})`; c.fillRect(0, 0, VW, VH); }
  if (L.lampsOn) {
    const k = Math.min(1, (L.indoorDark - 0.2) * 1.6);
    const spill = (x, y, rad, a, sy = 1) => { c.save(); c.translate(x, y); c.scale(1, sy); const g = c.createRadialGradient(0, 0, 0, 0, 0, rad); g.addColorStop(0, C(WARM, a * k)); g.addColorStop(0.5, C(WARM, a * k * 0.4)); g.addColorStop(1, C(WARM, 0)); c.fillStyle = g; c.fillRect(-rad, -rad, rad * 2, rad * 2); c.restore(); };
    LANTERNS.forEach((x) => spill(x, 230, 300, 0.32));
    spill(800, BAR_Y, 600, 0.3, 0.3);
    spill(160, 430, 260, 0.35);
    spill(800, 860, 700, 0.28, 0.25);
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = C(WARM, 0.5 * k); c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(W.x + 10, BAR_Y + 1); c.lineTo(W.x + W.w - 10, BAR_Y + 1); c.stroke();
    c.beginPath(); c.moveTo(-20, COUNTER_Y + 1); c.lineTo(374, COUNTER_Y + 1); c.stroke();
    c.beginPath(); c.moveTo(-40, 807); c.lineTo(VW + 40, 807); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ sprite (dilukis sekali, digerakkan)
export const LANTERNS = [470, 800, 1130];
export const CUP = { x: 770, y: 842 }; // titik dasar cangkir di meja kita
export const PLATE = { x: 960, y: 848 };
export const CAFE_SPRITES = {
  lantern: { x: 760, y: 56, w: 80, h: 196, px: 800, py: 62 },
  doorPlant: { x: 1280, y: 170, w: 345, h: 545, px: 1495, py: 700 }, // cukup lebar untuk semua daun (tidak terpotong kotak)
  cup: { x: CUP.x - 52, y: CUP.y - 72, w: 116, h: 82, px: CUP.x, py: CUP.y },
  yunomi: { x: CUP.x - 40, y: CUP.y - 78, w: 80, h: 86, px: CUP.x, py: CUP.y },
  plate: { x: PLATE.x - 76, y: PLATE.y - 22, w: 152, h: 36, px: PLATE.x, py: PLATE.y },
  croissant: { x: PLATE.x - 62, y: PLATE.y - 52, w: 124, h: 50, px: PLATE.x, py: PLATE.y },
  melonpan: { x: PLATE.x - 50, y: PLATE.y - 56, w: 100, h: 54, px: PLATE.x, py: PLATE.y },
  sando: { x: PLATE.x - 56, y: PLATE.y - 60, w: 112, h: 58, px: PLATE.x, py: PLATE.y },
  arm: { x: 1000, y: 650, w: 620, h: 120, px: 1010, py: 700 },
};

function drawLantern(c, L) {
  c.strokeStyle = C(shade(L, '2b2622')); c.lineWidth = 2; c.beginPath(); c.moveTo(800, 62); c.lineTo(800, 182); c.stroke();
  c.fillStyle = C(shade(L, '3a2a1f')); c.fillRect(792, 180, 16, 8);
  const paper = M(H('f6ecd8'), H('ffd9a0'), 0.25 + rimOf(L) * 0.4);
  const g = c.createRadialGradient(792, 210, 4, 800, 220, 38);
  g.addColorStop(0, C(LI(paper, 0.3))); g.addColorStop(0.7, C(paper)); g.addColorStop(1, C(DA(paper, 0.18)));
  c.fillStyle = g; c.beginPath(); c.ellipse(800, 222, 36, 34, 0, 0, TAU); c.fill();
  c.strokeStyle = C(DA(paper, 0.22), 0.6); c.lineWidth = 1.2;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.ellipse(800, 222 + i * 9, Math.sqrt(Math.max(0, 1 - (i * 9 / 34) ** 2)) * 36, 3, 0, 0, TAU); c.stroke(); }
  c.fillStyle = C(shade(L, '3a2a1f')); c.fillRect(794, 254, 12, 4);
}
function drawDoorPlant(c, L) {
  c.save(); c.translate(-45, 0); // sedikit ke kiri supaya daun kanan tidak terpotong tepi layar
  const rim = rimOf(L);
  softShadow(c, 1540, 704, 52, 8, 0.45);
  c.fillStyle = lin(c, 1508, 0, 1572, 0, [[0, C(shade(L, 'e9e2d6'))], [1, C(shade(L, 'b9b1a4'))]]);
  c.beginPath(); c.moveTo(1504, 620); c.lineTo(1576, 620); c.lineTo(1566, 702); c.lineTo(1514, 702); c.fill();
  const stems = [[-0.62, 190, 50], [-0.38, 250, 58], [-0.14, 300, 62], [0.1, 320, 64], [0.34, 270, 60], [0.58, 210, 54], [-0.85, 140, 44], [0.82, 150, 44], [-0.25, 180, 48], [0.22, 200, 50]];
  stems.forEach(([ang, len, size], i) => {
    const a = (ang > 0 ? ang * 0.45 : ang) - Math.PI / 2; const bx = 1540 + (i % 3 - 1) * 4; const by = 622; // daun kanan lebih tegak supaya tidak keluar layar
    const tx = bx + Math.cos(a) * len; const ty = by + Math.sin(a) * len;
    const cx = bx + Math.cos(a) * len * 0.5 + (i % 2 ? 18 : -18); const cy = by + Math.sin(a) * len * 0.5;
    c.strokeStyle = C(shade(L, '345a44')); c.lineWidth = 3.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(cx, cy, tx, ty); c.stroke();
    const ea = Math.atan2(ty - cy, tx - cx);
    leaf(c, tx, ty, size * 1.9, size * 0.85, ea + (i % 2 ? 0.5 : -0.5), shade(L, ['3f6e52', '4a7a5c', '355f47'][i % 3]), rim * 0.3);
  });
  c.restore();
}
/** Cangkir keramik + tatakan (isi minuman digambar bergerak di atasnya). */
function drawCup(c, L) {
  const { x, y } = CUP;
  const cer = shade(L, 'f1ece4'); const dk = DA(cer, 0.22);
  softShadow(c, x, y + 2, 58, 8, 0.45);
  c.fillStyle = lin(c, x - 50, 0, x + 50, 0, [[0, C(dk)], [0.4, C(cer)], [1, C(DA(cer, 0.3))]]); c.beginPath(); c.ellipse(x, y - 4, 50, 10, 0, 0, TAU); c.fill();
  c.strokeStyle = C(cer); c.lineWidth = 8; c.beginPath(); c.ellipse(x + 38, y - 36, 12, 14, 0, -1.4, 1.4); c.stroke();
  c.fillStyle = lin(c, x - 34, 0, x + 34, 0, [[0, C(LI(cer, 0.1))], [0.55, C(cer)], [1, C(dk)]]);
  c.beginPath(); c.moveTo(x - 34, y - 58); c.lineTo(x + 34, y - 58); c.quadraticCurveTo(x + 32, y - 12, x + 18, y - 8); c.lineTo(x - 18, y - 8); c.quadraticCurveTo(x - 32, y - 12, x - 34, y - 58); c.fill();
  c.fillStyle = C(DA(cer, 0.45)); c.beginPath(); c.ellipse(x, y - 58, 34, 8, 0, 0, TAU); c.fill(); // bagian dalam
  c.strokeStyle = C(LI(cer, 0.3)); c.lineWidth = 2; c.beginPath(); c.ellipse(x, y - 58, 34, 8, 0, 0, TAU); c.stroke();
}
/** Cangkir teh Jepang (yunomi) tanpa pegangan. */
function drawYunomi(c, L) {
  const { x, y } = CUP;
  const cl = shade(L, 'c9b49a'); const glaze = shade(L, '6f8a8f');
  softShadow(c, x, y + 2, 34, 6, 0.45);
  c.fillStyle = lin(c, x - 26, 0, x + 26, 0, [[0, C(LI(cl, 0.08))], [0.6, C(cl)], [1, C(DA(cl, 0.3))]]);
  c.beginPath(); c.moveTo(x - 28, y - 70); c.lineTo(x + 28, y - 70); c.lineTo(x + 24, y - 2); c.lineTo(x - 24, y - 2); c.fill();
  c.fillStyle = lin(c, x - 28, 0, x + 28, 0, [[0, C(LI(glaze, 0.1))], [1, C(DA(glaze, 0.3))]]);
  c.beginPath(); c.moveTo(x - 28, y - 70); c.lineTo(x + 28, y - 70); c.lineTo(x + 27, y - 40); c.quadraticCurveTo(x, y - 30, x - 27, y - 42); c.fill();
  c.fillStyle = C(DA(glaze, 0.5)); c.beginPath(); c.ellipse(x, y - 70, 28, 7, 0, 0, TAU); c.fill();
}
function drawPlate(c, L) {
  const { x, y } = PLATE; const p = shade(L, 'f2eee6');
  softShadow(c, x, y + 4, 76, 10, 0.4);
  c.fillStyle = C(DA(p, 0.12)); c.beginPath(); c.ellipse(x, y, 72, 15, 0, 0, TAU); c.fill();
  c.fillStyle = C(p); c.beginPath(); c.ellipse(x, y - 3, 70, 13, 0, 0, TAU); c.fill();
  c.strokeStyle = C(shade(L, '6f8fa8'), 0.6); c.lineWidth = 2; c.beginPath(); c.ellipse(x, y - 3, 62, 10, 0, 0, TAU); c.stroke();
}
function drawCroissant(c, L) {
  const { x, y } = PLATE; const b = shade(L, 'd99a4a'); const d = DA(b, 0.3);
  for (let i = -3; i <= 3; i++) {
    const w = 22 - Math.abs(i) * 3; const hh = 24 - Math.abs(i) * 4;
    c.fillStyle = lin(c, 0, y - 10 - hh, 0, y - 6, [[0, C(LI(b, 0.18))], [1, C(d)]]);
    c.beginPath(); c.ellipse(x + i * 14, y - 12 - (3 - Math.abs(i)) * 2, w, hh * 0.6, i * 0.25, 0, TAU); c.fill();
    c.strokeStyle = C(d, 0.6); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + i * 14 - 4, y - 24); c.lineTo(x + i * 14 + 2, y - 8); c.stroke();
  }
}
function drawMelonpan(c, L) {
  const { x, y } = PLATE; const b = shade(L, 'e8c37e');
  c.fillStyle = lin(c, 0, y - 50, 0, y - 6, [[0, C(LI(b, 0.2))], [1, C(DA(b, 0.25))]]);
  c.beginPath(); c.ellipse(x, y - 22, 44, 26, 0, Math.PI, TAU); c.lineTo(x + 44, y - 10); c.quadraticCurveTo(x, y - 2, x - 44, y - 10); c.fill();
  c.strokeStyle = C(DA(b, 0.22), 0.7); c.lineWidth = 1.6;
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 16 - 18, y - 40); c.lineTo(x + i * 16 + 18, y - 10); c.moveTo(x + i * 16 + 18, y - 40); c.lineTo(x + i * 16 - 18, y - 10); c.stroke(); }
}
function drawSando(c, L) {
  const { x, y } = PLATE; const bread = shade(L, 'f4ead6'); const cream = shade(L, 'fffaf0');
  [[-28, -0.08], [26, 0.1]].forEach(([dx, rot]) => {
    c.save(); c.translate(x + dx, y - 8); c.rotate(rot);
    c.fillStyle = C(bread); c.beginPath(); c.moveTo(-26, 0); c.lineTo(26, 0); c.lineTo(0, -48); c.fill();
    c.fillStyle = C(cream); c.beginPath(); c.moveTo(-20, -3); c.lineTo(20, -3); c.lineTo(0, -38); c.fill();
    c.fillStyle = C(shade(L, 'e0525a')); c.beginPath(); c.arc(-6, -14, 5, 0, TAU); c.fill();
    c.fillStyle = C(shade(L, 'f2b33d')); c.beginPath(); c.arc(7, -12, 5, 0, TAU); c.fill();
    c.fillStyle = C(shade(L, '7cb36a')); c.beginPath(); c.arc(0, -24, 4, 0, TAU); c.fill();
    c.restore();
  });
}
/** Lengan pelayan dari kanan (mengantar & mengambil pesanan). Titik pegangan di (1010, 700). */
function drawArm(c, L) {
  const sleeve = shade(L, '2f3d4c'); const skin = shade(L, 'e0b48f');
  c.fillStyle = lin(c, 0, 670, 0, 740, [[0, C(LI(sleeve, 0.12))], [1, C(DA(sleeve, 0.3))]]);
  c.beginPath(); c.moveTo(1060, 676); c.lineTo(1620, 660); c.lineTo(1620, 760); c.lineTo(1062, 726); c.fill();
  c.fillStyle = C(shade(L, 'efe8dc')); c.fillRect(1052, 676, 14, 50);
  c.fillStyle = C(skin); c.beginPath(); c.moveTo(1054, 682); c.quadraticCurveTo(1018, 676, 1006, 692); c.quadraticCurveTo(1000, 704, 1012, 712); c.quadraticCurveTo(1030, 722, 1054, 720); c.fill();
  c.strokeStyle = C(DA(skin, 0.25), 0.6); c.lineWidth = 1.5; c.beginPath(); c.moveTo(1016, 698); c.lineTo(1032, 700); c.moveTo(1016, 706); c.lineTo(1032, 708); c.stroke();
}
export const CAFE_SPRITE_DRAW = { lantern: drawLantern, doorPlant: drawDoorPlant, cup: drawCup, yunomi: drawYunomi, plate: drawPlate, croissant: drawCroissant, melonpan: drawMelonpan, sando: drawSando, arm: drawArm };

// ------------------------------------------------------------------ bagian bergerak
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const drinkOf = (id) => DRINKS.find((d) => d.id === id) || DRINKS[0];

/**
 * Pengatur animasi kafe: lampu berayun, minuman & roti yang berkurang,
 * dan lengan pelayan yang mengambil pesanan lama lalu mengantar yang baru.
 * cafe (dari Lobby) = { serial, drink, food, drinkLeft 0..1, foodLeft 0..1 }
 */
export function createCafeAnimator(hooks = {}) {
  let shown = null; // pesanan yang sedang ada di meja { serial, drink, food }
  let deliver = null; // { t0, old, next }
  let sip = { t0: -10, level: 1 };
  let shownLeft = { drink: 1, food: 1 };

  function update(cafe, now) {
    if (!cafe) return;
    if (!shown) { shown = { serial: cafe.serial, drink: cafe.drink, food: cafe.food }; shownLeft = { drink: cafe.drinkLeft, food: cafe.foodLeft }; sip.level = cafe.drinkLeft; return; }
    if (cafe.serial !== shown.serial && !deliver) {
      deliver = { t0: now, old: { ...shown, left: { ...shownLeft } }, next: { serial: cafe.serial, drink: cafe.drink, food: cafe.food } };
      return;
    }
    if (deliver) return;
    // minum seteguk setiap isinya berkurang ±1/6 (cangkir terangkat sebentar)
    if (shownLeft.drink - cafe.drinkLeft >= 1 / 6 - 1e-6 || (cafe.drinkLeft <= 0 && shownLeft.drink > 0)) { sip = { t0: now, level: cafe.drinkLeft }; shownLeft.drink = cafe.drinkLeft; }
    shownLeft.food = cafe.foodLeft;
  }

  /** Posisi & isi barang di meja kita untuk frame ini. */
  function tableState(now) {
    const out = { drink: shown && shown.drink, food: shown && shown.food, level: sip.level, foodLeft: shownLeft.food, cupDx: 0, cupDy: 0, cupScale: 1, cupAlpha: 1, plateDx: 0, arm: null };
    // seteguk: cangkir naik ke arah kita lalu kembali, isinya turun saat kembali
    const st = now - sip.t0;
    if (st < 3.2) {
      const up = st < 1 ? ease(st) : st < 2.2 ? 1 : ease(1 - (st - 2.2));
      out.cupDy = -up * 150; out.cupDx = up * 30; out.cupScale = 1 + up * 0.5; out.cupAlpha = 1 - up * 0.95;
      out.level = st < 2.2 ? Math.min(1, sip.level + 1 / 6) : sip.level;
    }
    if (!deliver) return out;
    // antar pesanan: ambil cangkir lama → antar cangkir baru → ambil piring lama → antar piring baru
    const t = now - deliver.t0;
    const seg = (a, b) => clamp01((t - a) / (b - a));
    const OFF = 700; // lengan di luar layar (kanan)
    const hasOld = !!deliver.old.drink;
    const D = 1.1; // durasi satu gerakan lengan
    const steps = hasOld ? [['cup', 'out'], ['cup', 'in'], ['plate', 'out'], ['plate', 'in']] : [['cup', 'in'], ['plate', 'in']];
    const total = steps.length * D * 2 + 0.4;
    if (t >= total) { shown = { ...deliver.next }; shownLeft = { drink: 1, food: 1 }; sip = { t0: -10, level: 1 }; deliver = null; if (hooks.onPlaced) hooks.onPlaced(); return tableState(now); }
    // tiap langkah: lengan masuk (D), lalu keluar (D) membawa barang lama / meninggalkan barang baru
    const i = Math.min(steps.length - 1, Math.floor(t / (D * 2)));
    const [what, dir] = steps[i];
    const lt = t - i * D * 2;
    const inP = ease(seg(i * D * 2, i * D * 2 + D)); const outP = ease(seg(i * D * 2 + D, i * D * 2 + D * 2));
    const armX = OFF * (1 - inP) + OFF * outP;
    const target = what === 'cup' ? { x: CUP.x, y: CUP.y - 40 } : { x: PLATE.x, y: PLATE.y - 10 };
    out.arm = { x: target.x + armX, y: target.y };
    const done = (w, d) => steps.findIndex((s2) => s2[0] === w && s2[1] === d) < i;
    // isi meja menurut langkah yang sudah lewat
    const cupGone = hasOld && (done('cup', 'out') || (what === 'cup' && dir === 'out' && lt > D));
    const cupNew = done('cup', 'in') || (what === 'cup' && dir === 'in' && lt > D);
    const plateGone = hasOld && (done('plate', 'out') || (what === 'plate' && dir === 'out' && lt > D));
    const plateNew = done('plate', 'in') || (what === 'plate' && dir === 'in' && lt > D);
    // cangkir/piring menempel di tangan saat dibawa
    out.drink = cupNew ? deliver.next.drink : cupGone ? null : deliver.old.drink;
    out.level = cupNew ? 1 : deliver.old.left.drink;
    out.food = plateNew ? deliver.next.food : plateGone ? null : deliver.old.food;
    out.foodLeft = plateNew ? 1 : deliver.old.left.food;
    out.carry = null;
    if (what === 'cup' && dir === 'out' && lt > D) out.carry = { kind: 'cup', id: deliver.old.drink, level: deliver.old.left.drink, dx: armX };
    if (what === 'cup' && dir === 'in' && lt <= D) out.carry = { kind: 'cup', id: deliver.next.drink, level: 1, dx: armX };
    if (what === 'plate' && dir === 'out' && lt > D) out.carry = { kind: 'plate', id: deliver.old.food, left: deliver.old.left.food, dx: armX };
    if (what === 'plate' && dir === 'in' && lt <= D) out.carry = { kind: 'plate', id: deliver.next.food, left: 1, dx: armX };
    if (dir === 'in' && Math.abs(lt - D) < 0.05 && hooks.onClink && !deliver[`c${i}`]) { deliver[`c${i}`] = 1; hooks.onClink(); }
    return out;
  }

  return {
    update, tableState,
    get busyDelivering() { return !!deliver; },
  };
}

/** Isi minuman di cangkir/yunomi (level 0..1), digambar di atas sprite cangkir. */
export function drawDrink(c, id, level, x, y, L, t) {
  const d = drinkOf(id);
  if (level <= 0.01) {
    if (d.vessel === 'cup') { c.fillStyle = `rgba(110,70,40,${0.25})`; c.beginPath(); c.ellipse(x, y - 58, 16, 3, 0, 0, TAU); c.fill(); }
    return;
  }
  const yunomi = d.vessel === 'yunomi';
  const rimY = yunomi ? y - 70 : y - 58; const rx = yunomi ? 26 : 32; const ry = yunomi ? 6 : 7;
  const depth = yunomi ? 30 : 26;
  c.save();
  c.beginPath(); c.ellipse(x, rimY, rx, ry, 0, 0, TAU); c.clip();
  const ly = rimY + (1 - level) * depth * 0.45; const k = 1 - (1 - level) * 0.28;
  const col = H(d.top);
  c.fillStyle = C(shade(L, d.top)); c.beginPath(); c.ellipse(x, ly + 1.5, rx * k, ry * k, 0, 0, TAU); c.fill();
  if (d.art && level > 0.6) { // latte art hati yang pelan-pelan memudar
    const a = (level - 0.6) / 0.4;
    c.fillStyle = `rgba(255,248,236,${0.85 * a})`;
    c.beginPath(); c.ellipse(x - 5, ly, 8 * k, 4 * k, -0.5, 0, TAU); c.ellipse(x + 5, ly, 8 * k, 4 * k, 0.5, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(x - 11 * k, ly + 1); c.lineTo(x + 11 * k, ly + 1); c.lineTo(x, ly + 6 * k); c.fill();
  } else { c.fillStyle = C(LI(col, 0.25), 0.4); c.beginPath(); c.ellipse(x - rx * 0.3, ly - 1, rx * 0.35 * k, 1.5, 0, 0, TAU); c.fill(); }
  c.restore();
}

/** Gigitan pada roti: potong sprite dengan lingkaran (aturan evenodd). */
export function biteClip(c, food, left, x, y) {
  const n = left >= 0.99 ? 0 : Math.min(4, Math.ceil((1 - left) * 4));
  if (!n) return false;
  const r = seeded({ croissant: 3, melonpan: 5, sando: 7 }[food] || 1);
  c.beginPath(); c.rect(x - 90, y - 90, 180, 120);
  const spots = [[44, -24], [-46, -20], [20, -40], [-14, -36]];
  for (let i = 0; i < n; i++) { const [sx, sy] = spots[i]; const rad = 16 + r() * 8; for (let k = 0; k < 3; k++) { c.moveTo(x + sx + k * 9 + rad, y + sy + k * 4); c.arc(x + sx + k * 9, y + sy + k * 4, rad * (0.8 + k * 0.1), 0, TAU); } }
  c.clip('evenodd');
  return true;
}
