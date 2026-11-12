// Dekorasi musiman di Lobby (Kamar santai & Kafe), muncul sendiri menurut tanggal di perangkat:
//   Natal (1–26 Des)        : rangkaian daun cemara + bola hias di atas jendela, karangan bunga di kaca
//   Tahun Baru (27 Des–2 Jan): kembang api di luar jendela (paling ramai malam 31 Des & 1 Jan)
//   Imlek (H-5 s.d. Cap Go Meh): lampion merah bergoyang
//   Lebaran (H-3 s.d. H+7)  : ketupat bergantung + lampu bulan sabit & bintang
//   Agustus (17-an)          : rangkaian bendera merah putih kecil
// Semua digambar di ruang virtual 1600×900 yang sama dengan kamar (lihat paintkit.js). Bagian yang
// diam dilukis sekali ke kanvas kecil (cache), per frame hanya digambar ulang + goyangan & cahaya.

import { W, OW, HZ, VW } from './paintkit.js';

const TAU = Math.PI * 2;
const DAY = 86400e3;
// Tanggal Imlek & Idulfitri (Indonesia). Idulfitri 2028+ masih perkiraan; rentang hiasannya beberapa hari
// sehingga selisih satu-dua hari tidak terasa.
const IMLEK = ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03', '2031-01-23', '2032-02-11', '2033-01-31'];
const LEBARAN = ['2026-03-21', '2027-03-10', '2028-02-26', '2029-02-14', '2030-02-05', '2031-01-25', '2032-01-14', '2033-01-03'];

export const SEASONS = {
  natal: { name: 'Natal', greet: 'Selamat Natal' },
  tahunbaru: { name: 'Tahun Baru', greet: 'Selamat Tahun Baru' },
  imlek: { name: 'Imlek', greet: 'Gong Xi Fa Cai' },
  lebaran: { name: 'Lebaran', greet: 'Selamat Idulfitri' },
  merdeka: { name: 'Agustusan', greet: 'Dirgahayu Indonesia' },
};

const local = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - b) / DAY);

/** Musim dekorasi untuk tanggal (waktu lokal). Hasil: { id, peak } atau null. peak = puncak perayaan (hari H). */
export function seasonFor(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const found = [];
  for (const [list, id, before, after] of [[IMLEK, 'imlek', 5, 15], [LEBARAN, 'lebaran', 3, 7]]) {
    for (const iso of list) {
      const diff = dayDiff(date, local(iso));
      if (diff >= -before && diff <= after) found.push({ id, dist: Math.abs(diff), peak: diff >= 0 && diff <= 1 });
    }
  }
  if (found.length) { found.sort((a, b) => a.dist - b.dist); return { id: found[0].id, peak: found[0].peak }; }
  if ((m === 12 && d >= 27) || (m === 1 && d <= 2)) return { id: 'tahunbaru', peak: (m === 12 && d === 31) || (m === 1 && d === 1) };
  if (m === 12 && d <= 26) return { id: 'natal', peak: d === 24 || d === 25 };
  if (m === 8) return { id: 'merdeka', peak: d === 17 };
  return null;
}

// ------------------------------------------------------------------ alat gambar kecil
const rnd = (a, b) => a + Math.random() * (b - a);
const mkCanvas = (w, h) => {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return [cv, cv.getContext('2d')];
};
function glow(c, x, y, r, rgb, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
/** Titik-titik sepanjang lengkung tali (rantai) dari x0 ke x1. */
function swagPoints(x0, x1, y, sag, n) {
  return Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [x0 + (x1 - x0) * u, y + Math.sin(u * Math.PI) * sag]; });
}
const SWAGS = [[W.x - 6, W.x + W.w / 2, 46], [W.x + W.w / 2, W.x + W.w + 6, 46]];
const TOP = W.y + 6;

// ------------------------------------------------------------------ Natal
function paintNatal() {
  const [cv, c] = mkCanvas(VW, 420);
  // rangkaian cemara: banyak goresan jarum pendek di sepanjang tali
  for (const [x0, x1, sag] of SWAGS) {
    const pts = swagPoints(x0, x1, TOP, sag, 120);
    for (const [x, y] of pts) {
      for (let k = 0; k < 9; k++) {
        const a = rnd(0, TAU); const l = rnd(8, 17);
        c.strokeStyle = `hsl(${rnd(128, 150)} ${rnd(30, 45)}% ${rnd(14, 30)}%)`;
        c.lineWidth = rnd(1.4, 2.6); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.75); c.stroke();
      }
    }
  }
  // karangan bunga di kaca tengah atas
  const cx = W.x + W.w / 2; const cy = W.y + 132; const R = 46;
  c.strokeStyle = 'rgba(200,40,40,0.9)'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, TOP + 40); c.lineTo(cx, cy - R); c.stroke();
  for (let i = 0; i < 260; i++) {
    const a = rnd(0, TAU); const r = R + rnd(-12, 12);
    const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r;
    c.fillStyle = `hsl(${rnd(125, 150)} ${rnd(30, 50)}% ${rnd(13, 30)}%)`;
    c.save(); c.translate(x, y); c.rotate(a + rnd(-0.8, 0.8)); c.beginPath(); c.ellipse(0, 0, rnd(5, 9), rnd(2, 3.4), 0, 0, TAU); c.fill(); c.restore();
  }
  for (let i = 0; i < 14; i++) { const a = rnd(0, TAU); const r = R + rnd(-8, 8); c.fillStyle = '#c3262c'; c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3.2, 0, TAU); c.fill(); }
  // pita merah
  c.fillStyle = '#b8232a';
  c.beginPath(); c.moveTo(cx, cy + R - 4); c.quadraticCurveTo(cx - 30, cy + R - 26, cx - 28, cy + R + 4); c.quadraticCurveTo(cx - 14, cy + R + 2, cx, cy + R - 4); c.fill();
  c.beginPath(); c.moveTo(cx, cy + R - 4); c.quadraticCurveTo(cx + 30, cy + R - 26, cx + 28, cy + R + 4); c.quadraticCurveTo(cx + 14, cy + R + 2, cx, cy + R - 4); c.fill();
  c.beginPath(); c.moveTo(cx - 4, cy + R); c.lineTo(cx - 14, cy + R + 30); c.lineTo(cx - 6, cy + R + 26); c.lineTo(cx, cy + R + 32); c.lineTo(cx + 6, cy + R + 26); c.lineTo(cx + 14, cy + R + 30); c.lineTo(cx + 4, cy + R); c.fill();
  c.fillStyle = '#8f1a20'; c.beginPath(); c.arc(cx, cy + R - 3, 5, 0, TAU); c.fill();
  // bola hias (posisi disimpan untuk kilau malam)
  const balls = [];
  const cols = [['#c62f35', '232,80,80'], ['#d9a83a', '255,210,120'], ['#c9d1da', '220,230,245'], ['#2f6fb0', '120,170,240']];
  SWAGS.forEach(([x0, x1, sag], s) => {
    swagPoints(x0, x1, TOP, sag, 8).slice(1, -1).forEach(([x, y], i) => {
      const [fill, rgb] = cols[(i + s) % cols.length];
      const by = y + 16;
      c.strokeStyle = 'rgba(120,100,80,0.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x, by - 7); c.stroke();
      const g = c.createRadialGradient(x - 2.5, by - 3, 1, x, by, 8);
      g.addColorStop(0, '#fff'); g.addColorStop(0.25, fill); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = g; c.beginPath(); c.arc(x, by, 7.5, 0, TAU); c.fill();
      c.fillStyle = '#b9a07a'; c.fillRect(x - 2, by - 9, 4, 3);
      balls.push([x, by, rgb]);
    });
  });
  return { cv, balls };
}

// ------------------------------------------------------------------ Imlek
function paintLantern(scale = 1) {
  const w = Math.round(90 * scale); const h = Math.round(150 * scale);
  const [cv, c] = mkCanvas(w, h);
  c.scale(scale, scale);
  const cx = 45; const cy = 62;
  c.fillStyle = '#c99a2e'; c.fillRect(cx - 18, 18, 36, 8); c.fillRect(cx - 18, 96, 36, 8);
  const g = c.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 42);
  g.addColorStop(0, '#ff5a3c'); g.addColorStop(0.6, '#d7261e'); g.addColorStop(1, '#7d0f10');
  c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy, 40, 37, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(110,10,10,0.55)'; c.lineWidth = 1.6;
  for (const k of [-0.75, -0.4, 0, 0.4, 0.75]) { c.beginPath(); c.ellipse(cx, cy, Math.abs(40 * k) || 0.5, 37, 0, 0, TAU); c.stroke(); }
  c.fillStyle = '#e5b84a'; c.beginPath(); c.moveTo(cx, cy - 13); c.lineTo(cx + 13, cy); c.lineTo(cx, cy + 13); c.lineTo(cx - 13, cy); c.fill();
  c.strokeStyle = '#c99a2e'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, 18); c.stroke();
  // jumbai
  c.strokeStyle = '#d23a2a'; c.lineWidth = 1.4;
  for (let i = -7; i <= 7; i += 2) { c.beginPath(); c.moveTo(cx + i * 0.8, 104); c.lineTo(cx + i * 1.1, 140); c.stroke(); }
  c.fillStyle = '#c99a2e'; c.fillRect(cx - 5, 103, 10, 8);
  return cv;
}

// ------------------------------------------------------------------ Lebaran
function paintKetupat() {
  const [cv, c] = mkCanvas(90, 170);
  const cx = 45; const cy = 62; const r = 34;
  c.save(); c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.closePath(); c.clip();
  c.fillStyle = '#7fae3c'; c.fillRect(0, 0, 90, 170);
  for (let i = -6; i <= 6; i++) {
    c.fillStyle = i % 2 ? 'rgba(220,214,120,0.75)' : 'rgba(70,120,40,0.55)';
    c.save(); c.translate(cx, cy); c.rotate(Math.PI / 4); c.fillRect(i * 8 - 3, -60, 6, 120); c.restore();
    c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 4); c.globalAlpha = 0.6; c.fillRect(i * 8 - 3, -60, 6, 120); c.restore();
  }
  c.restore();
  c.strokeStyle = 'rgba(60,90,30,0.8)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.closePath(); c.stroke();
  // ekor janur
  c.strokeStyle = '#8fbe48'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - 4, cy + r - 4); c.quadraticCurveTo(cx - 14, cy + r + 30, cx - 6, cy + r + 70); c.stroke();
  c.beginPath(); c.moveTo(cx + 4, cy + r - 4); c.quadraticCurveTo(cx + 16, cy + r + 34, cx + 8, cy + r + 62); c.stroke();
  c.strokeStyle = '#b39468'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, cy - r); c.stroke();
  return cv;
}
function moonStar(c, x, y, a, lit) {
  c.save(); c.translate(x, y);
  c.strokeStyle = `rgba(255,226,160,${0.55 + 0.45 * lit})`; c.lineWidth = 3.2; c.lineCap = 'round';
  c.beginPath(); c.arc(0, 0, 30, -1.1, 1.1 + Math.PI, false); c.arc(9, -5, 25, 1.1 + Math.PI - 0.12, -1.1 + 0.12, true); c.stroke();
  c.translate(26, -10); c.rotate(a);
  c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 9; const t = (i * Math.PI) / 5 - Math.PI / 2; c.lineTo(Math.cos(t) * r, Math.sin(t) * r); } c.closePath(); c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ kembang api (Tahun Baru)
const FW_COLS = ['255,200,90', '255,110,120', '140,200,255', '190,255,170', '255,160,240', '255,255,235'];

export function createDecor() {
  let cache = { id: null };
  let rockets = [];
  let sparks = [];
  let nextFw = 1;

  function ensure(id) {
    if (cache.id === id) return cache;
    cache = { id };
    if (id === 'natal') Object.assign(cache, paintNatal());
    if (id === 'imlek') { cache.big = paintLantern(1); cache.small = paintLantern(0.72); }
    if (id === 'lebaran') cache.ketupat = paintKetupat();
    rockets = []; sparks = [];
    return cache;
  }

  /** Di luar jendela (dipanggil di dalam klip kaca, sebelum hujan). */
  function outside(c, t, dt, { season, night }) {
    if (!season || season.id !== 'tahunbaru') return;
    nextFw -= dt;
    if (nextFw <= 0) {
      nextFw = season.peak && night ? rnd(0.25, 0.9) : night ? rnd(0.9, 2.4) : rnd(2.5, 5);
      rockets.push({ x: rnd(OW.x + 80, OW.x + OW.w - 80), y: HZ + 30, vy: -rnd(360, 460), top: rnd(W.y + 50, HZ - 120), col: FW_COLS[Math.floor(Math.random() * FW_COLS.length)] });
    }
    const a0 = night ? 1 : 0.4;
    c.save(); c.globalCompositeOperation = 'lighter';
    rockets = rockets.filter((r) => {
      r.y += r.vy * dt;
      c.fillStyle = `rgba(255,230,190,${0.8 * a0})`; c.fillRect(r.x - 1, r.y, 2, 9);
      if (r.y > r.top) return true;
      const n = Math.round(rnd(48, 80));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-0.05, 0.05); const v = rnd(90, 210);
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(1.4, 2.3), age: 0, col: Math.random() < 0.2 ? '255,255,235' : r.col });
      }
      sparks.push({ flash: true, x: r.x, y: r.y, age: 0, life: 0.35, col: r.col });
      return false;
    });
    sparks = sparks.filter((s) => {
      s.age += dt;
      if (s.age >= s.life) return false;
      const k = 1 - s.age / s.life;
      if (s.flash) { glow(c, s.x, s.y, 140, s.col, 0.5 * k * a0); return true; }
      s.vx *= 1 - 1.4 * dt; s.vy = s.vy * (1 - 1.4 * dt) + 55 * dt;
      const px = s.x; const py = s.y;
      s.x += s.vx * dt; s.y += s.vy * dt;
      c.strokeStyle = `rgba(${s.col},${Math.min(1, k * 1.3) * a0})`; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(px - s.vx * 0.05, py - s.vy * 0.05); c.lineTo(s.x, s.y); c.stroke();
      return true;
    });
    if (sparks.length > 1500) sparks.splice(0, sparks.length - 1500);
    c.restore();
  }

  /** Di dalam ruangan, di depan jendela (dipanggil dengan transformasi ruang virtual). */
  function inside(c, t, { season, night, lf = night ? 1 : 0 }) {
    if (!season) return;
    const k = ensure(season.id);
    const lit = Math.max(lf, night ? 1 : 0);
    if (season.id === 'natal') {
      c.drawImage(k.cv, 0, 0);
      if (lit > 0.01) {
        c.save(); c.globalCompositeOperation = 'lighter';
        k.balls.forEach(([x, y, rgb], i) => glow(c, x, y, 18, rgb, (0.22 + 0.12 * Math.sin(t * 1.3 + i)) * lit));
        c.restore();
      }
    } else if (season.id === 'imlek') {
      const hang = (img, x, len, ph) => {
        const a = Math.sin(t * 0.8 + ph) * 0.05;
        c.save(); c.translate(x, TOP - 8); c.rotate(a);
        c.strokeStyle = '#7a5a32'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, len); c.stroke();
        c.drawImage(img, -img.width / 2, len);
        if (lit > 0.01) { c.globalCompositeOperation = 'lighter'; glow(c, 0, len + img.height * 0.42, img.width * 0.9, '255,90,50', 0.32 * lit); c.globalCompositeOperation = 'source-over'; }
        c.restore();
      };
      hang(k.big, W.x + 110, 18, 0);
      hang(k.small, W.x + 230, 60, 1.7);
      hang(k.small, W.x + W.w - 230, 60, 2.6);
      hang(k.big, W.x + W.w - 110, 18, 0.9);
    } else if (season.id === 'lebaran') {
      for (const [x, ph] of [[W.x + 130, 0], [W.x + W.w - 130, 1.3]]) {
        c.save(); c.translate(x, TOP - 8); c.rotate(Math.sin(t * 0.7 + ph) * 0.06);
        c.drawImage(k.ketupat, -45, 0); c.restore();
      }
      const mx = W.x + W.w / 2; const my = W.y + 70;
      c.strokeStyle = 'rgba(120,100,80,0.8)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(mx, TOP - 8); c.lineTo(mx, my - 30); c.stroke();
      const tw = 0.75 + 0.25 * Math.sin(t * 2.1);
      moonStar(c, mx, my, Math.sin(t * 0.6) * 0.15, lit * tw);
      if (lit > 0.01) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, mx + 8, my, 80, '255,215,140', 0.22 * lit * tw); c.restore(); }
    } else if (season.id === 'merdeka') {
      for (const [x0, x1, sag] of SWAGS) {
        const pts = swagPoints(x0, x1, TOP, sag * 0.8, 12);
        c.strokeStyle = 'rgba(90,80,70,0.9)'; c.lineWidth = 1.4;
        c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
        pts.slice(0, -1).forEach(([x, y], i) => {
          const fw = 24; const fh = 30; const sk = Math.sin(t * 1.6 + i * 0.9 + x * 0.01) * 0.12;
          c.save(); c.translate(x + 6, y); c.transform(1, 0, sk, 1, 0, 0);
          c.fillStyle = '#d42a2a'; c.fillRect(0, 0, fw, fh / 2);
          c.fillStyle = '#f3efe6'; c.fillRect(0, fh / 2, fw, fh / 2);
          c.restore();
        });
      }
    }
  }

  return { outside, inside };
}
