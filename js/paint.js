// Pelukis "sapuan kuas": mengubah gambar yang digambar dengan kode menjadi seperti lukisan.
// Cara kerja: underpainting (versi buram) → beberapa lapis sapuan kuas dari besar ke kecil.
// Warna diambil dari gambar asli; arah sapuan mengikuti tepi benda (gradien Sobel), sedangkan
// area datar (langit, dinding) memakai arah aliran yang lembut. Sapuan kecil hanya di tepi/detail
// sehingga bentuk tetap terbaca. Dikerjakan bertahap (step(ms)) supaya animasi tidak tersendat.

const TAU = Math.PI * 2;
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// [jari-jari (px virtual), jarak grid, ambang tepi, peluang dipakai di area datar, alpha, panjang min, panjang maks]
const PASSES = [
  [11, 8, 0, 1, 0.55, 1.5, 2.6],
  [6, 5, 4, 0.7, 0.6, 1.6, 2.8],
  [3, 2.8, 12, 0.12, 0.6, 1.7, 3],
];

let paperTex = null;
function paper() {
  if (paperTex) return paperTex;
  const n = 256; const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const x = cv.getContext('2d'); const r = seeded(77);
  x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
  // serat kanvas: garis-garis pendek silang + bintik
  for (let i = 0; i < 2600; i++) {
    const v = Math.round(110 + r() * 40); x.strokeStyle = `rgba(${v},${v},${v},0.35)`; x.lineWidth = 1;
    const px = r() * n; const py = r() * n; const horiz = r() < 0.5; const len = 3 + r() * 9;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (horiz ? len : 0.6), py + (horiz ? 0.6 : len)); x.stroke();
  }
  const img = x.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) { const d = (r() - 0.5) * 34; img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d; }
  x.putImageData(img, 0, 0);
  paperTex = cv;
  return cv;
}

/**
 * @param {HTMLCanvasElement} src gambar asli (resolusi perangkat)
 * @param {{unit?:number, seed?:number, softEdge?:number, scale?:number}} o
 *   unit = piksel perangkat per piksel virtual; scale = pengali ukuran kuas; softEdge = buram tepi siluet
 */
export function createPainter(src, { unit = 1, seed = 1, softEdge = 0, scale = 1 } = {}) {
  const w = src.width; const h = src.height;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const o = out.getContext('2d');
  const hasFilter = typeof o.filter === 'string';
  const blurDraw = (px) => { if (hasFilter && px > 0) o.filter = `blur(${px}px)`; o.drawImage(src, 0, 0); o.filter = 'none'; };
  const applyMask = () => { o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'destination-in'; blurDraw(softEdge * unit); o.globalCompositeOperation = 'source-over'; };

  blurDraw(Math.max(1, 2.4 * unit * scale)); // underpainting
  applyMask();

  let data = null;
  try { data = src.getContext('2d').getImageData(0, 0, w, h).data; } catch { /* tanpa akses piksel → tampilkan apa adanya */ }
  if (!data || w < 4 || h < 4) { o.drawImage(src, 0, 0); return { canvas: out, done: true, progress: 1, step() { return true; } }; }

  const r = seeded(seed);
  const d = Math.max(1, Math.round(unit * 1.3));
  const lum = (x, y) => { const i = (y * w + x) * 4; return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11; };
  const flow = (x, y) => 0.32 * Math.sin((x / unit) * 0.0042 + (y / unit) * 0.0021) + 0.12 * Math.sin((y / unit) * 0.011);

  let passIdx = -1; let list = null; let pos = 0; let pass = null;
  let total = 0; let doneCount = 0; let finished = false;

  function buildPass(p) {
    const [rad, gap, thr, keep] = p;
    const step = gap * unit * scale;
    const pts = [];
    for (let y = d + 1; y < h - d - 1; y += step) {
      for (let x = d + 1; x < w - d - 1; x += step) {
        const xi = Math.round(x + (r() - 0.5) * step * 0.9);
        const yi = Math.round(y + (r() - 0.5) * step * 0.9);
        if (xi <= d || yi <= d || xi >= w - d - 1 || yi >= h - d - 1) continue;
        if (data[(yi * w + xi) * 4 + 3] < 180) continue;
        const gx = (lum(xi + d, yi - d) + 2 * lum(xi + d, yi) + lum(xi + d, yi + d)) - (lum(xi - d, yi - d) + 2 * lum(xi - d, yi) + lum(xi - d, yi + d));
        const gy = (lum(xi - d, yi + d) + 2 * lum(xi, yi + d) + lum(xi + d, yi + d)) - (lum(xi - d, yi - d) + 2 * lum(xi, yi - d) + lum(xi + d, yi - d));
        const mag = Math.hypot(gx, gy) / 4;
        if (thr && mag < thr && r() > keep) continue;
        const ang = mag > 3 ? Math.atan2(gy, gx) + Math.PI / 2 : flow(xi, yi);
        pts.push(xi, yi, ang + (r() - 0.5) * 0.3);
      }
    }
    // acak urutan supaya tidak ada pola baris
    const n = pts.length / 3;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      for (let k = 0; k < 3; k++) { const t = pts[i * 3 + k]; pts[i * 3 + k] = pts[j * 3 + k]; pts[j * 3 + k] = t; }
    }
    void rad;
    return pts;
  }

  // perkiraan jumlah total untuk progress
  for (const p of PASSES) total += ((w / (p[1] * unit * scale)) * (h / (p[1] * unit * scale))) * (p[2] ? 0.3 : 1);

  // tepi tegas: gambar asli dikembalikan hanya di tepi benda supaya bentuk tetap rapi,
  // sedangkan bidang datar (dinding, langit, meja, air) tetap bertekstur sapuan kuas.
  function edgeRestore() {
    const mw = Math.max(2, Math.floor(w / 2)); const mh = Math.max(2, Math.floor(h / 2));
    const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
    const mx = mc.getContext('2d'); const img = mx.createImageData(mw, mh); const md = img.data;
    for (let y = 1; y < mh - 1; y++) {
      const sy = y * 2;
      for (let x = 1; x < mw - 1; x++) {
        const sx = x * 2;
        const gx = lum(Math.min(w - 1, sx + d), sy) - lum(Math.max(0, sx - d), sy);
        const gy = lum(sx, Math.min(h - 1, sy + d)) - lum(sx, Math.max(0, sy - d));
        const lc = lum(sx, sy);
        const m = Math.min(255, Math.hypot(gx, gy) * 5.5 * (70 / (lc + 28))); // relatif: tepi di area gelap tetap terjaga
        const i = (y * mw + x) * 4; md[i + 3] = m;
      }
    }
    mx.putImageData(img, 0, 0);
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tx = tmp.getContext('2d');
    tx.drawImage(src, 0, 0);
    tx.globalCompositeOperation = 'destination-in';
    if (hasFilter) tx.filter = `blur(${Math.max(0.8, unit * 1.2)}px)`;
    tx.drawImage(mc, 0, 0, w, h); tx.filter = 'none';
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop'; o.globalAlpha = 0.85;
    o.drawImage(tmp, 0, 0); o.globalAlpha = 1;
  }

  function finish() {
    edgeRestore();
    o.setTransform(1, 0, 0, 1, 0, 0);
    // sedikit "bloom" lembut ala ilustrasi lofi
    if (hasFilter) { o.globalCompositeOperation = 'soft-light'; o.globalAlpha = 0.3; o.filter = `blur(${Math.max(2, 7 * unit)}px)`; o.drawImage(out, 0, 0); o.filter = 'none'; }
    o.globalAlpha = 0.5; o.globalCompositeOperation = 'soft-light';
    o.fillStyle = o.createPattern(paper(), 'repeat'); o.fillRect(0, 0, w, h);
    o.globalAlpha = 1;
    applyMask();
    finished = true; data = null; list = null;
  }

  function step(ms = 8) {
    if (finished) return true;
    const t0 = performance.now();
    o.globalCompositeOperation = 'source-atop';
    while (performance.now() - t0 < ms) {
      if (!list || pos >= list.length) {
        passIdx++;
        if (passIdx >= PASSES.length) { finish(); return true; }
        pass = PASSES[passIdx]; list = buildPass(pass); pos = 0;
        o.globalCompositeOperation = 'source-atop';
        continue;
      }
      const [rad, , , , alpha, lmin, lmax] = pass;
      const end = Math.min(list.length, pos + 3 * 400);
      o.globalAlpha = alpha;
      for (; pos < end; pos += 3) {
        const x = list[pos]; const y = list[pos + 1]; const a = list[pos + 2];
        const i = (y * w + x) * 4; const i2 = ((y + d) * w + x) * 4; const i3 = (y * w + x + d) * 4;
        const k = 1 + (r() - 0.5) * 0.09; const warm = (r() - 0.5) * 7;
        const R = ((data[i] * 2 + data[i2] + data[i3]) / 4) * k + warm;
        const G = ((data[i + 1] * 2 + data[i2 + 1] + data[i3 + 1]) / 4) * k;
        const B = ((data[i + 2] * 2 + data[i2 + 2] + data[i3 + 2]) / 4) * k - warm;
        const rr = rad * unit * scale * (0.8 + r() * 0.4);
        const len = rr * (lmin + r() * (lmax - lmin)); const wid = rr * (0.55 + r() * 0.25);
        const ca = Math.cos(a); const sa = Math.sin(a);
        o.setTransform(ca * len, sa * len, -sa * wid, ca * wid, x, y);
        o.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
        o.beginPath(); o.arc(0, 0, 1, 0, TAU); o.fill();
        doneCount++;
      }
      o.setTransform(1, 0, 0, 1, 0, 0);
    }
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    api.progress = Math.min(0.99, doneCount / (total || 1));
    return false;
  }

  const api = { canvas: out, get done() { return finished; }, progress: 0, step, finishNow() { while (!step(50)); } };
  return api;
}
