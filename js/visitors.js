// Pengunjung Kafe: masuk lewat pintu (lonceng), antre & memesan di konter, mengambil minuman, duduk di
// meja bar atau berdua di meja bundar (minum & mengobrol), lalu pulang.
//
// Gaya: "wayang kertas" yang dilukis. Setiap tokoh terdiri dari potongan tubuh (kepala, badan, lengan atas,
// lengan bawah + tangan, paha, betis + sepatu) yang digambar dengan bentuk alami lalu dilukis ulang oleh
// paint.js — kuas yang sama dengan latar. Saat bergerak, potongan diputar pada sendinya (pinggul, lutut,
// bahu, siku); tangan meraih cangkir & mengangkatnya ke mulut lewat inverse kinematics dua tulang.
// Tokoh dibuat sekali (kumpulan kecil) lalu dipakai bergantian supaya HP tetap ringan.

import { TAU, H, C, DA, LI, M, shade, rimOf, WARM } from './paintkit.js';
import { STOOLS, STOOL_SEAT } from './cafe.js';
import { createPainter } from './paint.js';

const LANE = 794; // jalur jalan di depan bangku bar
const DOOR = { x: 1412, y: 652 };
const ORDER = { x: 292, y: 772 };
const PICKUP = { x: 196, y: 778 };
const QUEUE_X = 372;
export const CHAT = [{ x: 1096, y: 728, face: 1 }, { x: 1304, y: 728, face: -1 }];
const SPEED = 70;

// ukuran tubuh (satuan virtual, tinggi ±245 pada skala 1)
const THIGH = 62; const SHIN = 60; const UPPER = 44; const FORE = 46;
const SHOULDER_Y = -76; const NECK_Y = -84; // dari pinggul
const LEG_LEN = THIGH + SHIN + 3;
const RES = 1.5;
const CHAIR_FOOT = 61; // telapak kaki di lantai, diukur dari dudukan kursi (satuan tokoh) // resolusi potongan: piksel per satuan virtual

/** Skala menurut jarak: makin ke bawah (dekat kita) makin besar. */
export const depthScale = (y) => 0.8 + Math.max(0, Math.min(1, (y - 640) / 160)) * 0.28;
/** Berapa banyak pengunjung yang pas untuk waktu ini (dibatasi di HP). */
export function crowdTarget(time, phone = false) {
  const n = { morning: 3, day: 4, dusk: 4, night: 2 }[time] ?? 3;
  return phone ? Math.min(n, 3) : n;
}

const LOOKS = {
  skin: ['f2cfae', 'e6bb96', 'd3a27c', 'b8845d', '8f6142'],
  hair: ['231c18', '3a2a20', '5b3e2b', '17171b', '7a5236', 'a98258'],
  top: ['d8c6a6', '7c8e78', 'b46d58', '4f6476', 'e8dfd2', '8b7a9e', 'c8a26a', '5a696d', 'a3b5b8'],
  bottom: ['3a3f48', '5c5146', '2e3b4b', '7a6a58', '45403b', '8a8070'],
  coat: ['6c5a49', '3f4e5e', '7b4b3b', '56614f', '8b7d6a'],
  shoe: ['2a2622', '4a3a2c', 'e8e2d6', '6b4a32'],
};
const pickOf = (arr, r) => arr[Math.floor(r() * arr.length)];
export function makeLook(r, rainy) {
  return {
    skin: pickOf(LOOKS.skin, r), hair: pickOf(LOOKS.hair, r), top: pickOf(LOOKS.top, r), bottom: pickOf(LOOKS.bottom, r),
    shoe: pickOf(LOOKS.shoe, r), coat: rainy && r() < 0.75 ? pickOf(LOOKS.coat, r) : (r() < 0.25 ? pickOf(LOOKS.coat, r) : null),
    style: pickOf(['short', 'long', 'bun', 'bob', 'short'], r), bag: r() < 0.35, tall: 0.95 + r() * 0.1, slim: 0.92 + r() * 0.14,
    umbrella: rainy ? pickOf(['3d5a7a', '7a3d3d', '2f2f33', '4f6b4a'], r) : null,
  };
}

// ------------------------------------------------------------------ potongan tubuh (digambar sekali, dilukis)
function partCanvas(x0, y0, x1, y1, draw) {
  const pad = 5;
  const w = Math.ceil((x1 - x0 + pad * 2) * RES); const h = Math.ceil((y1 - y0 + pad * 2) * RES);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.setTransform(RES, 0, 0, RES, (pad - x0) * RES, (pad - y0) * RES);
  c.lineCap = 'round'; c.lineJoin = 'round';
  draw(c);
  return { cv, ox: x0 - pad, oy: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
const hex = (rgb) => rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Gradien kain: terang di sisi cahaya, gelap di sisi lain, sedikit lebih gelap ke bawah. */
function cloth(c, base, x0, x1, y0, y1, flip = false) {
  const g = c.createLinearGradient(flip ? x1 : x0, 0, flip ? x0 : x1, 0);
  g.addColorStop(0, C(LI(base, 0.14))); g.addColorStop(0.45, C(base)); g.addColorStop(1, C(DA(base, 0.3)));
  c.fillStyle = g; c.fill();
  const v = c.createLinearGradient(0, y0, 0, y1); v.addColorStop(0, 'rgba(255,255,255,0.05)'); v.addColorStop(1, 'rgba(0,0,0,0.14)');
  c.fillStyle = v; c.fill();
}
function rimStroke(c, rim, a) { if (!rim) return; c.strokeStyle = C(rim, a); c.lineWidth = 1.6; c.stroke(); }

function torsoPath(c, view, coat, slim) {
  const hem = coat ? 26 : 7; const k = slim;
  c.beginPath();
  if (view === 'side') {
    c.moveTo(-14 * k, hem);
    c.bezierCurveTo(-16 * k, -18, -15 * k, -40, -17 * k, -56); c.bezierCurveTo(-19 * k, -70, -12 * k, -80, -2, -82);
    c.lineTo(4, -82); c.bezierCurveTo(14 * k, -80, 18 * k, -71, 18 * k, -60); c.bezierCurveTo(18 * k, -47, 13 * k, -40, 13 * k, -29);
    c.bezierCurveTo(13 * k, -16, 16 * k, -6, 16 * k + (coat ? 3 : 0), hem); c.quadraticCurveTo(0, hem + 3, -14 * k, hem);
  } else {
    c.moveTo(-23 * k - (coat ? 3 : 0), hem);
    c.bezierCurveTo(-21 * k, -20, -19 * k, -31, -21 * k, -43); c.bezierCurveTo(-24 * k, -56, -31 * k, -63, -30 * k, -71);
    c.quadraticCurveTo(-27 * k, -80, -9, -81); c.lineTo(9, -81); c.quadraticCurveTo(27 * k, -80, 30 * k, -71);
    c.bezierCurveTo(31 * k, -63, 24 * k, -56, 21 * k, -43); c.bezierCurveTo(19 * k, -31, 21 * k, -20, 23 * k + (coat ? 3 : 0), hem);
    c.quadraticCurveTo(0, hem + 4, -23 * k - (coat ? 3 : 0), hem);
  }
  c.closePath();
}

function buildParts(look, L) {
  const P = {};
  const top = shade(L, look.coat || look.top); const under = shade(L, look.top);
  const skin = shade(L, look.skin); const hair = shade(L, look.hair);
  const pants = shade(L, look.bottom); const shoe = shade(L, look.shoe);
  // cahaya tepi dari jendela (siang) atau lampu (malam)
  const rimC = L.lampsOn ? WARM : M(H('dfe9f2'), H('fff4e0'), 0.3);
  const rimA = L.lampsOn ? 0.35 * rimOf(L) + 0.15 : 0.45 * (1 - L.dark);
  const sk = look.slim;

  // ---- badan (pinggul di 0,0; leher ke atas)
  ['front', 'back', 'side'].forEach((view) => {
    P[`torso_${view}`] = partCanvas(-36, -96, 36, 34, (c) => {
      // leher
      c.fillStyle = C(DA(skin, view === 'back' ? 0.18 : 0.08)); c.beginPath(); c.roundRect(view === 'side' ? -3 : -5.5, -94, view === 'side' ? 10 : 11, 16, 4); c.fill();
      torsoPath(c, view, !!look.coat, sk);
      cloth(c, top, -30, 30, -82, 30, view === 'back');
      rimStroke(c, rimC, rimA);
      c.save(); torsoPath(c, view, !!look.coat, sk); c.clip();
      c.strokeStyle = C(DA(top, 0.35), 0.55); c.lineWidth = 1.4;
      if (view === 'front') {
        if (look.coat) { // kerah & bukaan mantel, kemeja di dalam
          c.fillStyle = C(under); c.beginPath(); c.moveTo(-8, -81); c.lineTo(8, -81); c.lineTo(0, -58); c.fill();
          c.beginPath(); c.moveTo(-9, -81); c.lineTo(-2, -50); c.lineTo(1, 30); c.moveTo(9, -81); c.lineTo(2, -50); c.stroke();
          c.fillStyle = C(DA(top, 0.3)); [-34, -14, 6].forEach((y) => { c.beginPath(); c.arc(4, y, 1.4, 0, TAU); c.fill(); });
          c.beginPath(); c.moveTo(-17, 4); c.lineTo(-8, 4); c.moveTo(9, 4); c.lineTo(18, 4); c.stroke();
        } else {
          c.beginPath(); c.ellipse(0, -81, 8, 4, 0, 0, Math.PI); c.stroke();
          c.beginPath(); c.moveTo(-20, -2); c.quadraticCurveTo(0, 3, 20, -2); c.stroke();
        }
        c.beginPath(); c.moveTo(-18, -54); c.quadraticCurveTo(-12, -46, -15, -36); c.moveTo(18, -54); c.quadraticCurveTo(12, -46, 15, -36); c.stroke();
      } else if (view === 'back') {
        c.beginPath(); c.moveTo(0, -78); c.lineTo(0, look.coat ? 26 : 4); c.stroke();
        c.strokeStyle = C(LI(top, 0.15), 0.35); c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(-17, -64); c.quadraticCurveTo(-12, -54, -16, -44); c.moveTo(17, -64); c.quadraticCurveTo(12, -54, 16, -44); c.stroke();
        c.strokeStyle = C(DA(top, 0.35), 0.5); c.lineWidth = 1.4; c.beginPath(); c.moveTo(-14, -30); c.quadraticCurveTo(0, -24, 14, -30); c.stroke();
      } else {
        c.beginPath(); c.moveTo(4, -80); c.quadraticCurveTo(10, -76, 14, -66); c.stroke();
        c.beginPath(); c.moveTo(-6, -40); c.quadraticCurveTo(0, -30, -4, -14); c.stroke();
        if (look.coat) { c.beginPath(); c.moveTo(14, -60); c.lineTo(12, 28); c.stroke(); }
      }
      if (look.bag) { c.strokeStyle = C(shade(L, '6b4a32')); c.lineWidth = 3; c.beginPath(); c.moveTo(view === 'side' ? -6 : -20, -76); c.lineTo(view === 'side' ? 8 : 18, -6); c.stroke(); }
      c.restore();
    });
  });

  // ---- kepala (pangkal leher di 0,0); rambut panjang menjuntai ke bawah
  const hairDeep = DA(hair, 0.2); const hairHi = LI(hair, 0.22);
  const strands = (c, x0, x1, y0, y1, n, seed) => {
    let s = seed; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    c.lineWidth = 1; for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0); c.strokeStyle = C(r() < 0.5 ? hairHi : hairDeep, 0.5); c.beginPath(); c.moveTo(x, y0 + r() * 4); c.quadraticCurveTo(x + (r() - 0.5) * 6, (y0 + y1) / 2, x + (r() - 0.5) * 4, y1 - r() * 4); c.stroke(); }
  };
  ['front', 'back', 'side'].forEach((view) => {
    const long = look.style === 'long'; const bob = look.style === 'bob';
    P[`head_${view}`] = partCanvas(-22, -46, 22, long ? 44 : 6, (c) => {
      const sg = c.createRadialGradient(view === 'side' ? 4 : -4, -22, 2, 0, -17, 18);
      sg.addColorStop(0, C(LI(skin, 0.1))); sg.addColorStop(1, C(DA(skin, 0.16)));
      if (view === 'back') {
        if (long) { c.fillStyle = C(hairDeep); c.beginPath(); c.moveTo(-14, -18); c.bezierCurveTo(-18, 6, -14, 30, -6, 40); c.quadraticCurveTo(0, 43, 6, 40); c.bezierCurveTo(14, 30, 18, 6, 14, -18); c.fill(); strands(c, -12, 12, -10, 38, 14, 7); }
        c.fillStyle = C(skin); c.beginPath(); c.ellipse(-12.5, -15, 2.6, 4, 0, 0, TAU); c.ellipse(12.5, -15, 2.6, 4, 0, 0, TAU); c.fill();
        c.fillStyle = C(DA(skin, 0.12)); c.beginPath(); c.roundRect(-6, -8, 12, 9, 3); c.fill();
        const hg = c.createLinearGradient(0, -36, 0, -2); hg.addColorStop(0, C(hairHi)); hg.addColorStop(1, C(hairDeep));
        c.fillStyle = hg; c.beginPath(); c.moveTo(-12.8, -10); c.bezierCurveTo(-15, -26, -9, -36, 0, -36); c.bezierCurveTo(9, -36, 15, -26, 12.8, -10);
        c.quadraticCurveTo(bob ? 14 : 8, bob ? -2 : -5, 0, bob ? -1 : -6); c.quadraticCurveTo(bob ? -14 : -8, bob ? -2 : -5, -12.8, -10); c.fill();
        strands(c, -11, 11, -34, -8, 16, 3);
      } else if (view === 'front') {
        if (long) { c.fillStyle = C(hairDeep); c.beginPath(); c.moveTo(-13, -22); c.bezierCurveTo(-18, 0, -16, 26, -10, 34); c.lineTo(10, 34); c.bezierCurveTo(16, 26, 18, 0, 13, -22); c.fill(); }
        c.fillStyle = C(skin); c.beginPath(); c.ellipse(-12.6, -16, 2.6, 4, 0, 0, TAU); c.ellipse(12.6, -16, 2.6, 4, 0, 0, TAU); c.fill();
        c.fillStyle = sg; c.beginPath(); c.moveTo(0, -1); c.bezierCurveTo(8, -1, 12.3, -8, 12.3, -17); c.bezierCurveTo(12.3, -27, 7, -33, 0, -33); c.bezierCurveTo(-7, -33, -12.3, -27, -12.3, -17); c.bezierCurveTo(-12.3, -8, -8, -1, 0, -1); c.fill();
        // wajah lembut: mata kecil, pipi merona, bayangan hidung
        c.fillStyle = C(DA(hair, 0.1), 0.85); c.beginPath(); c.ellipse(-4.6, -16.5, 1.2, 1.6, 0, 0, TAU); c.ellipse(4.6, -16.5, 1.2, 1.6, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(220,120,110,0.22)'; c.beginPath(); c.ellipse(-7, -11.5, 2.8, 1.8, 0, 0, TAU); c.ellipse(7, -11.5, 2.8, 1.8, 0, 0, TAU); c.fill();
        c.strokeStyle = C(DA(skin, 0.3), 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(0.5, -14); c.lineTo(1.2, -10.5); c.stroke();
        c.beginPath(); c.moveTo(-2, -6.5); c.quadraticCurveTo(0, -5.6, 2, -6.5); c.stroke();
        const hg = c.createLinearGradient(-10, -36, 10, -14); hg.addColorStop(0, C(hairHi)); hg.addColorStop(1, C(hairDeep));
        c.fillStyle = hg; c.beginPath(); c.moveTo(-13.4, bob ? -6 : -14); c.bezierCurveTo(-15.5, -30, -8, -38, 0, -38); c.bezierCurveTo(8, -38, 15.5, -30, 13.4, bob ? -6 : -14);
        c.quadraticCurveTo(12, -25, 6, -26); c.quadraticCurveTo(0, -22, -6, -26.5); c.quadraticCurveTo(-11, -25, -13.4, bob ? -6 : -14); c.fill();
        strands(c, -11, 11, -36, -24, 12, 5);
      } else { // samping, menghadap kanan
        if (long) { c.fillStyle = C(hairDeep); c.beginPath(); c.moveTo(-4, -30); c.bezierCurveTo(-18, -20, -16, 20, -10, 36); c.lineTo(0, 36); c.bezierCurveTo(-4, 14, -2, -8, 2, -18); c.fill(); }
        c.fillStyle = sg; c.beginPath(); c.moveTo(-12, -12); c.bezierCurveTo(-14, -24, -9, -34, 1, -34); c.bezierCurveTo(9, -34, 13, -28, 13, -21);
        c.lineTo(15.6, -15); c.lineTo(13, -13.6); c.bezierCurveTo(13.6, -11.5, 13.2, -8.5, 11, -7.4); c.bezierCurveTo(10, -3, 6, -1, 2, -1); c.lineTo(-5, -1); c.bezierCurveTo(-9, -3, -11, -7, -12, -12); c.fill();
        c.fillStyle = C(DA(hair, 0.1), 0.85); c.beginPath(); c.ellipse(8.4, -18.5, 1.1, 1.5, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(220,120,110,0.22)'; c.beginPath(); c.ellipse(6, -12, 3, 2, 0, 0, TAU); c.fill();
        c.fillStyle = C(DA(skin, 0.1)); c.beginPath(); c.ellipse(-2.5, -16, 2.6, 4, 0.1, 0, TAU); c.fill();
        const hg = c.createLinearGradient(-12, -36, 10, -16); hg.addColorStop(0, C(hairHi)); hg.addColorStop(1, C(hairDeep));
        c.fillStyle = hg; c.beginPath(); c.moveTo(11, -26); c.bezierCurveTo(9, -37, -6, -40, -12, -30); c.bezierCurveTo(-16, -22, -14, bob ? -2 : -9, -10, bob ? -1 : -6);
        c.quadraticCurveTo(-6, -12, -6, -18); c.quadraticCurveTo(-1, -22, 2, -26); c.quadraticCurveTo(7, -24, 11, -26); c.fill();
        strands(c, -12, 9, -36, -14, 12, 9);
      }
      if (look.style === 'bun') { c.fillStyle = C(hair); c.beginPath(); c.arc(view === 'side' ? -9 : 0, view === 'front' ? -38 : -36, 7, 0, TAU); c.fill(); c.strokeStyle = C(hairHi, 0.5); c.lineWidth = 1; c.beginPath(); c.arc(view === 'side' ? -9 : 0, -37, 4, 0.5, 2.6); c.stroke(); }
      if (view !== 'front') { c.beginPath(); c.ellipse(view === 'side' ? -1 : 0, -18, view === 'side' ? 13 : 13.5, 18, 0, Math.PI * 1.1, Math.PI * 1.9); rimStroke(c, rimC, rimA * 0.9); }
    });
  });

  // ---- lengan: lengan atas (bahu di 0,0) & lengan bawah + tangan (siku di 0,0)
  P.upper = partCanvas(-10, -4, 10, UPPER + 4, (c) => {
    c.beginPath(); c.moveTo(-7.5, 0); c.quadraticCurveTo(-8.5, UPPER * 0.5, -6.5, UPPER + 2); c.quadraticCurveTo(0, UPPER + 5, 6.5, UPPER + 2); c.quadraticCurveTo(8.5, UPPER * 0.5, 7.5, 0); c.quadraticCurveTo(0, -5, -7.5, 0); c.closePath();
    cloth(c, top, -8, 8, 0, UPPER); rimStroke(c, rimC, rimA * 0.7);
    c.strokeStyle = C(DA(top, 0.35), 0.5); c.lineWidth = 1.2; c.beginPath(); c.moveTo(-4, UPPER - 6); c.quadraticCurveTo(0, UPPER - 3, 4, UPPER - 7); c.stroke();
  });
  P.fore = partCanvas(-9, -4, 9, FORE + 4, (c) => {
    c.beginPath(); c.moveTo(-6.5, 0); c.lineTo(-5.6, FORE - 15); c.lineTo(5.6, FORE - 15); c.lineTo(6.5, 0); c.quadraticCurveTo(0, -4, -6.5, 0); c.closePath();
    cloth(c, top, -7, 7, 0, FORE - 15);
    c.fillStyle = C(DA(top, 0.2)); c.beginPath(); c.roundRect(-6, FORE - 18, 12, 4, 2); c.fill();
    const hg = c.createLinearGradient(-5, 0, 5, 0); hg.addColorStop(0, C(LI(skin, 0.06))); hg.addColorStop(1, C(DA(skin, 0.18)));
    c.fillStyle = hg; c.beginPath(); c.moveTo(-3.6, FORE - 15); c.lineTo(3.6, FORE - 15); c.bezierCurveTo(5.8, FORE - 10, 5.4, FORE - 2, 2, FORE + 0.5); c.quadraticCurveTo(-2.5, FORE + 1.5, -4.4, FORE - 3); c.bezierCurveTo(-5.4, FORE - 7, -4.6, FORE - 12, -3.6, FORE - 15); c.fill();
    c.beginPath(); c.ellipse(4.6, FORE - 8, 2, 3.6, -0.4, 0, TAU); c.fill();
  });
  // ---- kaki: paha (pinggul di 0,0) & betis + sepatu (lutut di 0,0)
  P.thigh = partCanvas(-12, -4, 12, THIGH + 4, (c) => {
    c.beginPath(); c.moveTo(-11, 0); c.quadraticCurveTo(-11.5, THIGH * 0.5, -8.6, THIGH + 2); c.quadraticCurveTo(0, THIGH + 5, 8.6, THIGH + 2); c.quadraticCurveTo(10, THIGH * 0.5, 10.5, 0); c.quadraticCurveTo(0, -5, -11, 0); c.closePath();
    cloth(c, pants, -11, 11, 0, THIGH);
    c.strokeStyle = C(DA(pants, 0.3), 0.5); c.lineWidth = 1.1; c.beginPath(); c.moveTo(-5, THIGH - 10); c.quadraticCurveTo(0, THIGH - 6, 5, THIGH - 11); c.stroke();
  });
  const shinPants = (c) => {
    c.beginPath(); c.moveTo(-8.8, 0); c.quadraticCurveTo(-9.4, SHIN * 0.45, -6.6, SHIN - 6); c.lineTo(6.6, SHIN - 6); c.quadraticCurveTo(8.6, SHIN * 0.45, 8.8, 0); c.quadraticCurveTo(0, -4, -8.8, 0); c.closePath();
    cloth(c, pants, -9, 9, 0, SHIN);
  };
  P.shin_side = partCanvas(-12, -4, 28, SHIN + 8, (c) => {
    shinPants(c);
    const sg = c.createLinearGradient(0, SHIN - 8, 0, SHIN + 5); sg.addColorStop(0, C(LI(shoe, 0.15))); sg.addColorStop(1, C(DA(shoe, 0.25)));
    c.fillStyle = sg; c.beginPath(); c.moveTo(-7, SHIN - 7); c.lineTo(5, SHIN - 7); c.bezierCurveTo(14, SHIN - 5, 23, SHIN - 1, 22, SHIN + 3); c.lineTo(-7.5, SHIN + 3.5); c.quadraticCurveTo(-9, SHIN - 2, -7, SHIN - 7); c.fill();
    c.fillStyle = C(DA(shoe, 0.45)); c.fillRect(-7.5, SHIN + 2.4, 29.5, 1.8);
  });
  P.shin_front = partCanvas(-12, -4, 12, SHIN + 8, (c) => {
    shinPants(c);
    const sg = c.createLinearGradient(0, SHIN - 8, 0, SHIN + 5); sg.addColorStop(0, C(LI(shoe, 0.15))); sg.addColorStop(1, C(DA(shoe, 0.25)));
    c.fillStyle = sg; c.beginPath(); c.ellipse(0, SHIN - 1, 8.4, 5.4, 0, 0, TAU); c.fill();
  });
  // versi sisi jauh (sedikit lebih gelap) untuk lengan & kaki
  for (const k of ['upper', 'fore', 'thigh', 'shin_side', 'shin_front']) {
    const src = P[k]; const cv = document.createElement('canvas'); cv.width = src.cv.width; cv.height = src.cv.height;
    const x = cv.getContext('2d'); x.drawImage(src.cv, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(10,8,12,0.22)'; x.fillRect(0, 0, cv.width, cv.height);
    P[`${k}_far`] = { ...src, cv };
  }
  return P;
}

let charSeed = 1;
/** Tokoh siap pakai: potongan tubuh dilukis bertahap (step) lalu ready = true. */
export function createCharacter(look, L) {
  const parts = buildParts(look, L);
  const keys = Object.keys(parts);
  const painters = keys.map((k) => createPainter(parts[k].cv, { unit: RES, seed: (charSeed++ % 97) + 3, softEdge: 0.35, scale: 0.38, wobble: 0.5 }));
  const ch = {
    look, parts, ready: false,
    step(budget) {
      const t0 = performance.now();
      for (let i = 0; i < painters.length; i++) {
        const p = painters[i];
        if (p.done) continue;
        p.step(Math.max(0.5, budget - (performance.now() - t0)));
        if (p.done) parts[keys[i]] = { ...parts[keys[i]], cv: p.canvas };
        if (performance.now() - t0 > budget) break;
      }
      if (painters.every((p) => p.done)) ch.ready = true;
      return ch.ready;
    },
  };
  return ch;
}

// ------------------------------------------------------------------ menggerakkan & menggambar
/** Arah tulang → sudut putar (potongan menggantung ke +y). */
const angOf = (vx, vy) => Math.atan2(-vx, vy);
/** Inverse kinematics dua tulang: sudut lengan atas & bawah supaya tangan sampai di target (siku ke bawah). */
export function ik(sx, sy, tx, ty, a, b) {
  let dx = tx - sx; let dy = ty - sy; let d = Math.hypot(dx, dy) || 1;
  const max = (a + b) * 0.995; if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const al = Math.acos(cosA);
  const ux = dx / d; const uy = dy / d;
  const opts = [al, -al].map((s) => { const ex = sx + a * (ux * Math.cos(s) - uy * Math.sin(s)); const ey = sy + a * (ux * Math.sin(s) + uy * Math.cos(s)); return { ex, ey }; });
  const e = opts[0].ey >= opts[1].ey ? opts[0] : opts[1];
  return { u: angOf(e.ex - sx, e.ey - sy), f: angOf(sx + dx - e.ex, sy + dy - e.ey), ex: e.ex, ey: e.ey, hx: sx + dx, hy: sy + dy };
}

function put(c, part, x, y, rot) {
  c.save(); c.translate(x, y); if (rot) c.rotate(rot);
  c.drawImage(part.cv, part.ox, part.oy, part.w, part.h);
  c.restore();
}
function leg(c, P, x, y, hip, knee, far, view) {
  const t = P[far ? 'thigh_far' : 'thigh']; const s = P[`${view === 'side' ? 'shin_side' : 'shin_front'}${far ? '_far' : ''}`];
  put(c, t, x, y, hip);
  const kx = x - Math.sin(hip) * THIGH; const ky = y + Math.cos(hip) * THIGH;
  put(c, s, kx, ky, hip + knee);
}
function armFK(c, P, x, y, u, f, far) {
  put(c, P[far ? 'upper_far' : 'upper'], x, y, u);
  const ex = x - Math.sin(u) * UPPER; const ey = y + Math.cos(u) * UPPER;
  put(c, P[far ? 'fore_far' : 'fore'], ex, ey, f);
  return { hx: ex - Math.sin(f) * (FORE - 4), hy: ey + Math.cos(f) * (FORE - 4) };
}
function cupAt(c, x, y, L) {
  const cer = shade(L, 'f1ece4');
  c.fillStyle = C(cer); c.beginPath(); c.moveTo(x - 6, y - 9); c.lineTo(x + 6, y - 9); c.lineTo(x + 5, y + 2); c.lineTo(x - 5, y + 2); c.fill();
  c.fillStyle = C(DA(cer, 0.35)); c.beginPath(); c.ellipse(x, y - 9, 6, 1.8, 0, 0, TAU); c.fill();
}

/**
 * Gambar satu pengunjung. p: { x, y, s, face, pose, ph, ch, drink, talk, cupInHand, alpha }
 * Titik (x, y) = telapak kaki (berdiri/berjalan) atau dudukan (duduk).
 */
export function drawPerson(c, p, L, t) {
  const P = p.ch.parts; const lk = p.ch.look;
  const sc = p.s * lk.tall;
  c.save();
  c.globalAlpha = p.alpha ?? 1;
  c.translate(p.x, p.y);
  if (p.pose !== 'sitBack') { c.fillStyle = 'rgba(30,20,10,0.2)'; c.beginPath(); c.ellipse(0, p.pose === 'sitSide' ? 50 * sc : 1, 24 * sc, 5.5 * sc, 0, 0, TAU); c.fill(); }
  c.scale(sc, sc);
  // berbalik kiri↔kanan: sesaat menghadap depan, jadi tidak "membalik" mendadak
  const face = p.turnT > 0 && p.turnVia ? p.turnVia : p.face;
  const side = face === 'left' || face === 'right';
  if (face === 'left') c.scale(-1, 1);
  const view = side ? 'side' : face === 'back' ? 'back' : 'front';
  const walking = p.pose === 'walk'; const ph = p.ph || 0;
  const breathe = Math.sin(t * 1.6 + (p.id || 0)) * 0.5;
  const drinkA = p.drink || 0; const talk = p.talk || 0;
  const torso = P[`torso_${view}`]; const head = P[`head_${view}`];
  const headTilt = talk * Math.sin(t * 3.1) * 0.05 - (p.pose === 'sitBack' ? drinkA * 0.12 : p.pose === 'sitSide' ? drinkA * 0.16 : 0) + (p.look2 || 0);
  const idle = p.pose === 'stand' ? Math.sin(t * 0.8 + (p.id || 0) * 1.7) : 0; // berat badan berpindah pelan
  const drawHead = (hx, hy) => put(c, head, hx, hy, headTilt);

  if (p.pose === 'walk' || p.pose === 'stand') {
    const sp = p.spd ?? 1;
    const bob = walking ? (-Math.abs(Math.cos(ph)) * 2.8 + 1.4) * sp : breathe * 0.3;
    const hipY = -LEG_LEN + bob;
    c.translate(idle * 1.2, 0);
    if (side) {
      // langkah: paha berayun, lutut menekuk saat kaki diayun ke depan, sedikit menekuk saat menapak
      const amp = 0.44 * sp;
      const hA = walking ? amp * Math.sin(ph) : 0; const hB = -hA;
      const kA = walking ? 0.1 * sp + 0.75 * sp * Math.max(0, -Math.cos(ph)) ** 1.4 : 0.04; const kB = walking ? 0.1 * sp + 0.75 * sp * Math.max(0, Math.cos(ph)) ** 1.4 : 0.04;
      const lean = walking ? -0.05 * sp : 0;
      // lengan jauh, kaki jauh, badan, kaki dekat, kepala, lengan dekat
      // siku lebih menekuk saat tangan berayun ke depan
      const elb = (a) => a - 0.18 - 0.35 * Math.max(0, -a) * 2;
      const shX = -Math.sin(lean) * -SHOULDER_Y;
      armFK(c, P, shX - 1, hipY + SHOULDER_Y, -hB * 0.85, elb(-hB * 0.85), true);
      leg(c, P, 0, hipY, hB, kB, true, 'side');
      put(c, torso, 0, hipY, lean);
      leg(c, P, 1, hipY, hA, kA, false, 'side');
      drawHead(shX + 1, hipY + NECK_Y);
      if (p.cupInHand) { const k = ik(1, hipY + SHOULDER_Y, 30, hipY - 22, UPPER, FORE - 4); const hd = armFK(c, P, 1, hipY + SHOULDER_Y, k.u, k.f, false); cupAt(c, hd.hx + 2, hd.hy, L); }
      else armFK(c, P, shX + 1, hipY + SHOULDER_Y, -hA * 0.85, elb(-hA * 0.85), false);
      if (lk.umbrella && walking) { c.strokeStyle = C(shade(L, '2a2622')); c.lineWidth = 2; c.beginPath(); c.moveTo(-4, hipY + SHOULDER_Y + 50); c.lineTo(-10, hipY + 34); c.stroke(); c.fillStyle = C(shade(L, lk.umbrella)); c.beginPath(); c.moveTo(-7, hipY + SHOULDER_Y + 54); c.quadraticCurveTo(-3, hipY + 10, -9, hipY + 30); c.quadraticCurveTo(-14, hipY + 12, -7, hipY + SHOULDER_Y + 54); c.fill(); }
    } else {
      const lift = (k) => (walking ? Math.max(0, Math.sin(ph + k * Math.PI)) : 0);
      const legF = (x, k) => { c.save(); c.translate(x, hipY); c.scale(1, 1 - lift(k) * 0.1); leg(c, P, 0, 0, 0, 0, false, 'front'); c.restore(); };
      const sw = walking ? Math.sin(ph) * 0.14 : 0;
      if (view === 'back') {
        legF(-10 * lk.slim, 0); legF(10 * lk.slim, 1);
        put(c, torso, 0, hipY);
        armFK(c, P, -24 * lk.slim, hipY + SHOULDER_Y + 4, 0.1 + sw, 0.12 + sw, false);
        drawHead(0, hipY + NECK_Y);
        if (p.point > 0.01) { // menunjuk papan menu saat memesan
          const k = ik(24 * lk.slim, hipY + SHOULDER_Y + 4, 24 + 22 * p.point, hipY + SHOULDER_Y + 40 - 90 * p.point, UPPER, FORE - 4);
          armFK(c, P, 24 * lk.slim, hipY + SHOULDER_Y + 4, k.u, k.f, false);
        } else armFK(c, P, 24 * lk.slim, hipY + SHOULDER_Y + 4, -0.1 - sw, -0.12 - sw, false);
      } else {
        legF(-10 * lk.slim, 0); legF(10 * lk.slim, 1);
        put(c, torso, 0, hipY);
        drawHead(0, hipY + NECK_Y);
        armFK(c, P, -24 * lk.slim, hipY + SHOULDER_Y + 4, 0.1 - sw, 0.06 - sw, false);
        if (p.cupInHand) { const hd = armFK(c, P, 24 * lk.slim, hipY + SHOULDER_Y + 4, -0.05, 1.2, false); cupAt(c, hd.hx, hd.hy - 2, L); }
        else armFK(c, P, 24 * lk.slim, hipY + SHOULDER_Y + 4, -0.1 + sw, -0.06 + sw, false);
      }
    }
  } else if (p.pose === 'sitBack') { // duduk di bangku bar, membelakangi kita
    const k = p.sitK ?? 1; const e = k * k * (3 - 2 * k);
    const sy = breathe * 0.4 - (1 - e) * 30; // naik ke bangku lalu turun perlahan ke dudukan
    if (e < 0.55) { // masih berdiri di depan bangku
      leg(c, P, -10 * lk.slim, sy, 0, 0, true, 'front'); leg(c, P, 10 * lk.slim, sy, 0, 0.0, false, 'front');
    } else { // betis menggantung ke pijakan bangku (paha ke depan, tertutup badan)
      put(c, P.shin_front_far, -11 * lk.slim, -6, 0.1); put(c, P.shin_front, 11 * lk.slim, -6, -0.1);
    }
    // dari belakang, tangan yang bertumpu di meja bar tertutup punggung: lengan digambar di belakang badan
    const shL = { x: -22 * lk.slim, y: SHOULDER_Y + 4 + sy }; const shR = { x: 22 * lk.slim, y: SHOULDER_Y + 4 + sy };
    const kl = ik(shL.x, shL.y, -6, -44 + sy, UPPER, FORE - 4); armFK(c, P, shL.x, shL.y, kl.u, kl.f, true);
    const rest = { x: 8, y: -44 + sy }; const mouth = { x: 4, y: NECK_Y - 14 + sy };
    const tx = rest.x + (mouth.x - rest.x) * drinkA; const ty = rest.y + (mouth.y - rest.y) * drinkA;
    const kr = ik(shR.x, shR.y, tx, ty, UPPER, FORE - 4);
    if (drinkA <= 0.05) armFK(c, P, shR.x, shR.y, kr.u, kr.f, true);
    put(c, torso, 0, sy);
    drawHead(0, NECK_Y + sy);
    if (drinkA > 0.05) armFK(c, P, shR.x, shR.y, kr.u, kr.f, false); // siku terangkat saat minum
  } else if (p.pose === 'sitSide') { // duduk di kursi menghadap meja (kanan)
    // duduk/berdiri: pinggul turun-naik dan mundur sedikit, lutut menekuk, telapak kaki tetap di lantai
    const k = p.sitK ?? 1; const e = k * k * (3 - 2 * k);
    const hipA = -(Math.PI / 2 - 0.03) * e; const kneeA = (Math.PI / 2 - 0.1) * e; // betis tegak, telapak di lantai
    const footX = 30 + 36 * e; const FOOT_Y = CHAIR_FOOT;
    const relX = -THIGH * Math.sin(hipA) - SHIN * Math.sin(hipA + kneeA); const relY = THIGH * Math.cos(hipA) + SHIN * Math.cos(hipA + kneeA);
    const hx = footX - relX; const hy = FOOT_Y - relY; // pinggul dihitung dari telapak kaki yang menapak
    const lean = (1 - e) * e * 4 * 0.28; // condong ke depan di tengah gerakan duduk
    const sy = hy + breathe * 0.4 * e;
    c.translate(hx, 0);
    leg(c, P, -4, hy, hipA + 0.04 * e, kneeA - 0.06 * e, true, 'side');
    put(c, torso, 0, sy, 0.04 * e + lean);
    leg(c, P, 2, hy, hipA, kneeA, false, 'side');
    const lx = -Math.sin(0.04 * e + lean) * -SHOULDER_Y;
    drawHead(2 + lx, NECK_Y + sy);
    // tangan di atas meja; saat minum cangkir naik ke mulut; saat bicara tangan sedikit bergerak
    const table = { x: 58 + talk * Math.sin(t * 4.2) * 6, y: -38 - talk * Math.max(0, Math.sin(t * 4.2)) * 10 };
    const mouth = { x: 16, y: NECK_Y - 9 };
    const tx = table.x + (mouth.x - table.x) * drinkA; const ty = table.y + (mouth.y - table.y) * drinkA;
    if (e > 0.85) {
      const ki = ik(2 + lx, SHOULDER_Y + 4 + sy, tx, ty, UPPER, FORE - 4);
      const hd = armFK(c, P, 2 + lx, SHOULDER_Y + 4 + sy, ki.u, ki.f, false);
      cupAt(c, hd.hx + 5, hd.hy + (drinkA > 0.1 ? -1 : 1), L);
    } else { const hd = armFK(c, P, 2 + lx, SHOULDER_Y + 4 + sy, -0.3, -0.9, false); if (p.cupInHand !== false) cupAt(c, hd.hx + 3, hd.hy - 2, L); }
  }
  c.restore();
  // gelembung obrolan kecil (tidak ikut dicerminkan)
  if (talk > 0.5) {
    const a = Math.max(0, Math.sin(t * 1.3)) * 0.6;
    if (a > 0.05) {
      const bx = p.x + (p.face === 'left' ? -18 : 18) * sc; const by = p.y + (NECK_Y - 52) * sc;
      c.fillStyle = `rgba(255,252,245,${a})`; c.beginPath(); c.roundRect(bx - 13 * sc, by - 8 * sc, 26 * sc, 15 * sc, 7 * sc); c.fill();
      c.fillStyle = `rgba(90,78,66,${a})`; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(bx + i * 6 * sc, by, 1.6 * sc, 0, TAU); c.fill(); }
    }
  }
}

// ------------------------------------------------------------------ keramaian
/**
 * Pengatur pengunjung. step(dt, {time, weather, phone, L}) memajukan semuanya; people() untuk digambar.
 * hooks.onBell() saat pintu dibuka. makeChar(look, L) membuat tokoh (bisa diganti saat pengujian).
 */
export function createCrowd(hooks = {}, rnd = Math.random, makeChar = createCharacter) {
  const people = [];
  let nextSpawn = 2; let seeded = false; let id = 0; let clock = 0;
  let pool = []; let poolKey = '';
  const seatTaken = (kind, i) => people.some((p) => p.seat && p.seat.kind === kind && p.seat.i === i);
  const freeStools = () => STOOLS.map((_, i) => i).filter((i) => !seatTaken('stool', i));
  const chatFree = () => !seatTaken('chat', 0) && !seatTaken('chat', 1);
  const seatPos = (seat) => (seat.kind === 'stool' ? { x: STOOLS[seat.i], y: STOOL_SEAT + 2 } : { x: CHAT[seat.i].x, y: CHAT[seat.i].y });

  /** Kumpulan tokoh untuk suasana ini (cahaya & cuaca); dilukis bertahap di sela animasi. */
  function preparePool(ctx, budget) {
    const rainy = ctx.weather === 'rain' || ctx.weather === 'storm' || ctx.weather === 'snow';
    const key = `${ctx.time}|${rainy}`;
    const size = ctx.phone ? 5 : 7;
    if (key !== poolKey) { poolKey = key; pool = pool.filter((ch) => people.some((p) => p.ch === ch)); pool.forEach((ch) => { ch.stale = true; }); }
    while (pool.filter((ch) => !ch.stale).length < size) pool.push(makeChar(makeLook(rnd, rainy), ctx.L));
    const t0 = performance.now();
    for (const ch of pool) { if (!ch.ready) { ch.step(Math.max(0.5, budget - (performance.now() - t0))); if (performance.now() - t0 > budget) break; } }
  }
  const freeChar = () => { const xs = pool.filter((ch) => ch.ready && !ch.stale && !people.some((p) => p.ch === ch)); return xs.length ? xs[Math.floor(rnd() * xs.length)] : null; };

  function make(ch, seat, { sitting = false } = {}) {
    const p = { id: ++id, ch, seat, pair: null, path: [], state: 'enter', t: 0, x: DOOR.x, y: DOOR.y, face: 'front', pose: 'walk', ph: rnd() * 6, alpha: 0, drink: 0, talk: 0, cupInHand: false, stay: 60 + rnd() * 100, nextSip: 5 + rnd() * 8 };
    if (sitting) {
      const sp = seatPos(seat);
      Object.assign(p, { state: 'sit', x: sp.x, y: sp.y, alpha: 0.01, fadeIn: true, t: rnd() * 40 });
      p.pose = seat.kind === 'stool' ? 'sitBack' : 'sitSide'; p.face = seat.kind === 'stool' ? 'back' : (CHAT[seat.i].face > 0 ? 'right' : 'left');
    } else p.path = [{ x: DOOR.x, y: LANE }];
    people.push(p);
    return p;
  }
  function spawn(ctx) {
    const target = crowdTarget(ctx.time, ctx.phone);
    if (people.length >= target) return;
    if (chatFree() && rnd() < 0.4 && people.length + 2 <= target + 1) {
      const c1 = freeChar(); if (!c1) return; const a = make(c1, { kind: 'chat', i: 0 });
      const c2 = freeChar(); if (!c2) { people.splice(people.indexOf(a), 1); return; }
      const b = make(c2, { kind: 'chat', i: 1 }); a.pair = b.id; b.pair = a.id; b.delay = 1.4;
      if (hooks.onBell) hooks.onBell();
      return;
    }
    const fs = freeStools(); const ch = freeChar();
    if (!fs.length || !ch) return;
    make(ch, { kind: 'stool', i: fs[Math.floor(rnd() * fs.length)] });
    if (hooks.onBell) hooks.onBell();
  }
  /** Saat Lobby dibuka: kafe sudah berisi beberapa orang yang sedang duduk (muncul perlahan). */
  function seed(ctx) {
    const n = Math.max(0, crowdTarget(ctx.time, ctx.phone) - 1);
    if (pool.filter((ch) => ch.ready).length < n + 1) return;
    seeded = true;
    if (n >= 3 && chatFree() && rnd() < 0.6) { const a = make(freeChar(), { kind: 'chat', i: 0 }, { sitting: true }); const b = make(freeChar(), { kind: 'chat', i: 1 }, { sitting: true }); a.pair = b.id; b.pair = a.id; b.stay = a.stay; }
    while (people.length < n) { const fs = freeStools(); const ch = freeChar(); if (!fs.length || !ch) break; make(ch, { kind: 'stool', i: fs[Math.floor(rnd() * fs.length)] }, { sitting: true }); }
  }

  const seated = (p) => p.state === 'sit' || p.state === 'sitDown' || p.state === 'standUp';
  const seatScale = (p) => depthScale(p.seat.kind === 'stool' ? 748 : 790) * p.ch.look.tall;
  /** Jalan menyusuri titik-titik path; true kalau sudah sampai. */
  function walk(p, dt) {
    if (!p.path.length) return true;
    const tg = p.path[0]; const dx = tg.x - p.x; const dy = tg.y - p.y; const d = Math.hypot(dx, dy);
    // mulai melangkah pelan, lalu melambat menjelang titik terakhir
    const last = p.path.length === 1;
    const want = last ? Math.min(1, 0.3 + d / 70) : 1;
    p.spd = (p.spd ?? 0) + (want - (p.spd ?? 0)) * Math.min(1, dt * 3.2);
    const v = SPEED * depthScale(p.y) * dt * Math.max(0.15, p.spd);
    p.pose = 'walk'; p.ph += dt * 6.4 * Math.max(0.35, p.spd);
    const nf = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy > 0 ? 'front' : 'back');
    if (nf !== p.face && d > 1) {
      if ((nf === 'left' && p.face === 'right') || (nf === 'right' && p.face === 'left')) { p.turnT = 0.22; p.turnVia = 'front'; }
      p.face = nf;
    }
    if (d <= v) { p.x = tg.x; p.y = tg.y; p.path.shift(); if (!p.path.length) p.spd = 0; return !p.path.length; }
    p.x += (dx / d) * v; p.y += (dy / d) * v;
    return false;
  }
  const orderBusy = (me) => people.some((q) => q !== me && (q.state === 'order' || q.state === 'toOrder'));

  function step(dt, ctx) {
    preparePool(ctx, ctx.budget ?? 3);
    if (!seeded) seed(ctx);
    clock += dt;
    nextSpawn -= dt;
    if (nextSpawn <= 0 && seeded) { spawn(ctx); nextSpawn = 9 + rnd() * 16; }
    for (const p of [...people]) {
      p.t += dt;
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.turnT > 0) p.turnT -= dt;
      if (p.fadeIn) { p.alpha = Math.min(1, p.alpha + dt * 1.2); if (p.alpha >= 1) p.fadeIn = false; }
      switch (p.state) {
        case 'enter':
          p.alpha = Math.min(1, p.alpha + dt * 2);
          if (walk(p, dt)) { p.state = 'toQueue'; p.path = [{ x: QUEUE_X + (p.pair && p.seat.i === 1 ? 46 : 0), y: LANE }]; }
          break;
        case 'toQueue':
          if (walk(p, dt)) { p.pose = 'stand'; p.face = 'left'; p.state = 'queue'; }
          break;
        case 'queue':
          if (!orderBusy(p)) { p.state = 'toOrder'; p.path = [{ x: ORDER.x, y: ORDER.y }]; }
          break;
        case 'toOrder':
          if (walk(p, dt)) { p.state = 'order'; p.t = 0; p.pose = 'stand'; p.face = 'back'; p.wait = 3.5 + rnd() * 2.5; }
          break;
        case 'order': {
          const q = (p.t - 1) / 1.8; p.point = q > 0 && q < 1 ? Math.sin(q * Math.PI) ** 2 : 0; // menunjuk papan menu
          if (p.t > p.wait) { p.point = 0; p.state = 'toPickup'; p.path = [{ x: PICKUP.x, y: PICKUP.y }]; }
          break;
        }
        case 'toPickup':
          if (walk(p, dt)) { p.state = 'pickup'; p.t = 0; p.pose = 'stand'; p.face = 'back'; p.wait = 3 + rnd() * 3; }
          break;
        case 'pickup':
          if (p.t > p.wait) {
            p.cupInHand = true; const sp = seatPos(p.seat); p.state = 'toSeat';
            // berhenti tepat di titik awal gerakan duduk (kaki menapak di depan bangku / di samping kursi)
            const sc = seatScale(p);
            const end = p.seat.kind === 'stool' ? { x: sp.x, y: sp.y + 96 * sc } : { x: sp.x + CHAT[p.seat.i].face * 30 * sc, y: sp.y + CHAIR_FOOT * sc };
            p.path = [{ x: PICKUP.x + 60, y: LANE }, { x: end.x, y: LANE }, end];
          }
          break;
        case 'toSeat':
          if (walk(p, dt)) {
            const sp = seatPos(p.seat); p.x = sp.x; p.y = sp.y; p.state = 'sitDown'; p.t = 0; p.sitK = 0;
            p.pose = p.seat.kind === 'stool' ? 'sitBack' : 'sitSide'; p.face = p.seat.kind === 'stool' ? 'back' : (CHAT[p.seat.i].face > 0 ? 'right' : 'left');
          }
          break;
        case 'sitDown': // pinggul turun perlahan ke dudukan
          p.sitK = Math.min(1, p.t / 1.1);
          if (p.sitK >= 1) { p.state = 'sit'; p.t = 0; p.cupInHand = false; }
          break;
        case 'standUp': { // berdiri lagi, lalu berjalan ke pintu
          p.sitK = Math.max(0, 1 - p.t / 0.9);
          if (p.sitK <= 0) {
            const sp = seatPos(p.seat); const sc = seatScale(p);
            const start = p.seat.kind === 'stool' ? { x: sp.x, y: sp.y + 96 * sc } : { x: sp.x + CHAT[p.seat.i].face * 30 * sc, y: sp.y + CHAIR_FOOT * sc };
            Object.assign(p, start, { state: 'leave', pose: 'stand', path: [{ x: start.x, y: LANE }, { x: DOOR.x, y: LANE }, { x: DOOR.x, y: DOOR.y }] });
          }
          break;
        }
        case 'sit': {
          // minum sesekali (cangkir naik ke mulut lalu turun); berdua: bergantian bicara
          p.nextSip -= dt;
          if (p.nextSip <= 0 && !p.sipT) { p.sipT = 3.2; p.nextSip = 9 + rnd() * 10; }
          if (p.sipT > 0) { p.sipT -= dt; const q = 1 - p.sipT / 3.2; p.drink = q < 0.3 ? q / 0.3 : q > 0.7 ? (1 - q) / 0.3 : 1; p.drink = p.drink * p.drink * (3 - 2 * p.drink); if (p.sipT <= 0) { p.sipT = 0; p.drink = 0; } }
          const mate = p.pair ? people.find((q) => q.id === p.pair) : null;
          if (mate && mate.state === 'sit') { const turn = Math.floor(clock / 4.5) % 2 === p.seat.i; p.talk += ((turn && !p.sipT ? 1 : 0.12) - p.talk) * Math.min(1, dt * 3); } else p.talk += (0 - p.talk) * Math.min(1, dt * 3);
          const leader = !mate || p.seat.i === 0;
          if (leader && p.t > p.stay && !p.sipT) {
            [p, mate].filter(Boolean).forEach((q, k) => { q.state = 'standUp'; q.t = -k * 0.9; q.talk = 0; q.drink = 0; });
          }
          break;
        }
        case 'leave':
          if (walk(p, dt)) p.state = 'exit';
          else if (Math.hypot(p.x - DOOR.x, p.y - DOOR.y) < 40) p.alpha = Math.max(0, p.alpha - dt * 2.5);
          break;
        case 'exit':
          p.alpha -= dt * 3;
          if (p.alpha <= 0) people.splice(people.indexOf(p), 1);
          break;
        default: break;
      }
      p.s = seated(p) ? depthScale(p.seat.kind === 'stool' ? 748 : 794) : depthScale(p.y);
    }
    pool = pool.filter((ch) => !ch.stale || people.some((p) => p.ch === ch));
  }
  const sortY = (p) => (seated(p) ? (p.seat.kind === 'stool' ? 748 : 790) : p.y);
  const sorted = () => [...people].filter((p) => !(p.delay > 0)).sort((a, b) => sortY(a) - sortY(b));
  return { step, people: sorted, get count() { return people.length; }, seat: seatPos, get poolReady() { return pool.filter((ch) => ch.ready).length; } };
}

/**
 * Sama dengan drawPerson, tapi orang yang sedang duduk/berdiri diam digambar ke kanvas kecil yang
 * diperbarui 8×/detik (cukup untuk napas, minum & bicara) — menghemat banyak kerja di HP.
 * Orang yang berjalan, duduk/berdiri, atau sedang muncul/menghilang tetap digambar tiap frame.
 */
const BOX = { x: 110, y: 350, w: 220, h: 440 };
export function drawPersonFast(c, p, L, t) {
  const live = p.pose === 'walk' || p.state === 'sitDown' || p.state === 'standUp' || (p.turnT > 0);
  if (live) { drawPerson(c, p, L, t); return; }
  const dev = Math.abs(c.getTransform().a) || 1;
  const key = `${p.pose}|${p.face}|${dev.toFixed(3)}|${(p.s || 1).toFixed(3)}`;
  let k = p._cache;
  if (!k || k.key !== key || t - k.t > 0.125 || t < k.t) {
    if (!k || k.key !== key) {
      const cv = (k && k.cv) || document.createElement('canvas');
      cv.width = Math.ceil(BOX.w * dev); cv.height = Math.ceil(BOX.h * dev);
      k = p._cache = { cv, key, t: -1 };
    }
    const x = k.cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, k.cv.width, k.cv.height);
    x.setTransform(dev, 0, 0, dev, BOX.x * dev, BOX.y * dev);
    drawPerson(x, { ...p, x: 0, y: 0, alpha: 1 }, L, t);
    k.t = t;
  }
  const a = c.globalAlpha; c.globalAlpha = a * (p.alpha ?? 1);
  c.drawImage(k.cv, p.x - BOX.x, p.y - BOX.y, BOX.w, BOX.h);
  c.globalAlpha = a;
}
