// Pengunjung Kafe: masuk lewat pintu (lonceng), antre & memesan di konter, mengambil minuman, duduk di
// meja bar atau berdua di meja bundar (minum & mengobrol), lalu pulang.
//
// Gaya: "wayang kertas" yang dilukis. Setiap tokoh terdiri dari potongan tubuh (kepala, badan, lengan atas,
// lengan bawah + tangan, paha, betis + sepatu) yang digambar dengan bentuk alami lalu dilukis ulang oleh
// paint.js — kuas yang sama dengan latar. Saat bergerak, potongan diputar pada sendinya (pinggul, lutut,
// bahu, siku); tangan meraih cangkir & mengangkatnya ke mulut lewat inverse kinematics dua tulang.
// Tokoh dibuat sekali (kumpulan kecil) lalu dipakai bergantian supaya HP tetap ringan.

import { TAU, H, C, DA, LI, M, shade, rimOf, WARM } from './paintkit.js';
import { STOOLS, STOOL_SEAT, STOOL_FOOT, COUNTER_Y } from './cafe.js';
import { createPainter } from './paint.js';

const LANE = 794; // jalur jalan di depan bangku bar
const DOOR = { x: 1412, y: 652 };
const ORDER = { x: 292, y: 772 };
const PICKUP = { x: 196, y: 778 };
const QUEUE_X = 372;
export const CHAT = [{ x: 1096, y: 728, face: 1 }, { x: 1304, y: 728, face: -1 }];
const SPEED = 78;

// ukuran tubuh (satuan virtual, tinggi ±245 pada skala 1)
const THIGH = 62; const SHIN = 60; const UPPER = 44; const FORE = 46;
const SHOULDER_Y = -76; const NECK_Y = -84; // dari pinggul
const LEG_LEN = THIGH + SHIN + 3;
const RES = 1.5;
const CHAIR_FOOT = 61; // telapak kaki di lantai, diukur dari dudukan kursi (satuan tokoh)

/** Ukuran orang terhadap ruangan: tinggi ±1,65 m dibanding konter ±1 m, bangku bar & pintu. */
export const PERSON_K = 1.16;
/** Skala menurut jarak: makin ke bawah (dekat kita) makin besar. */
export const depthScale = (y) => (0.8 + Math.max(0, Math.min(1, (y - 640) / 160)) * 0.28) * PERSON_K;
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
/** Gradien kain: bulat seperti silinder (kedua tepi lebih gelap) + cahaya dari atas — tidak berubah saat dicerminkan. */
function cloth(c, base, x0, x1, y0, y1) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, C(DA(base, 0.26))); g.addColorStop(0.38, C(LI(base, 0.08))); g.addColorStop(0.62, C(base)); g.addColorStop(1, C(DA(base, 0.3)));
  c.fillStyle = g; c.fill();
  const v = c.createLinearGradient(0, y0, 0, y1); v.addColorStop(0, 'rgba(255,250,240,0.07)'); v.addColorStop(1, 'rgba(0,0,0,0.16)');
  c.fillStyle = v; c.fill();
}
function rimStroke(c, rim, a) { if (!rim || a < 0.02) return; c.strokeStyle = C(rim, a); c.lineWidth = 1.1; c.stroke(); }

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
  const rimA = (L.lampsOn ? 0.3 * rimOf(L) + 0.08 : 0.22 * (1 - L.dark)) * 0.6; // tipis: cukup memisahkan dari latar, tanpa "lingkaran putih"
  const sk = look.slim;

  // ---- badan (pinggul di 0,0; leher ke atas)
  ['front', 'back', 'side'].forEach((view) => {
    P[`torso_${view}`] = partCanvas(-36, -96, 36, 34, (c) => {
      // leher
      c.fillStyle = C(DA(skin, view === 'back' ? 0.18 : 0.08)); c.beginPath(); c.roundRect(view === 'side' ? -3 : -5.5, -94, view === 'side' ? 10 : 11, 16, 4); c.fill();
      torsoPath(c, view, !!look.coat, sk);
      cloth(c, top, -30 * sk, 30 * sk, -82, 30);
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
      if (look.apron) { // celemek barista
        const ap = shade(L, look.apron);
        if (view === 'front') {
          c.beginPath(); c.moveTo(-13 * sk, -62); c.lineTo(13 * sk, -62); c.quadraticCurveTo(15 * sk, -30, 21 * sk, 34); c.lineTo(-21 * sk, 34); c.quadraticCurveTo(-15 * sk, -30, -13 * sk, -62); c.closePath();
          cloth(c, ap, -21 * sk, 21 * sk, -62, 34);
          c.strokeStyle = C(ap); c.lineWidth = 2.4; c.beginPath(); c.moveTo(-11 * sk, -62); c.lineTo(-7, -81); c.moveTo(11 * sk, -62); c.lineTo(7, -81); c.stroke();
          c.strokeStyle = C(DA(ap, 0.3), 0.7); c.lineWidth = 1.1; c.beginPath(); c.roundRect(-9, -24, 18, 11, 2); c.moveTo(0, -24); c.lineTo(0, -13); c.stroke();
        } else if (view === 'back') {
          c.strokeStyle = C(ap); c.lineWidth = 2.6; c.beginPath(); c.moveTo(-9, -80); c.lineTo(17 * sk, -26); c.moveTo(9, -80); c.lineTo(-17 * sk, -26); c.stroke();
          c.lineWidth = 3; c.beginPath(); c.moveTo(-22 * sk, -24); c.lineTo(22 * sk, -24); c.stroke();
          c.fillStyle = C(DA(ap, 0.1)); c.beginPath(); c.ellipse(-4, -24, 4.5, 2.6, 0.3, 0, TAU); c.ellipse(4, -24, 4.5, 2.6, -0.3, 0, TAU); c.fill();
          c.lineWidth = 2; c.beginPath(); c.moveTo(-2, -23); c.lineTo(-5, -6); c.moveTo(2, -23); c.lineTo(6, -7); c.stroke();
        } else {
          c.beginPath(); c.moveTo(10 * sk, -62); c.lineTo(15 * sk, -62); c.quadraticCurveTo(19 * sk, -20, 21 * sk, 34); c.lineTo(12 * sk, 34); c.closePath(); cloth(c, ap, 10, 21, -62, 34);
          c.strokeStyle = C(ap); c.lineWidth = 2.4; c.beginPath(); c.moveTo(12 * sk, -62); c.lineTo(4, -81); c.moveTo(14 * sk, -24); c.lineTo(-15 * sk, -24); c.stroke();
        }
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
        if (!look.noFace) { c.fillStyle = C(DA(hair, 0.1), 0.85); c.beginPath(); c.ellipse(-4.6, -16.5, 1.2, 1.6, 0, 0, TAU); c.ellipse(4.6, -16.5, 1.2, 1.6, 0, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(220,120,110,0.22)'; c.beginPath(); c.ellipse(-7, -11.5, 2.8, 1.8, 0, 0, TAU); c.ellipse(7, -11.5, 2.8, 1.8, 0, 0, TAU); c.fill();
        c.strokeStyle = C(DA(skin, 0.3), 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(0.5, -14); c.lineTo(1.2, -10.5); c.stroke();
        if (!look.noFace) { c.beginPath(); c.moveTo(-2, -6.5); c.quadraticCurveTo(0, -5.6, 2, -6.5); c.stroke(); }
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
      if (look.bandana) { // ikat kepala barista, simpul di belakang
        const bd = shade(L, look.bandana); c.fillStyle = C(bd);
        c.beginPath();
        if (view === 'side') { c.moveTo(11, -29); c.quadraticCurveTo(0, -36, -13, -27); c.lineTo(-13, -22); c.quadraticCurveTo(0, -31, 11, -24.5); }
        else { c.moveTo(-13.8, -27); c.quadraticCurveTo(0, view === 'front' ? -34 : -32, 13.8, -27); c.lineTo(13.6, -22.5); c.quadraticCurveTo(0, view === 'front' ? -29.5 : -27.5, -13.6, -22.5); }
        c.closePath(); c.fill();
        c.fillStyle = C(DA(bd, 0.15));
        if (view === 'back') { c.beginPath(); c.ellipse(0, -25, 3, 2.4, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(-1, -24); c.lineTo(-5, -13); c.lineTo(-2, -13); c.lineTo(1, -23); c.moveTo(1, -24); c.lineTo(5, -14); c.lineTo(2, -13); c.closePath(); c.fill(); }
        if (view === 'side') { c.beginPath(); c.ellipse(-13, -24.5, 2.4, 2.8, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(-13, -23); c.lineTo(-18, -13); c.lineTo(-15, -12); c.closePath(); c.fill(); }
      }
      if (view !== 'front') { c.beginPath(); c.ellipse(view === 'side' ? -1 : 0, -18, view === 'side' ? 13 : 13.5, 18, 0, Math.PI * 1.1, Math.PI * 1.9); rimStroke(c, rimC, rimA * 0.9); }
    });
  });

  // ---- lengan: lengan atas (bahu di 0,0) & lengan bawah + tangan (siku di 0,0)
  P.upper = partCanvas(-10, -4, 10, UPPER + 4, (c) => {
    c.beginPath(); c.moveTo(-7.5, 0); c.quadraticCurveTo(-8.5, UPPER * 0.5, -6.5, UPPER + 2); c.quadraticCurveTo(0, UPPER + 5, 6.5, UPPER + 2); c.quadraticCurveTo(8.5, UPPER * 0.5, 7.5, 0); c.quadraticCurveTo(0, -5, -7.5, 0); c.closePath();
    cloth(c, top, -8, 8, 0, UPPER);
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
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const seg = (q, a, b) => clamp01((q - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * k; };
/** Arah tulang → sudut putar (potongan menggantung ke +y). */
const angOf = (vx, vy) => Math.atan2(-vx, vy);
/**
 * Inverse kinematics dua tulang: sudut tulang atas & bawah supaya ujungnya sampai di target.
 * bend: 'down' = sendi tengah di bawah (siku), 'fwd' = sendi tengah ke depan/+x (lutut).
 */
export function ik(sx, sy, tx, ty, a, b, bend = 'down') {
  let dx = tx - sx; let dy = ty - sy; let d = Math.hypot(dx, dy) || 1;
  const max = (a + b) * 0.999; if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const min = Math.abs(a - b) + 1; if (d < min) { dx *= min / d; dy *= min / d; d = min; }
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const al = Math.acos(cosA);
  const ux = dx / d; const uy = dy / d;
  const opts = [al, -al].map((s) => ({ ex: sx + a * (ux * Math.cos(s) - uy * Math.sin(s)), ey: sy + a * (ux * Math.sin(s) + uy * Math.cos(s)) }));
  const e = bend === 'fwd' ? (opts[0].ex >= opts[1].ex ? opts[0] : opts[1]) : (opts[0].ey >= opts[1].ey ? opts[0] : opts[1]);
  return { u: angOf(e.ex - sx, e.ey - sy), f: angOf(sx + dx - e.ex, sy + dy - e.ey), ex: e.ex, ey: e.ey, hx: sx + dx, hy: sy + dy };
}

function put(c, part, x, y, rot, sy = 1) {
  c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (sy !== 1) c.scale(1, sy);
  c.drawImage(part.cv, part.ox, part.oy, part.w, part.h);
  c.restore();
}
/** Kaki dengan sudut paha & betis mutlak. */
function legAbs(c, P, x, y, u, f, far, view = 'side') {
  put(c, P[far ? 'thigh_far' : 'thigh'], x, y, u);
  put(c, P[`${view === 'side' ? 'shin_side' : 'shin_front'}${far ? '_far' : ''}`], x - Math.sin(u) * THIGH, y + Math.cos(u) * THIGH, f);
}
/** Kaki menapak di (fx, fy): lutut selalu menekuk ke depan. */
function legTo(c, P, hx, hy, fx, fy, far) {
  const k = ik(hx, hy, fx, fy, THIGH, SHIN + 3, 'fwd');
  legAbs(c, P, hx, hy, k.u, k.f, far);
}
function armFK(c, P, x, y, u, f, far, su = 1, sf = 1) {
  put(c, P[far ? 'upper_far' : 'upper'], x, y, u, su);
  const ex = x - Math.sin(u) * UPPER * su; const ey = y + Math.cos(u) * UPPER * su;
  put(c, P[far ? 'fore_far' : 'fore'], ex, ey, f, sf);
  return { hx: ex - Math.sin(f) * (FORE - 5) * sf, hy: ey + Math.cos(f) * (FORE - 5) * sf };
}
const handOf = (x, y, u, f) => { const ex = x - Math.sin(u) * UPPER; const ey = y + Math.cos(u) * UPPER; return { hx: ex - Math.sin(f) * (FORE - 5), hy: ey + Math.cos(f) * (FORE - 5) }; };

/** Bayangan kontak yang lembut (gradien), bukan elips padat. */
function contact(c, x, y, rx, ry, a) {
  if (a <= 0.01) return;
  c.save(); c.translate(x, y); c.scale(rx, ry);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(26,17,10,${a})`); g.addColorStop(0.55, `rgba(26,17,10,${a * 0.5})`); g.addColorStop(1, 'rgba(26,17,10,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore();
}
/** Cangkir di titik (x, y) = tengah badan cangkir; tilt memiringkan bibir cangkir ke arah wajah. */
function cupAt(c, x, y, L, tilt = 0) {
  const cer = shade(L, 'f1ece4');
  c.save(); c.translate(x, y); if (tilt) c.rotate(tilt);
  c.fillStyle = C(DA(cer, 0.08)); c.beginPath(); c.moveTo(-5.6, -5); c.lineTo(5.6, -5); c.quadraticCurveTo(5.4, 5, 3.6, 6); c.lineTo(-3.6, 6); c.quadraticCurveTo(-5.4, 5, -5.6, -5); c.fill();
  c.fillStyle = C(LI(cer, 0.1), 0.6); c.fillRect(-4.2, -3.6, 2, 8);
  c.fillStyle = C(DA(cer, 0.4)); c.beginPath(); c.ellipse(0, -5, 5.6, 1.7, 0, 0, TAU); c.fill();
  c.restore();
}
/** Roti kecil (left = sisa 0..1): croissant / roti bulat / sandwich. */
function breadAt(c, x, y, L, kind, left, tilt = 0) {
  if (left <= 0.02) return;
  const k = 0.45 + 0.55 * left;
  c.save(); c.translate(x, y); if (tilt) c.rotate(tilt); c.scale(k, k);
  if (kind === 'sando') {
    c.fillStyle = C(shade(L, 'efe2c4')); c.beginPath(); c.moveTo(-8, 3); c.lineTo(8, 3); c.lineTo(0, -8); c.closePath(); c.fill();
    c.fillStyle = C(shade(L, 'f2d36b')); c.fillRect(-6, 0.5, 12, 1.6);
    c.fillStyle = C(shade(L, '7aa35a')); c.fillRect(-5, -1.2, 10, 1.2);
  } else {
    const base = shade(L, kind === 'melonpan' ? 'e4b862' : 'c98a3c');
    const g = c.createRadialGradient(-2, -3, 1, 0, 0, 9); g.addColorStop(0, C(LI(base, 0.2))); g.addColorStop(1, C(DA(base, 0.25)));
    c.fillStyle = g; c.beginPath();
    if (kind === 'croissant') { c.moveTo(-9, 2); c.quadraticCurveTo(-6, -7, 0, -6); c.quadraticCurveTo(6, -7, 9, 2); c.quadraticCurveTo(0, -1, -9, 2); }
    else c.ellipse(0, -2, 7.5, 5.5, 0, 0, TAU);
    c.fill();
    c.strokeStyle = C(DA(base, 0.35), 0.6); c.lineWidth = 0.9; c.beginPath();
    if (kind === 'croissant') { c.moveTo(-3, -5); c.lineTo(-4, 0); c.moveTo(3, -5); c.lineTo(4, 0); } else { c.moveTo(-4, -5); c.lineTo(3, 1); c.moveTo(3, -6); c.lineTo(-3, 1); }
    c.stroke();
  }
  // bekas gigitan
  if (left < 0.97) { c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(-9, -3, 3 + (1 - left) * 4, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over'; }
  c.restore();
}
function plateAt(c, x, y, L) {
  const cer = shade(L, 'f4efe6');
  c.fillStyle = 'rgba(30,20,12,0.16)'; c.beginPath(); c.ellipse(x + 1, y + 1.6, 12.5, 3, 0, 0, TAU); c.fill();
  c.fillStyle = C(cer); c.beginPath(); c.ellipse(x, y, 12, 2.8, 0, 0, TAU); c.fill();
  c.fillStyle = C(DA(cer, 0.12)); c.beginPath(); c.ellipse(x, y - 0.2, 7.5, 1.6, 0, 0, TAU); c.fill();
}

// --- titik tangan untuk duduk di meja bundar (relatif dudukan kursi, menghadap kanan)
const T_REST = { x: 40, y: -35 }; const T_FAR = { x: 48, y: -36 };
const T_CUP = { x: 62, y: -38 }; const T_PLATE = { x: 81, y: -38 }; const TABLE_Y = -37;
const MOUTH = { x: 20, y: -87 };
/**
 * Lini masa satu gerakan tangan saat duduk. kind: sip (minum), eat (makan), place (meletakkan cangkir).
 * Menghasilkan dari-mana-ke-mana (a → b, k), apa yang dipegang, kemiringan cangkir & kepala.
 */
function actPlan(act, from) {
  const q = act.q; const out = { hold: null, tilt: 0, head: 0, nod: 0, lift: 0 };
  if (act.kind === 'place') {
    if (q < 0.55) Object.assign(out, { a: from, b: T_CUP, k: ease(seg(q, 0, 0.55)), arc: true, hold: 'cup' });
    else Object.assign(out, { a: T_CUP, b: T_REST, k: ease(seg(q, 0.62, 1)) });
    return out;
  }
  const item = act.kind === 'eat' ? T_PLATE : T_CUP; const hold = act.kind === 'eat' ? 'bread' : 'cup';
  if (q < 0.16) Object.assign(out, { a: T_REST, b: item, k: ease(seg(q, 0, 0.16)) }); // meraih
  else if (q < 0.22) Object.assign(out, { a: item, b: item, k: 0, hold }); // menggenggam
  else if (q < 0.46) Object.assign(out, { a: item, b: MOUTH, k: seg(q, 0.22, 0.46), arc: true, hold }); // mengangkat
  else if (q < 0.66) { // di mulut
    const m = Math.sin(seg(q, 0.46, 0.66) * Math.PI);
    Object.assign(out, { a: MOUTH, b: MOUTH, k: 0, hold });
    if (act.kind === 'sip') { out.tilt = 0.15 + 0.45 * m; out.head = -0.1 * m; } else { out.tilt = 0.1; out.nod = Math.sin(seg(q, 0.5, 0.64) * Math.PI); }
  } else if (q < 0.86) Object.assign(out, { a: MOUTH, b: item, k: seg(q, 0.66, 0.86), arc: true, hold }); // menurunkan
  else Object.assign(out, { a: item, b: T_REST, k: ease(seg(q, 0.88, 1)) }); // melepas
  out.lift = q < 0.66 ? ease(seg(q, 0.2, 0.46)) : 1 - ease(seg(q, 0.66, 0.88));
  if (out.arc && out.b === MOUTH) out.tilt = 0.15 * ease(out.k);
  if (out.arc && out.a === MOUTH) out.tilt = 0.15 * (1 - ease(out.k));
  return out;
}
/** Titik tangan dari rencana: lintasan melengkung (naik dulu, lalu mendekat ke wajah) atau lurus. */
function planTarget(pl) {
  const k = ease(pl.k);
  if (!pl.arc) return { x: lerp(pl.a.x, pl.b.x, k), y: lerp(pl.a.y, pl.b.y, k) };
  const low = pl.a.y > pl.b.y ? pl.a : pl.b; const high = low === pl.a ? pl.b : pl.a;
  const cx = low.x * 0.62 + high.x * 0.38; const cy = high.y + 9;
  const m = 1 - k;
  return { x: m * m * pl.a.x + 2 * m * k * cx + k * k * pl.b.x, y: m * m * pl.a.y + 2 * m * k * cy + k * k * pl.b.y };
}
/** Siklus kaki untuk berjalan dari samping: menapak (bergeser ke belakang, diam di lantai) lalu mengayun. */
function foot(phi, half) {
  const f = ((phi % TAU) + TAU) % TAU;
  if (f < Math.PI) { const s = f / Math.PI; return { x: half * (1 - 2 * s), y: -Math.max(0, s - 0.75) * 10 * (half / 30), stance: true }; }
  const s = (f - Math.PI) / Math.PI; const e = (1 - Math.cos(s * Math.PI)) / 2;
  return { x: -half + 2 * half * e, y: -Math.sin(Math.min(1, s * 1.15) * Math.PI) * (4 + 9 * half / 30), stance: false };
}
const HALF = 26; // setengah panjang langkah (satuan tokoh) pada kecepatan penuh
/** Jarak tempuh (satuan tokoh) → kemajuan fase langkah: telapak yang menapak tidak "meluncur". */
export const stepPhase = (dist, spd) => (Math.PI * dist) / (2 * Math.max(6, HALF * spd));

/**
 * Gambar satu pengunjung. p: { x, y, s, face, pose, ph, spd, ch, act, talk, cupInHand, cupOnTable, food, alpha }
 * Titik (x, y) = telapak kaki (berdiri/berjalan) atau dudukan (duduk).
 */
export function drawPerson(c, p, L, t) {
  const P = p.ch.parts; const lk = p.ch.look;
  const sc = p.s * lk.tall;
  c.save();
  c.globalAlpha = p.alpha ?? 1;
  c.translate(p.x, p.y);
  c.scale(sc, sc);
  // berbalik kiri↔kanan: sesaat menghadap depan, jadi tidak "membalik" mendadak
  const face = p.turnT > 0 && p.turnVia ? p.turnVia : p.face;
  const side = face === 'left' || face === 'right';
  if (p.turnT > 0) { const k = p.turnT / 0.22; c.scale(0.78 + 0.22 * Math.abs(2 * k - 1), 1); } // seolah memutar badan
  if (face === 'left') c.scale(-1, 1);
  const view = side ? 'side' : face === 'back' ? 'back' : 'front';
  const walking = p.pose === 'walk'; const ph = p.ph || 0;
  const breathe = Math.sin(t * 1.6 + (p.id || 0)) * 0.5;
  const talk = p.talk || 0;
  const torso = P[`torso_${view}`]; const head = P[`head_${view}`];
  const shA = 0.26 + (L.lampsOn ? 0.04 : 0);
  const sk = lk.slim;

  if (p.pose === 'walk' || p.pose === 'stand') {
    const sp = walking ? Math.max(0.2, p.spd ?? 1) : 0;
    const idle = p.pose === 'stand' ? Math.sin(t * 0.8 + (p.id || 0) * 1.7) : 0; // berat badan berpindah pelan
    if (side) {
      const half = HALF * sp;
      const st0 = ease(1 - (p.settle || 0)); // 0 = baru berhenti, 1 = sudah berdiri tegak
      const settleFoot = (f, x) => ({ x: lerp(f.x, x, st0), y: f.y * (1 - st0), stance: true });
      const fn = walking ? foot(ph, half) : settleFoot(foot(ph, HALF * 0.3), 5); // kaki dekat
      const ff = walking ? foot(ph + Math.PI, half) : settleFoot(foot(ph + Math.PI, HALF * 0.3), -5); // kaki jauh
      const st = fn.stance ? fn : ff;
      // pinggul naik-turun seperti pendulum terbalik: tertinggi saat kaki tegak di bawah badan
      const hy = -Math.sqrt(Math.max(1, LEG_LEN * LEG_LEN - st.x * st.x)) * 0.992 + (walking ? 0 : breathe * 0.3);
      const hx = idle * 0.8;
      contact(c, (fn.x + ff.x) / 2 + hx, 1, 22 + Math.abs(fn.x - ff.x) * 0.45, 4.6, shA);
      const lean = walking ? 0.035 * sp : 0; // condong sedikit ke depan saat berjalan
      const swing = walking ? 0.3 * sp * Math.cos(ph) : 0.09 * (1 - st0) * Math.cos(ph); // lengan berlawanan dengan kaki
      const elb = (u) => u - 0.18 - 1.1 * Math.max(0, -u);
      const shF = { x: hx - 1 + Math.sin(lean) * 72, y: hy - Math.cos(lean) * 72 };
      const shN = { x: hx + 1 + Math.sin(lean) * 72, y: hy - Math.cos(lean) * 72 };
      // lengan jauh (+ payung tertutup), kaki jauh, badan, kaki dekat, kepala, lengan dekat
      let fh;
      if (p.cupInHand && p.food) { const k = ik(shF.x, shF.y, hx + 30, hy - 24, UPPER, FORE - 5); fh = armFK(c, P, shF.x, shF.y, k.u, k.f, true); }
      else fh = armFK(c, P, shF.x, shF.y, -swing, elb(-swing), true);
      if (lk.umbrella && !p.cupInHand) {
        const a = -swing * 0.5 + 0.08; const ux = fh.hx; const uy = fh.hy;
        c.save(); c.translate(ux, uy); c.rotate(a);
        c.strokeStyle = C(shade(L, '2a2622')); c.lineWidth = 2; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 60); c.stroke();
        c.fillStyle = C(shade(L, lk.umbrella)); c.beginPath(); c.moveTo(-1, 8); c.quadraticCurveTo(-7, 32, -2, 54); c.lineTo(2, 54); c.quadraticCurveTo(7, 32, 1, 8); c.fill();
        c.restore();
      }
      legTo(c, P, hx - 1, hy, ff.x + hx, ff.y, true);
      put(c, torso, hx, hy, lean);
      legTo(c, P, hx + 1, hy, fn.x + hx, fn.y, false);
      put(c, head, hx + Math.sin(lean) * 84 + 1, hy - Math.cos(lean) * 84, -lean * 0.6 + (p.look2 || 0));
      if (p.cupInHand) {
        const k = ik(shN.x, shN.y, hx + 31, hy - 22, UPPER, FORE - 5);
        const hd = handOf(shN.x, shN.y, k.u, k.f);
        if (p.food) { // nampan kecil: cangkir & roti di atas, dibawa dua tangan
          c.fillStyle = C(shade(L, '8a6a4a')); c.beginPath(); c.roundRect(hd.hx - 18, hd.hy - 3, 34, 4, 2); c.fill();
          cupAt(c, hd.hx - 8, hd.hy - 9, L); breadAt(c, hd.hx + 7, hd.hy - 3, L, p.food.kind, 1);
        } else cupAt(c, hd.hx + 3, hd.hy - 3, L);
        armFK(c, P, shN.x, shN.y, k.u, k.f, false);
      } else armFK(c, P, shN.x, shN.y, swing, elb(swing), false);
    } else {
      // depan / belakang: kaki bergantian terangkat, pinggul bergoyang ke kaki yang menapak
      const lift = (k) => { const amt = walking ? Math.min(1, sp) : 0.3 * (p.settle || 0); if (amt <= 0) return 0; const f = (((ph + k * Math.PI) % TAU) + TAU) % TAU; return f < Math.PI ? 0 : Math.sin((f - Math.PI)) * amt; };
      const sway = walking ? Math.sin(ph) * 2.2 * sp : idle * 0.8;
      const hy = -LEG_LEN + 1 + (walking ? Math.abs(Math.sin(ph)) * 1.6 * sp : breathe * 0.3);
      const roll = walking ? -Math.sin(ph) * 0.025 * sp : 0;
      contact(c, sway * 0.5, 1, 24, 5, shA);
      const legF = (x, k) => {
        const l = lift(k);
        if (view === 'front') { // lutut maju: paha memendek, telapak terangkat
          put(c, P.thigh, x, hy, 0, 1 - 0.2 * l); put(c, P.shin_front, x, hy + THIGH * (1 - 0.2 * l), 0);
        } else { // dari belakang: betis terlipat ke belakang
          put(c, P.thigh, x, hy, 0); put(c, P.shin_front, x, hy + THIGH, 0, 1 - 0.28 * l);
        }
      };
      const sw = walking ? Math.sin(ph) * 0.1 * sp : 0;
      const shY = hy + SHOULDER_Y + 4;
      legF(sway - 10 * sk, 0); legF(sway + 10 * sk, 1);
      c.save(); c.translate(sway, hy); c.rotate(roll);
      put(c, torso, 0, 0);
      if (view === 'back') {
        put(c, head, 0, NECK_Y, (p.look2 || 0) * 0.5);
        if (p.point > 0.01) { // menunjuk papan menu (kiri atas) dengan tangan kiri
          const q = p.point; const u = 0.08 + 1.05 * q; // lengan terangkat ke depan-kiri (memendek karena mengarah ke papan)
          armFK(c, P, -24 * sk, SHOULDER_Y + 4, u, u + 0.12 + 0.55 * q, false, 1 - 0.38 * q, 1 - 0.2 * q);
        } else armFK(c, P, -24 * sk, SHOULDER_Y + 4, 0.08 + sw, 0.12 + sw, false);
        armFK(c, P, 24 * sk, SHOULDER_Y + 4, -0.08 - sw, -0.12 - sw, false);
      } else {
        put(c, head, 0, NECK_Y, (p.look2 || 0) * 0.5);
        if (p.cupInHand && p.food) { // nampan di depan perut
          armFK(c, P, -24 * sk, SHOULDER_Y + 4, 0.06, -0.9, false, 1, 0.55); armFK(c, P, 24 * sk, SHOULDER_Y + 4, -0.06, 0.9, false, 1, 0.55);
          c.fillStyle = C(shade(L, '8a6a4a')); c.beginPath(); c.roundRect(-21, -15, 42, 5, 2); c.fill();
          cupAt(c, -8, -21, L); breadAt(c, 9, -16, L, p.food.kind, 1);
        } else {
          armFK(c, P, -24 * sk, SHOULDER_Y + 4, 0.08 - sw, 0.04 - sw, false);
          if (p.cupInHand) { const hd = handOf(24 * sk, SHOULDER_Y + 4, -0.04, 1.3); cupAt(c, hd.hx - 2, hd.hy - 5, L); armFK(c, P, 24 * sk, SHOULDER_Y + 4, -0.04, 1.3, false); }
          else armFK(c, P, 24 * sk, SHOULDER_Y + 4, -0.08 + sw, -0.04 + sw, false);
        }
      }
      c.restore();
    }
  } else if (p.pose === 'sitBack') { // duduk di bangku bar, membelakangi kita
    const e = ease(p.sitK ?? 1);
    // berdiri tepat di belakang bangku → pinggul naik ke dudukan; paha maju (tertutup dudukan), betis
    // menggantung dengan telapak di pijakan bangku — bukan berdiri lurus di lantai
    const floorY = 96; const ringY = 56 / sc + 3; // titik (x, y) = dudukan + 2
    const sy = lerp(floorY - LEG_LEN + 0.5, -1, e) + breathe * 0.35 * e;
    contact(c, 0, floorY + 1, 22, 4, shA * 0.7 * (1 - e));
    const thS = Math.max(0.12, 1 - 0.88 * e); const kneeY = sy + THIGH * thS;
    // duduk: lutut sedikit terbuka; satu kaki bertumpu di cincin pijakan, yang lain menjuntai lebih rendah
    const legs = [
      { far: true, kx: -lerp(9 * sk, 12 * sk, e), fx: lerp(-9 * sk, -15, e), fy: lerp(floorY, ringY + 13, e) },
      { far: false, kx: lerp(9 * sk, 12 * sk, e), fx: lerp(9 * sk, 6, e), fy: lerp(floorY, ringY, e) },
    ];
    for (const g of legs) {
      const dx = g.fx - g.kx; const dy = g.fy - kneeY - 1;
      put(c, P[g.far ? 'shin_front_far' : 'shin_front'], g.kx, kneeY, angOf(dx, dy), Math.max(0.3, Math.hypot(dx, dy) / (SHIN + 3)));
      put(c, P[g.far ? 'thigh_far' : 'thigh'], g.kx, sy, 0, thS);
    }
    // bangku: kaki & cincin pijakan yang dekat kita serta dudukannya menutupi kaki/pinggul orang
    const oa = ease(seg(e, 0.35, 0.75));
    if (oa > 0.01) {
      const u = 1 / sc; const top = -2 * u; const foot = (STOOL_FOOT - STOOL_SEAT - 2) * u;
      c.save(); c.globalAlpha *= oa;
      c.strokeStyle = C(shade(L, '3b2c22')); c.lineCap = 'round'; c.lineWidth = 5 * u;
      c.beginPath(); c.moveTo(-20 * u, top + 6 * u); c.lineTo(-30 * u, foot); c.moveTo(20 * u, top + 6 * u); c.lineTo(30 * u, foot); c.stroke();
      c.lineWidth = 3.5 * u; c.beginPath(); c.ellipse(0, top + 58 * u, 26 * u, 5 * u, 0, 0, Math.PI); c.stroke();
      c.fillStyle = C(shade(L, '7a5a3e')); c.beginPath(); c.ellipse(0, top + 5 * u, 33 * u, 9 * u, 0, 0, TAU); c.fill();
      const g = c.createLinearGradient(-33 * u, 0, 33 * u, 0); g.addColorStop(0, C(shade(L, 'dcb487'))); g.addColorStop(1, C(shade(L, 'a77c54')));
      c.fillStyle = g; c.beginPath(); c.ellipse(0, top, 33 * u, 9 * u, 0, 0, TAU); c.fill();
      // pinggul/celana yang bertumpu di dudukan
      const pg = shade(L, lk.bottom); const pgr = c.createLinearGradient(-22, 0, 22, 0); pgr.addColorStop(0, C(DA(pg, 0.25))); pgr.addColorStop(0.45, C(pg)); pgr.addColorStop(1, C(DA(pg, 0.3)));
      c.fillStyle = pgr; c.beginPath(); c.ellipse(0, sy + 3, 22 * sk, 8, 0, 0, TAU); c.fill();
      c.restore();
    }
    const lift = p.act && p.act.kind !== 'place' ? actPlan(p.act, T_REST).lift : 0;
    const ts = 1 - 0.05 * e; // sedikit membungkuk ke arah meja bar
    const shL = { x: -22 * sk, y: (SHOULDER_Y + 4) * ts + sy }; const shR = { x: 22 * sk, y: (SHOULDER_Y + 4) * ts + sy };
    // lengan bawah (menuju meja bar / ke mulut) tertutup badan & kepala → digambar lebih dulu
    put(c, P.fore_far, shL.x - Math.sin(0.1 * e) * UPPER * (1 - 0.2 * e), shL.y + Math.cos(0.1 * e) * UPPER * (1 - 0.2 * e), lerp(0.1, -1.1, e), 1 - 0.45 * e);
    const uR = -(0.1 * e + 0.36 * lift); const suR = 1 - 0.2 * e - 0.16 * lift;
    const elR = { x: shR.x - Math.sin(uR) * UPPER * suR, y: shR.y + Math.cos(uR) * UPPER * suR };
    const fR = lift > 0.02 ? lerpAng(lerp(-0.1, 1.1, e), angOf(4 - elR.x, NECK_Y * ts - 12 + sy - elR.y), ease(lift * 1.4)) : lerp(-0.1, 1.1, e);
    put(c, P.fore, elR.x, elR.y, fR, lift > 0.02 ? 1 - 0.25 * lift : 1 - 0.45 * e);
    put(c, torso, 0, sy, 0, ts);
    put(c, head, 0, NECK_Y * ts + sy + lift * 1.2 + 1.5 * e, 0, 1 - lift * 0.03);
    put(c, P.upper_far, shL.x, shL.y, 0.1 * e, 1 - 0.2 * e);
    put(c, P.upper, shR.x, shR.y, uR, suR); // siku terangkat ke samping saat minum / makan
  } else if (p.pose === 'sitSide') { // duduk di kursi menghadap meja (kanan)
    // duduk/berdiri: pinggul turun-naik dan mundur sedikit, lutut menekuk, telapak kaki tetap di lantai
    const e = ease(p.sitK ?? 1);
    const hipA = -(Math.PI / 2 - 0.03) * e; const kneeA = (Math.PI / 2 - 0.1) * e;
    const footX = 30 + 36 * e;
    const relX = -THIGH * Math.sin(hipA) - SHIN * Math.sin(hipA + kneeA); const relY = THIGH * Math.cos(hipA) + SHIN * Math.cos(hipA + kneeA);
    const hx = footX - relX; const hy = CHAIR_FOOT - relY;
    const sy = hy + breathe * 0.4 * e;
    // barang di meja (cangkir & piring) — ikut memudar saat pergi
    const items = p.state === 'standUp' ? e : 1;
    const plan = p.act && e > 0.98 ? actPlan(p.act, { x: hx + 31, y: sy - 22 }) : null;
    const target = plan ? planTarget(plan) : null;
    // condong ke depan di tengah gerakan duduk, dan saat meraih piring yang agak jauh
    const lean = 0.04 * e + (1 - e) * e * 4 * 0.3 + (target ? 0.13 * clamp01((target.x - 56) / 26) : 0);
    contact(c, (hx + footX) / 2, CHAIR_FOOT, 34, 5, shA);
    // titik bahu & leher mengikuti badan yang condong
    const R = (x, y) => ({ x: hx + x * Math.cos(lean) - y * Math.sin(lean), y: sy + x * Math.sin(lean) + y * Math.cos(lean) });
    const sh = R(2, SHOULDER_Y + 4); const shF = R(-1, SHOULDER_Y + 4); const nk = R(2, NECK_Y);
    // lengan jauh: bertumpu di meja (tertutup badan)
    const hang = (s) => ({ x: s.x + 3, y: s.y + 84 });
    const farT = { x: lerp(hang(shF).x, T_FAR.x, ease(seg(e, 0.6, 1))), y: lerp(hang(shF).y, T_FAR.y, ease(seg(e, 0.6, 1))) - (talk * Math.max(0, Math.sin(t * 1.3 + 2)) * 3) };
    const kf = ik(shF.x, shF.y, farT.x, farT.y, UPPER, FORE - 5); armFK(c, P, shF.x, shF.y, kf.u, kf.f, true);
    put(c, P.thigh_far, hx - 4, hy, hipA + 0.04 * e); put(c, P.shin_side_far, hx - 4 - Math.sin(hipA + 0.04 * e) * THIGH, hy + Math.cos(hipA + 0.04 * e) * THIGH, hipA + kneeA - 0.02 * e);
    put(c, torso, hx, sy, lean);
    legAbs(c, P, hx + 2, hy, hipA, hipA + kneeA, false);
    // kepala: mendongak sedikit saat minum, mengangguk saat menggigit roti
    const headRot = (plan ? plan.head + plan.nod * 0.06 : 0) + talk * Math.sin(t * 1.9) * 0.03 + (p.look2 || 0) * 0.5;
    put(c, head, nk.x + (plan ? plan.nod * 1.5 : 0), nk.y, headRot);
    // tangan dekat
    const holding = plan ? plan.hold : null;
    if (items > 0.02 && p.cupOnTable && holding !== 'cup') { c.globalAlpha = (p.alpha ?? 1) * items; cupAt(c, T_CUP.x + 3, TABLE_Y - 6, L); c.globalAlpha = p.alpha ?? 1; }
    if (items > 0.02 && p.food && p.seat?.kind !== 'stool') { c.globalAlpha = (p.alpha ?? 1) * items; plateAt(c, T_PLATE.x + 2, TABLE_Y + 1, L); if (holding !== 'bread') breadAt(c, T_PLATE.x + 2, TABLE_Y - 2, L, p.food.kind, p.food.left); c.globalAlpha = p.alpha ?? 1; }
    let k;
    if (target) k = ik(sh.x, sh.y, target.x, target.y, UPPER, FORE - 5);
    else if (e > 0.98) { // istirahat di meja; saat bicara tangan ikut bergerak pelan
      const g = Math.sin(t * 1.7 + (p.id || 0));
      k = ik(sh.x, sh.y, T_REST.x + talk * g * 5, T_REST.y - talk * Math.max(0, Math.sin(t * 1.7 + 0.9 + (p.id || 0))) * 8, UPPER, FORE - 5);
    } else if (p.cupInHand) k = ik(sh.x, sh.y, hx + 31, sy - 22, UPPER, FORE - 5); // membawa cangkir sambil duduk
    else { const tg = { x: lerp(hang(sh).x, T_REST.x, ease(seg(e, 0.5, 1))), y: lerp(hang(sh).y, T_REST.y, ease(seg(e, 0.5, 1))) }; k = ik(sh.x, sh.y, tg.x, tg.y, UPPER, FORE - 5); }
    const hd = handOf(sh.x, sh.y, k.u, k.f);
    if (holding === 'cup' || (!plan && p.cupInHand)) cupAt(c, hd.hx + 4, hd.hy - 2, L, plan ? -plan.tilt : 0);
    if (holding === 'bread') breadAt(c, hd.hx + 3, hd.hy - 2, L, p.food.kind, p.food.left, -0.2);
    armFK(c, P, sh.x, sh.y, k.u, k.f, false);
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

// ------------------------------------------------------------------ barista (tokoh yang sama, dengan ekspresi)
export const BARISTA_LOOK = { skin: 'e0b48f', hair: '2a211c', top: 'efe8dc', bottom: '3a3f48', shoe: '2a2622', coat: null, style: 'short', bag: false, tall: 1, slim: 1.05, umbrella: null, apron: '3c4f5f', bandana: 'b8614a', noFace: true };
export const BARISTA_POS = { foot: 690, machine: 134, serve: 186, greet: 222, wipe: 158 };

/** Wajah yang hidup (kepala tampak depan, pangkal leher di 0,0): mata berkedip & melirik, alis, mulut tersenyum/bicara. */
function drawFace(c, f, look, L) {
  const hair = shade(L, look.hair); const skin = shade(L, look.skin);
  c.lineCap = 'round';
  // alis: naik saat ramah/terkejut, ujung dalam turun saat serius
  c.strokeStyle = C(DA(hair, 0.05), 0.85); c.lineWidth = 1.15;
  for (const sd of [-1, 1]) {
    const y0 = -20.8 - f.brow * 1.2;
    c.beginPath(); c.moveTo(sd * 2.4, y0 + Math.max(0, -f.brow) * 1.1); c.quadraticCurveTo(sd * 4.8, y0 - 0.9, sd * 7, y0 + 0.2); c.stroke();
  }
  // mata
  const ex = f.eyeX * 0.9; const ey = f.eyeY * 0.8;
  c.fillStyle = C(DA(hair, 0.1), 0.92); c.strokeStyle = C(DA(hair, 0.1), 0.92); c.lineWidth = 1.05;
  for (const sd of [-1, 1]) {
    const x = sd * 4.6;
    if (f.happy > 0.5) { c.beginPath(); c.arc(x, -15.6, 1.7, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); continue; }
    const h = 1.65 * (1 - f.blink);
    if (h < 0.4) { c.beginPath(); c.moveTo(x - 1.4, -16.3); c.lineTo(x + 1.4, -16.3); c.stroke(); continue; }
    c.beginPath(); c.ellipse(x + ex * 0.55, -16.5 + ey * 0.55, 1.25, h, 0, 0, TAU); c.fill();
  }
  // mulut: senyum melebar, terbuka saat bicara, bulat kecil saat bersenandung
  const sm = f.smile; const open = f.talk;
  if (open > 0.12) {
    c.fillStyle = C(M(DA(skin, 0.62), H('5a2a26'), 0.5)); c.beginPath(); c.ellipse(0, -6.4 + sm * 0.2, 1.5 + sm * 0.7 - f.hum * 0.6, 0.35 + open * 1.4, 0, 0, TAU); c.fill();
  } else {
    c.strokeStyle = C(DA(skin, 0.5), 0.9); c.lineWidth = 1;
    const w = 2.2 + sm * 0.9; const cy = -6.7 - sm * 0.5;
    c.beginPath(); c.moveTo(-w, cy); c.quadraticCurveTo(0, cy + 0.4 + sm * 2.1, w, cy); c.stroke();
  }
}

/**
 * Barista: menyapa & mendengarkan pesanan (tersenyum, bicara, mengangguk), membuat kopi di mesin,
 * mengantarnya ke konter ("silakan" — mata tersenyum, sedikit membungkuk), lalu mengelap konter sambil bersenandung.
 * info: { ordering, orderX }. orders bertambah tiap ada pesanan; counterCup = cangkir siap diambil.
 */
export function createBarista(rnd = Math.random) {
  const B = BARISTA_POS;
  const b = { x: B.wipe, face: 'front', mode: 'idle', t: 2, q: 0, ph: 0, spd: 0, turnT: 0, turnVia: null, target: null, then: null, orders: 0, hold: false, counterCup: null,
    blinkT: 2, blink: 0, f: { smile: 0.3, talk: 0, brow: 0, eyeX: 0, eyeY: 0, happy: 0, hum: 0, blink: 0 }, nod: 0, bow: 0, clock: 0, ch: null, idleN: 0 };
  const goTo = (x, then) => {
    if (Math.abs(x - b.x) < 1) { then(); return; }
    b.target = x; b.then = then; b.mode = 'walk';
    const nf = x > b.x ? 'right' : 'left'; if (nf !== b.face) { b.turnVia = b.face === 'back' || b.face === 'front' ? nf : 'front'; b.turnT = 0.24; } b.face = nf;
  };
  const faceTo = (f) => { if (f !== b.face) { b.turnVia = b.face; b.turnT = 0.24; b.face = f; } };
  const brew = () => { b.mode = 'brew'; faceTo('back'); b.t = b.orders > 1 ? 2.4 : 3 + rnd() * 1.5; };
  const serve = () => { b.mode = 'serve'; faceTo('front'); b.q = 0; };
  const greet = () => { b.mode = 'greet'; faceTo('front'); b.t = 0; };
  const idle = () => {
    b.idleN++;
    if (b.idleN % 2) { goTo(B.wipe, () => { b.mode = 'wipe'; faceTo('front'); b.t = 4 + rnd() * 3; }); }
    else { b.mode = 'idle'; faceTo('front'); b.t = 2.5 + rnd() * 3; }
  };
  const next = () => { if (b.orders > 0) goTo(B.machine, brew); else idle(); };

  function step(dt, info = {}) {
    b.clock += dt;
    if (b.turnT > 0) b.turnT -= dt;
    if (b.counterCup) b.counterCup.age += dt;
    b.blinkT -= dt; if (b.blinkT <= 0) { b.blink = 0.16; b.blinkT = 2.2 + rnd() * 3.4; }
    if (b.blink > 0) b.blink -= dt;
    // ada yang memesan: tinggalkan lap / diam, datangi kasir
    if (info.ordering && (b.mode === 'idle' || b.mode === 'wipe' || (b.mode === 'walk' && b.target !== B.greet && !b.hold))) goTo(B.greet, greet);
    const want = { smile: 0.3, talk: 0, brow: 0, eyeX: 0.5 * Math.sin(b.clock * 0.35), eyeY: 0.1, happy: 0, hum: 0 };
    let nod = 0; let bow = 0;
    switch (b.mode) {
      case 'walk': {
        const d = b.target - b.x; const want2 = Math.min(1, 0.3 + Math.abs(d) / 40);
        b.spd += (want2 - b.spd) * Math.min(1, dt * 4);
        const v = 46 * dt * Math.max(0.15, b.spd);
        b.ph += v * 0.14;
        want.eyeX = Math.sign(d) * 0.6;
        if (Math.abs(d) <= v) { b.x = b.target; b.spd = 0; const th = b.then; b.then = null; th(); } else b.x += Math.sign(d) * v;
        break;
      }
      case 'greet': { // mendengarkan & menjawab pesanan
        b.t += dt;
        const speak = Math.sin(b.t * 1.1) > 0.25;
        Object.assign(want, { smile: 0.75, brow: 0.45, eyeX: 0.95, eyeY: 0.25, talk: speak ? 0.35 + 0.55 * Math.abs(Math.sin(b.t * 8.5)) : 0 });
        nod = speak ? 0 : Math.max(0, Math.sin(b.t * 3.2)) * 0.8;
        if (!info.ordering && b.t > 1.5) next();
        break;
      }
      case 'brew':
        b.t -= dt;
        if (b.t <= 0) { if (b.orders > 0) { b.hold = true; goTo(B.serve, serve); } else next(); }
        break;
      case 'serve': { // meletakkan cangkir, "silakan!"
        b.q = Math.min(1, b.q + dt / 2.6);
        if (b.hold && b.q >= 0.38) { b.hold = false; b.counterCup = { x: b.x + 25, y: COUNTER_Y + 3, age: 0 }; b.orders = Math.max(0, b.orders - 1); }
        const k = Math.sin(seg(b.q, 0.4, 0.95) * Math.PI);
        Object.assign(want, { smile: 0.5 + 0.5 * k, happy: k, brow: 0.3, eyeX: 0.6, eyeY: 0.3, talk: b.q > 0.42 && b.q < 0.62 ? 0.5 + 0.4 * Math.abs(Math.sin(b.clock * 9)) : 0 });
        bow = k;
        if (b.q >= 1) next();
        break;
      }
      case 'wipe': // mengelap konter, serius sambil sesekali bersenandung
        b.t -= dt;
        Object.assign(want, { smile: 0.15, brow: -0.35, eyeX: 0.15 * Math.sin(b.clock * 2.4), eyeY: 1, hum: Math.sin(b.clock * 0.5) > 0.6 ? 1 : 0 });
        if (want.hum) want.talk = 0.25 + 0.1 * Math.sin(b.clock * 6);
        if (b.t <= 0) next();
        break;
      case 'idle': // melihat ke arah pengunjung
        b.t -= dt;
        Object.assign(want, { smile: 0.4, eyeX: 0.8 * Math.sin(b.clock * 0.6), eyeY: 0.15 });
        if (b.t <= 0) next();
        break;
      default: break;
    }
    const r = Math.min(1, dt * 5);
    for (const k of Object.keys(want)) b.f[k] += (want[k] - b.f[k]) * (k === 'talk' ? Math.min(1, dt * 18) : r);
    b.f.blink = b.blink > 0 ? Math.sin((b.blink / 0.16) * Math.PI) : 0;
    b.nod += (nod - b.nod) * r; b.bow += (bow - b.bow) * Math.min(1, dt * 3);
  }
  b.step = step;
  return b;
}

/** Gambar barista (titik = telapak di balik konter). Pemanggil memotong gambar di permukaan konter. */
export function drawBarista(c, b, L, t) {
  const ch = b.ch; if (!ch || !ch.ready) return;
  const P = ch.parts; const lk = ch.look; const sk = lk.slim;
  const B = BARISTA_POS;
  const sc = depthScale(B.foot) * lk.tall;
  const cy = (COUNTER_Y - B.foot) / sc; // permukaan konter dalam satuan tokoh
  c.save(); c.translate(b.x, B.foot); c.scale(sc, sc);
  let face = b.turnT > 0 && b.turnVia ? b.turnVia : b.face;
  if (b.turnT > 0) { const k = b.turnT / 0.24; c.scale(0.78 + 0.22 * Math.abs(2 * k - 1), 1); }
  const breathe = Math.sin(t * 1.5) * 0.6;
  const walking = b.mode === 'walk';
  const hy = -LEG_LEN + 1 + breathe * 0.3 - (walking ? Math.abs(Math.sin(b.ph)) * 1.8 : 0);
  const SH = hy + SHOULDER_Y + 4;
  if (face === 'left' || face === 'right') {
    if (face === 'left') c.scale(-1, 1);
    const sw = walking ? Math.sin(b.ph) * 0.22 : 0;
    armFK(c, P, -1, SH, -sw, -sw - 0.2, true);
    put(c, P.torso_side, 0, hy, 0.03);
    put(c, P.head_side, 2, hy + NECK_Y, -0.02);
    if (b.hold) { const k = ik(1, SH, 28, SH + 30, UPPER, FORE - 5); const hd = handOf(1, SH, k.u, k.f); cupAt(c, hd.hx + 3, hd.hy - 3, L); armFK(c, P, 1, SH, k.u, k.f, false); }
    else armFK(c, P, 1, SH, sw, sw - 0.2, false);
  } else if (face === 'back') { // di mesin espresso: siku bergantian bekerja, kepala menunduk sedikit
    const uL = 0.2 + Math.sin(t * 3.1) * 0.07; const uR = -0.2 - Math.sin(t * 2.3 + 1) * 0.07; const su = 0.78;
    // lengan bawah mengarah ke mesin di depannya → tertutup badan, yang tampak hanya siku yang bergerak
    put(c, P.torso_back, 0, hy);
    put(c, P.head_back, 0, hy + NECK_Y + 1.5);
    put(c, P.upper_far, -24 * sk, SH, uL, su); put(c, P.upper, 24 * sk, SH, uR, su);
  } else { // menghadap kita
    const bow = b.bow * 0.06;
    put(c, P.torso_front, 0, hy, 0, 1 - bow);
    // lengan kiri santai (tangan di bawah permukaan konter)
    armFK(c, P, -24 * sk, SH, 0.1, 0.02, false);
    const hx = 0; const hyN = hy + NECK_Y * (1 - bow) + b.nod * 1.4 + b.bow * 2.5;
    const tilt = b.mode === 'greet' ? 0.06 : b.mode === 'wipe' ? -0.03 : Math.sin(t * 0.4) * 0.03;
    c.save(); c.translate(hx, hyN); c.rotate(tilt);
    c.drawImage(P.head_front.cv, P.head_front.ox, P.head_front.oy, P.head_front.w, P.head_front.h);
    drawFace(c, b.f, lk, L);
    c.restore();
    // lengan kanan: mengelap / menaruh cangkir / gerak tangan saat bicara / santai
    const shR = { x: 24 * sk, y: SH };
    let tg = null; let cloth2 = false; let cup = false;
    if (b.mode === 'wipe') { tg = { x: 10 + 13 * Math.sin(t * 2.4), y: cy - 2 + Math.abs(Math.cos(t * 2.4)) * 1.5 }; cloth2 = true; }
    else if (b.mode === 'serve') {
      const q = b.q; const chest = { x: 16, y: SH + 46 }; const place = { x: 24, y: cy - 4 };
      if (q < 0.38) { const k = ease(seg(q, 0, 0.38)); tg = { x: lerp(chest.x, place.x, k), y: lerp(chest.y, place.y, k) }; cup = true; }
      else if (q < 0.7) { const k = ease(seg(q, 0.42, 0.7)); tg = { x: lerp(place.x, 30, k), y: lerp(place.y, SH + 80, k) }; }
    } else if (b.mode === 'greet' && b.f.talk > 0.2) tg = { x: 22 + Math.sin(t * 2) * 3, y: SH + 52 - Math.abs(Math.sin(t * 1.7)) * 6 };
    if (tg) {
      // lengan bawah mengarah ke depan (ke kita) → tampak memendek; siku tetap dekat badan
      const FS = 0.58; const k = ik(shR.x, shR.y, tg.x, tg.y, UPPER, (FORE - 5) * FS, 'fwd');
      const ex = shR.x - Math.sin(k.u) * UPPER; const ey = shR.y + Math.cos(k.u) * UPPER;
      const hd = { hx: ex - Math.sin(k.f) * (FORE - 5) * FS, hy: ey + Math.cos(k.f) * (FORE - 5) * FS };
      if (cup) cupAt(c, hd.hx - 2, hd.hy - 5, L);
      armFK(c, P, shR.x, shR.y, k.u, k.f, false, 1, FS);
      if (cloth2) { c.fillStyle = C(shade(L, 'b9cdd3')); c.beginPath(); c.roundRect(hd.hx - 6, hd.hy - 1, 12, 4, 1.5); c.fill(); }
    } else armFK(c, P, shR.x, shR.y, -0.1, -0.02, false);
  }
  c.restore();
}
/** Di HP: barista yang tidak berjalan digambar ke kanvas kecil yang diperbarui ±12×/detik. */
const BBOX = { x: 70, y: 300, w: 140, h: 300 };
export function drawBaristaFast(c, b, L, t, cheap = true) {
  if (!cheap || b.mode === 'walk' || b.turnT > 0 || !b.ch || !b.ch.ready) { drawBarista(c, b, L, t); return; }
  const dev = Math.abs(c.getTransform().a) || 1;
  const key = `${dev.toFixed(3)}|${b.ch === (b._cache && b._cache.ch)}`;
  let k = b._cache;
  if (!k || k.key !== key || t - k.t > 0.08 || t < k.t) {
    if (!k || k.key !== key) { const cv = (k && k.cv) || document.createElement('canvas'); cv.width = Math.ceil(BBOX.w * dev); cv.height = Math.ceil(BBOX.h * dev); k = b._cache = { cv, key: `${dev.toFixed(3)}|true`, ch: b.ch, t: -1 }; }
    const x = k.cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, k.cv.width, k.cv.height);
    x.setTransform(dev, 0, 0, dev, (BBOX.x - b.x) * dev, (BBOX.y - BARISTA_POS.foot) * dev);
    drawBarista(x, b, L, t);
    k.t = t;
  }
  c.drawImage(k.cv, b.x - BBOX.x, BARISTA_POS.foot - BBOX.y, BBOX.w, BBOX.h);
}
/** Cangkir siap diambil di konter (titik = dasar cangkir). */
export function drawCounterCup(c, cup, L) {
  const sc = depthScale(BARISTA_POS.foot) * 1.05;
  c.save(); c.translate(cup.x, cup.y); c.scale(sc, sc);
  c.fillStyle = 'rgba(30,20,12,0.18)'; c.beginPath(); c.ellipse(1, 0, 9, 2, 0, 0, TAU); c.fill();
  cupAt(c, 0, -6, L);
  c.restore();
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
  const barista = createBarista(rnd); let baristaKey = ''; let baristaNext = null;
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
    // barista dilukis lebih dulu; tokoh lama tetap tampil sampai yang baru (cahaya baru) siap
    if (key !== baristaKey) { baristaKey = key; baristaNext = makeChar({ ...BARISTA_LOOK }, ctx.L); }
    if (baristaNext) { if (!baristaNext.ready) baristaNext.step(Math.max(0.5, budget)); if (baristaNext.ready) { barista.ch = baristaNext; baristaNext = null; } }
    for (const ch of pool) { if (!ch.ready) { ch.step(Math.max(0.5, budget - (performance.now() - t0))); if (performance.now() - t0 > budget) break; } }
  }
  const freeChar = () => { const xs = pool.filter((ch) => ch.ready && !ch.stale && !people.some((p) => p.ch === ch)); return xs.length ? xs[Math.floor(rnd() * xs.length)] : null; };

  function make(ch, seat, { sitting = false } = {}) {
    const p = { id: ++id, ch, seat, pair: null, path: [], state: 'enter', t: 0, x: DOOR.x, y: DOOR.y, face: 'front', pose: 'walk', ph: rnd() * 6, alpha: 0, talk: 0, cupInHand: false, cupOnTable: false, act: null, stay: 60 + rnd() * 100, nextAct: 4 + rnd() * 6,
      food: rnd() < 0.45 ? { kind: pickOf(['croissant', 'melonpan', 'sando'], rnd), left: 1 } : null };
    if (sitting) {
      const sp = seatPos(seat);
      Object.assign(p, { state: 'sit', x: sp.x, y: sp.y, alpha: 0.01, fadeIn: true, t: rnd() * 40, cupOnTable: true });
      if (p.food) p.food.left = 0.25 + Math.floor(rnd() * 4) * 0.25;
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
    p.pose = 'walk'; p.ph += stepPhase(v / (depthScale(p.y) * p.ch.look.tall), Math.max(0.2, p.spd)); // langkah ikut jarak: kaki tidak meluncur
    const nf = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy > 0 ? 'front' : 'back');
    if (nf !== p.face && d > 1) {
      if ((nf === 'left' && p.face === 'right') || (nf === 'right' && p.face === 'left')) { p.turnT = 0.22; p.turnVia = 'front'; }
      p.face = nf;
    }
    if (d <= v) { p.x = tg.x; p.y = tg.y; p.path.shift(); if (!p.path.length) { p.spd = 0; p.settle = 1; } return !p.path.length; }
    p.x += (dx / d) * v; p.y += (dy / d) * v;
    return false;
  }
  const orderBusy = (me) => people.some((q) => q !== me && (q.state === 'order' || q.state === 'toOrder'));

  function step(dt, ctx) {
    preparePool(ctx, ctx.budget ?? 3);
    if (!seeded) seed(ctx);
    clock += dt;
    barista.step(dt, { ordering: people.some((q) => q.state === 'order') });
    nextSpawn -= dt;
    if (nextSpawn <= 0 && seeded) { spawn(ctx); nextSpawn = 9 + rnd() * 16; }
    for (const p of [...people]) {
      p.t += dt;
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.turnT > 0) p.turnT -= dt;
      if (p.settle > 0) p.settle = Math.max(0, p.settle - dt * 2.4); // langkah terakhir mengendap pelan ke posisi berdiri
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
          if (p.t > p.wait) { p.point = 0; p.state = 'toPickup'; p.path = [{ x: PICKUP.x, y: PICKUP.y }]; barista.orders++; }
          break;
        }
        case 'toPickup':
          if (walk(p, dt)) { p.state = 'pickup'; p.t = 0; p.pose = 'stand'; p.face = 'back'; p.wait = 30; }
          break;
        case 'pickup': // menunggu barista menaruh cangkirnya di konter
          if ((barista.counterCup && barista.counterCup.age > 1.2 && p.t > 0.8) || p.t > p.wait) {
            if (!barista.counterCup) barista.orders = Math.max(0, barista.orders - 1); // tidak jadi menunggu
            barista.counterCup = null; p.cupInHand = true; const sp = seatPos(p.seat); p.state = 'toSeat';
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
          p.sitK = Math.min(1, p.t / 1.4);
          if (p.sitK >= 1) { p.state = 'sit'; p.t = 0; p.act = { kind: 'place', q: 0, dur: 1.4 }; }
          break;
        case 'standUp': { // berdiri lagi, lalu berjalan ke pintu
          p.sitK = Math.max(0, 1 - p.t / 1.2);
          if (p.sitK <= 0) {
            const sp = seatPos(p.seat); const sc = seatScale(p);
            const start = p.seat.kind === 'stool' ? { x: sp.x, y: sp.y + 96 * sc } : { x: sp.x + CHAT[p.seat.i].face * 30 * sc, y: sp.y + CHAIR_FOOT * sc };
            Object.assign(p, start, { state: 'leave', pose: 'stand', path: [{ x: start.x, y: LANE }, { x: DOOR.x, y: LANE }, { x: DOOR.x, y: DOOR.y }] });
          }
          break;
        }
        case 'sit': {
          // gerakan tangan: meletakkan cangkir, sesekali minum atau makan roti; berdua: bergantian bicara
          if (p.act) {
            const q0 = p.act.q; p.act.q = Math.min(1, q0 + dt / p.act.dur);
            if (p.act.kind === 'place' && q0 < 0.55 && p.act.q >= 0.55) { p.cupInHand = false; p.cupOnTable = true; }
            if (p.act.kind === 'eat' && q0 < 0.57 && p.act.q >= 0.57 && p.food) p.food.left = Math.max(0, p.food.left - 0.25);
            if (p.act.q >= 1) p.act = null;
          } else {
            p.nextAct -= dt;
            if (p.nextAct <= 0) {
              const eat = p.food && p.food.left > 0.01 && rnd() < 0.5;
              p.act = { kind: eat ? 'eat' : 'sip', q: 0, dur: eat ? 4.8 : 4.4 }; p.nextAct = 7 + rnd() * 9;
            }
          }
          const mate = p.pair ? people.find((q) => q.id === p.pair) : null;
          if (mate && mate.state === 'sit') { const turn = Math.floor(clock / 4.5) % 2 === p.seat.i; p.talk += ((turn && !p.act ? 1 : 0.12) - p.talk) * Math.min(1, dt * 2); } else p.talk += (0 - p.talk) * Math.min(1, dt * 2);
          const leader = !mate || p.seat.i === 0;
          if (leader && p.t > p.stay && !p.act && !(mate && mate.act)) {
            [p, mate].filter(Boolean).forEach((q, k) => { q.state = 'standUp'; q.t = -k * 0.9; q.talk = 0; q.act = null; });
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
  return { step, people: sorted, get barista() { return barista; }, get count() { return people.length; }, seat: seatPos, get poolReady() { return pool.filter((ch) => ch.ready).length; } };
}

/**
 * Sama dengan drawPerson, tapi (di HP) orang yang sedang duduk/berdiri diam digambar ke kanvas kecil yang
 * diperbarui 10×/detik (cukup untuk napas & bicara pelan); saat minum/makan digambar tiap frame — menghemat banyak kerja di HP.
 * Orang yang berjalan, duduk/berdiri, atau sedang muncul/menghilang tetap digambar tiap frame.
 */
const BOX = { x: 110, y: 350, w: 220, h: 440 };
export function drawPersonFast(c, p, L, t, cheap = true) {
  const live = !cheap || p.pose === 'walk' || p.state === 'sitDown' || p.state === 'standUp' || p.turnT > 0 || p.settle > 0 || !!p.act;
  if (live) { drawPerson(c, p, L, t); return; }
  const dev = Math.abs(c.getTransform().a) || 1;
  const key = `${p.pose}|${p.face}|${dev.toFixed(3)}|${(p.s || 1).toFixed(3)}`;
  let k = p._cache;
  if (!k || k.key !== key || t - k.t > 0.1 || t < k.t) {
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
