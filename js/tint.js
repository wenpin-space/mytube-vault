// Warna aksen mengikuti thumbnail lagu yang sedang diputar.
// Thumbnail diambil dari i.ytimg.com dengan crossOrigin; kalau browser menolak membaca pikselnya,
// tampilan cukup kembali ke warna bawaan (tidak ada error yang terlihat).

import { thumbUrl } from './metadata.js';

const cache = new Map(); // videoId → [r,g,b] | null

/** Warna dominan yang "hidup" dari data piksel RGBA (murni, mudah diuji). */
export function pickColor(px) {
  let r = 0, g = 0, b = 0, w = 0;
  let fr = 0, fg = 0, fb = 0, fw = 0;
  for (let i = 0; i < px.length; i += 4) {
    const R = px[i], G = px[i + 1], B = px[i + 2];
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 510;
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
    fr += R; fg += G; fb += B; fw++;
    if (l < 0.12 || l > 0.92) continue; // terlalu gelap/terang (bar hitam, langit putih)
    const weight = sat * sat * (1 - Math.abs(l - 0.5));
    r += R * weight; g += G * weight; b += B * weight; w += weight;
  }
  if (w > fw * 0.02) return [r / w, g / w, b / w].map(Math.round);
  return fw ? [fr / fw, fg / fw, fb / fw].map(Math.round) : null;
}

/** Sesuaikan supaya terbaca sebagai aksen: saturasi cukup, terang sesuai tema. */
export function toAccent([r, g, b], dark = true) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const s2 = Math.max(s, 0.45);
  const l2 = dark ? Math.min(Math.max(l, 0.58), 0.7) : Math.min(Math.max(l, 0.38), 0.46);
  return hslToRgb(h, s < 0.08 ? s : s2, l2);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) return [l, l, l].map((x) => Math.round(x * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
}

function readColor(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const done = (c) => { cache.set(id, c); if (cache.size > 200) cache.delete(cache.keys().next().value); resolve(c); };
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = 32; cv.height = 18;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 32, 18);
        done(pickColor(ctx.getImageData(0, 0, 32, 18).data));
      } catch { done(null); } // canvas "tainted": browser tidak mengizinkan membaca piksel
    };
    img.onerror = () => done(null);
    img.src = thumbUrl(id, 'mqdefault');
  });
}

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
};

let current = null;
/** Pasang/lepas warna lagu. id = null → kembali ke warna bawaan. */
export async function applyTint(id, enabled = true) {
  current = id;
  const root = document.body;
  if (!id || !enabled) { root.classList.remove('tinted'); return; }
  const c = await readColor(id);
  if (current !== id) return; // lagu sudah berganti
  if (!c) { root.classList.remove('tinted'); return; }
  const a = toAccent(c, isDark());
  root.style.setProperty('--np-tint', `rgb(${c.join(' ')})`);
  root.style.setProperty('--np-accent', `rgb(${a.join(' ')})`);
  root.classList.add('tinted');
}
