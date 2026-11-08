// Latar animasi Lobby (canvas). Gaya sengaja beragam: hujan realistis di kaca, ilustrasi vektor senja,
// cahaya lembut (aurora), langit malam, api unggun partikel, pantai, dan kota bergaya pixel art.
// Semua digambar dengan kode — tanpa gambar dari luar.

import { roomScene } from './room.js';

export const SCENES = [
  { id: 'room', name: 'Kamar santai', style: 'Ilustrasi detail · lokasi & cuaca' },
  { id: 'rain', name: 'Hujan di jendela', style: 'Realistis' },
  { id: 'sunset', name: 'Senja di bukit', style: 'Ilustrasi vektor' },
  { id: 'aurora', name: 'Aurora', style: 'Cahaya lembut' },
  { id: 'stars', name: 'Langit malam', style: 'Bintang' },
  { id: 'campfire', name: 'Api unggun', style: 'Partikel' },
  { id: 'beach', name: 'Pantai senja', style: 'Gradasi' },
  { id: 'city', name: 'Kota retro', style: 'Pixel art' },
  { id: 'snow', name: 'Salju', style: 'Partikel' },
  { id: 'song', name: 'Thumbnail lagu', style: 'Foto buram' },
  { id: 'custom', name: 'Gambar sendiri', style: 'Unggahan' },
];

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/** Punggung bukit acak (midpoint displacement) → array tinggi 0..1 sepanjang n titik. */
export function ridge(n, rough = 0.5, rnd = Math.random) {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, n - 1)));
  const h = new Array(size + 1).fill(0);
  h[0] = rnd(); h[size] = rnd();
  let step = size;
  let amp = 0.5;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < size; i += step) h[i] = (h[i - half] + h[i + half]) / 2 + (rnd() - 0.5) * amp;
    step = half;
    amp *= rough;
  }
  const min = Math.min(...h);
  const max = Math.max(...h);
  return h.slice(0, n).map((x) => (x - min) / (max - min || 1));
}

function lerpColor(a, b, t) {
  const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
  const pb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

// ===================================================================== scene: hujan di jendela
function rainScene() {
  let lights = [];
  let drops = [];
  let streaks = [];
  let fog = null;
  return {
    init(w, h, low) {
      lights = Array.from({ length: low ? 22 : 46 }, () => ({
        x: rand(0, w), y: rand(h * 0.35, h * 1.05), r: rand(18, 70) * (w / 1400 + 0.4),
        c: [[255, 190, 120], [255, 120, 90], [120, 180, 255], [255, 230, 160], [180, 120, 255]][Math.floor(rand(0, 5))],
        a: rand(0.15, 0.45), ph: rand(0, TAU), sp: rand(0.2, 0.8),
      }));
      drops = Array.from({ length: low ? 70 : 160 }, () => newDrop(w, h, true));
      streaks = Array.from({ length: low ? 60 : 140 }, () => ({ x: rand(0, w), y: rand(0, h), l: rand(12, 30), v: rand(500, 900) }));
      fog = null;
    },
    draw(c, dt, t, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#070b18'); g.addColorStop(0.55, '#141a33'); g.addColorStop(1, '#2a2340');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // lampu kota buram (bokeh)
      c.globalCompositeOperation = 'lighter';
      for (const L of lights) {
        const a = L.a * (0.75 + 0.25 * Math.sin(t * L.sp + L.ph));
        const rg = c.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
        rg.addColorStop(0, `rgba(${L.c},${a})`); rg.addColorStop(0.6, `rgba(${L.c},${a * 0.35})`); rg.addColorStop(1, `rgba(${L.c},0)`);
        c.fillStyle = rg; c.beginPath(); c.arc(L.x, L.y, L.r, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      // hujan di luar kaca
      c.strokeStyle = 'rgba(180,200,255,0.12)'; c.lineWidth = 1;
      c.beginPath();
      for (const s of streaks) {
        s.y += s.v * dt; s.x -= s.v * dt * 0.12;
        if (s.y > h) { s.y = -s.l; s.x = rand(0, w * 1.1); }
        c.moveTo(s.x, s.y); c.lineTo(s.x - s.l * 0.12, s.y + s.l);
      }
      c.stroke();
      // embun tipis
      if (!fog) { fog = c.createLinearGradient(0, 0, 0, h); fog.addColorStop(0, 'rgba(160,170,210,0.05)'); fog.addColorStop(1, 'rgba(160,170,210,0.12)'); }
      c.fillStyle = fog; c.fillRect(0, 0, w, h);
      // tetes di kaca
      for (const d of drops) {
        if (d.slide) {
          d.v = Math.min(d.v + 60 * dt, d.max);
          d.y += d.v * dt; d.x += Math.sin(d.y * 0.05 + d.ph) * 0.15;
          d.trail.push([d.x, d.y]); if (d.trail.length > 26) d.trail.shift();
          if (d.y > h + 20) Object.assign(d, newDrop(w, h, false));
        } else if (Math.random() < 0.0009) { d.slide = true; d.v = 0; d.max = rand(60, 220); }
        if (d.trail.length > 2) {
          c.strokeStyle = 'rgba(200,215,255,0.10)'; c.lineWidth = d.r * 0.7; c.lineCap = 'round';
          c.beginPath(); c.moveTo(d.trail[0][0], d.trail[0][1]);
          for (const [x, y] of d.trail) c.lineTo(x, y);
          c.stroke();
        }
        const rg = c.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.4, 0, d.x, d.y, d.r);
        rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.5, 'rgba(170,190,240,0.18)'); rg.addColorStop(1, 'rgba(20,25,45,0.35)');
        c.fillStyle = rg; c.beginPath(); c.ellipse(d.x, d.y, d.r * 0.85, d.r, 0, 0, TAU); c.fill();
      }
      // bingkai jendela
      c.fillStyle = 'rgba(8,8,14,0.92)';
      const fw = Math.max(10, w * 0.012);
      c.fillRect(w / 2 - fw / 2, 0, fw, h);
      c.fillRect(0, h * 0.42, w, fw);
      c.fillRect(0, 0, w, fw * 1.6); c.fillRect(0, h - fw * 2.4, w, fw * 2.4);
      c.fillRect(0, 0, fw * 1.6, h); c.fillRect(w - fw * 1.6, 0, fw * 1.6, h);
    },
  };
  function newDrop(w, h, anywhere) {
    return { x: rand(0, w), y: anywhere ? rand(0, h) : rand(-h * 0.2, h * 0.3), r: rand(1.5, 5.5), slide: false, v: 0, max: 0, trail: [], ph: rand(0, TAU) };
  }
}

// ===================================================================== scene: senja di bukit (vektor)
function sunsetScene() {
  let layers = [];
  let clouds = [];
  let birds = [];
  return {
    init(w, h) {
      const cols = ['#5b3a6b', '#3f2a57', '#2b1f44', '#1a1430'];
      layers = cols.map((col, i) => ({ col, pts: ridge(65, 0.55), base: h * (0.52 + i * 0.1), amp: h * (0.22 - i * 0.035), off: 0, sp: 3 + i * 5 }));
      clouds = Array.from({ length: 6 }, (_, i) => ({ x: rand(0, w), y: rand(h * 0.08, h * 0.35), s: rand(0.6, 1.4) * (w / 1400 + 0.5), v: rand(4, 12), i }));
      birds = [];
    },
    draw(c, dt, t, w, h) {
      const k = (Math.sin(t / 60) + 1) / 2; // langit berubah pelan
      const g = c.createLinearGradient(0, 0, 0, h * 0.75);
      g.addColorStop(0, lerpColor('2d2a6e', '3b2f7a', k));
      g.addColorStop(0.45, lerpColor('c2577a', 'd86f6f', k));
      g.addColorStop(0.8, lerpColor('f6a46b', 'ffc27a', k));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // matahari
      const sx = w * 0.62;
      const sy = h * (0.5 + 0.03 * Math.sin(t / 40));
      const sr = Math.min(w, h) * 0.09;
      const glow = c.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4);
      glow.addColorStop(0, 'rgba(255,220,150,0.55)'); glow.addColorStop(1, 'rgba(255,200,140,0)');
      c.fillStyle = glow; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffe2a8'; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
      // awan
      for (const cl of clouds) {
        cl.x += cl.v * dt; if (cl.x > w + 200) cl.x = -200;
        c.fillStyle = 'rgba(255,215,220,0.35)';
        for (let j = 0; j < 4; j++) { c.beginPath(); c.ellipse(cl.x + j * 38 * cl.s, cl.y + Math.sin(j * 1.7) * 6 * cl.s, 46 * cl.s, 18 * cl.s, 0, 0, TAU); c.fill(); }
      }
      // burung sesekali
      if (Math.random() < dt * 0.04 && birds.length < 6) {
        const y = rand(h * 0.15, h * 0.4);
        for (let b = 0; b < 3; b++) birds.push({ x: -40 - b * 26, y: y + b * 10, v: rand(40, 60), ph: rand(0, TAU) });
      }
      c.strokeStyle = 'rgba(40,20,50,0.7)'; c.lineWidth = 2;
      birds = birds.filter((b) => b.x < w + 50);
      for (const b of birds) {
        b.x += b.v * dt;
        const f = Math.sin(t * 8 + b.ph) * 4;
        c.beginPath(); c.moveTo(b.x - 8, b.y - f); c.quadraticCurveTo(b.x - 3, b.y - 2, b.x, b.y); c.quadraticCurveTo(b.x + 3, b.y - 2, b.x + 8, b.y - f); c.stroke();
      }
      // bukit berlapis (parallax)
      for (const L of layers) {
        L.off = (L.off + L.sp * dt) % w;
        c.fillStyle = L.col;
        c.beginPath(); c.moveTo(0, h);
        const n = L.pts.length - 1;
        for (let i = 0; i <= n * 2; i++) {
          const x = (i / n) * w - L.off;
          const y = L.base - L.pts[i % n] * L.amp;
          if (x > -w / n && x < w + w / n) c.lineTo(x, y);
        }
        c.lineTo(w, h); c.closePath(); c.fill();
      }
    },
  };
}

// ===================================================================== scene: aurora (cahaya lembut)
function auroraScene() {
  let blobs = [];
  let dust = [];
  return {
    init(w, h, low) {
      const cols = [[64, 224, 208], [120, 90, 255], [255, 110, 180], [80, 160, 255]];
      blobs = cols.map((col, i) => ({ col, ax: rand(0.2, 0.45), ay: rand(0.15, 0.35), fx: rand(0.02, 0.05), fy: rand(0.02, 0.05), ph: i * 1.7, r: Math.max(w, h) * rand(0.35, 0.55) }));
      dust = Array.from({ length: low ? 40 : 110 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.5, 1.8), v: rand(6, 20), a: rand(0.2, 0.7) }));
    },
    draw(c, dt, t, w, h) {
      c.fillStyle = '#060814'; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
        const x = w * (0.5 + b.ax * Math.sin(t * b.fx * TAU * 0.3 + b.ph));
        const y = h * (0.45 + b.ay * Math.cos(t * b.fy * TAU * 0.3 + b.ph * 1.3));
        const rg = c.createRadialGradient(x, y, 0, x, y, b.r);
        rg.addColorStop(0, `rgba(${b.col},0.30)`); rg.addColorStop(0.5, `rgba(${b.col},0.10)`); rg.addColorStop(1, `rgba(${b.col},0)`);
        c.fillStyle = rg; c.fillRect(0, 0, w, h);
      }
      c.globalCompositeOperation = 'source-over';
      for (const d of dust) {
        d.y -= d.v * dt; if (d.y < -5) { d.y = h + 5; d.x = rand(0, w); }
        c.fillStyle = `rgba(255,255,255,${d.a * (0.6 + 0.4 * Math.sin(t + d.x))})`;
        c.beginPath(); c.arc(d.x, d.y, d.r, 0, TAU); c.fill();
      }
    },
  };
}

// ===================================================================== scene: langit malam
function starsScene() {
  let stars = [];
  let shoot = null;
  let hills = [];
  return {
    init(w, h, low) {
      stars = Array.from({ length: low ? 160 : 380 }, () => ({ x: rand(0, w), y: rand(0, h * 0.8), r: Math.pow(Math.random(), 3) * 1.8 + 0.3, ph: rand(0, TAU), sp: rand(0.5, 2) }));
      hills = [ridge(33, 0.5), ridge(33, 0.6)];
      shoot = null;
    },
    draw(c, dt, t, w, h, st) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#02030a'); g.addColorStop(0.6, '#0b1233'); g.addColorStop(1, '#1b2050');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (const s of stars) {
        const a = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
        c.fillStyle = `rgba(255,255,240,${0.25 + a * 0.75})`;
        c.fillRect(s.x, s.y, s.r, s.r);
      }
      // bulan
      const mx = w * 0.78; const my = h * 0.22; const mr = Math.min(w, h) * 0.06;
      const glow = c.createRadialGradient(mx, my, mr, mx, my, mr * 5);
      glow.addColorStop(0, 'rgba(230,235,255,0.25)'); glow.addColorStop(1, 'rgba(230,235,255,0)');
      c.fillStyle = glow; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f2f0e6'; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
      c.fillStyle = 'rgba(180,175,160,0.35)';
      [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.35, 0.12]].forEach(([dx, dy, rr]) => { c.beginPath(); c.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, TAU); c.fill(); });
      // bintang jatuh
      if (!shoot && Math.random() < dt * 0.08) shoot = { x: rand(w * 0.1, w * 0.7), y: rand(0, h * 0.3), vx: rand(500, 800), vy: rand(150, 300), life: 1 };
      if (shoot) {
        shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.life -= dt * 1.4;
        const lg = c.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 0.15, shoot.y - shoot.vy * 0.15);
        lg.addColorStop(0, `rgba(255,255,255,${Math.max(0, shoot.life)})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
        c.strokeStyle = lg; c.lineWidth = 2; c.beginPath(); c.moveTo(shoot.x, shoot.y); c.lineTo(shoot.x - shoot.vx * 0.15, shoot.y - shoot.vy * 0.15); c.stroke();
        if (shoot.life <= 0) shoot = null;
      }
      // bukit
      ['#0a0e24', '#05070f'].forEach((col, i) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
        hills[i].forEach((v, k) => c.lineTo((k / (hills[i].length - 1)) * w, h * (0.78 + i * 0.08) - v * h * (0.12 - i * 0.03)));
        c.lineTo(w, h); c.fill();
      });
      if (st && st.dim) { c.fillStyle = `rgba(0,0,0,${st.dim})`; c.fillRect(0, 0, w, h); }
    },
  };
}

// ===================================================================== scene: api unggun
function campfireScene() {
  let flames = [];
  let sparks = [];
  let flies = [];
  let trees = [];
  let stars = [];
  return {
    init(w, h, low) {
      flames = []; sparks = [];
      flies = Array.from({ length: low ? 10 : 24 }, () => ({ x: rand(0, w), y: rand(h * 0.35, h * 0.85), vx: rand(-15, 15), vy: rand(-10, 10), ph: rand(0, TAU) }));
      trees = [];
      for (let layer = 0; layer < 2; layer++) {
        for (let x = -40; x < w + 60; x += rand(40, 90) - layer * 15) trees.push({ x, layer, hgt: rand(0.25, 0.45) * h * (1 - layer * 0.25), wd: rand(40, 70) * (1 - layer * 0.2) });
      }
      stars = Array.from({ length: low ? 60 : 140 }, () => ({ x: rand(0, w), y: rand(0, h * 0.45), r: rand(0.4, 1.4), ph: rand(0, TAU) }));
    },
    draw(c, dt, t, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#050816'); g.addColorStop(0.6, '#0e1426'); g.addColorStop(1, '#141018');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (const s of stars) { c.fillStyle = `rgba(255,255,230,${0.35 + 0.35 * Math.sin(t * 1.5 + s.ph)})`; c.fillRect(s.x, s.y, s.r, s.r); }
      // pohon pinus siluet
      for (const tr of trees) {
        c.fillStyle = tr.layer ? '#070a12' : '#0c1220';
        const base = h * (0.72 + tr.layer * 0.06);
        for (let k = 0; k < 4; k++) {
          const y0 = base - (k / 4) * tr.hgt;
          const ww = tr.wd * (1 - k * 0.2);
          c.beginPath(); c.moveTo(tr.x - ww / 2, y0); c.lineTo(tr.x, y0 - tr.hgt * 0.42); c.lineTo(tr.x + ww / 2, y0); c.fill();
        }
      }
      c.fillStyle = '#07060a'; c.fillRect(0, h * 0.8, w, h * 0.2);
      // api
      const fx = w / 2; const fy = h * 0.86; const scale = Math.min(w, h) / 700;
      const flick = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
      const glow = c.createRadialGradient(fx, fy, 10, fx, fy, 380 * scale * flick);
      glow.addColorStop(0, 'rgba(255,140,50,0.45)'); glow.addColorStop(1, 'rgba(255,100,30,0)');
      c.fillStyle = glow; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3a2416'; c.lineWidth = 14 * scale; c.lineCap = 'round';
      c.beginPath(); c.moveTo(fx - 60 * scale, fy + 18 * scale); c.lineTo(fx + 50 * scale, fy - 4 * scale); c.moveTo(fx + 60 * scale, fy + 18 * scale); c.lineTo(fx - 50 * scale, fy - 4 * scale); c.stroke();
      const spawn = Math.min(6, Math.round(dt * 260));
      for (let i = 0; i < spawn; i++) flames.push({ x: fx + rand(-26, 26) * scale, y: fy - rand(0, 8) * scale, vx: rand(-10, 10), vy: rand(-130, -70) * scale, life: 1, r: rand(12, 24) * scale });
      if (Math.random() < 0.35) sparks.push({ x: fx + rand(-15, 15) * scale, y: fy - 20 * scale, vx: rand(-30, 30), vy: rand(-160, -80), life: 1 });
      c.globalCompositeOperation = 'lighter';
      flames = flames.filter((f) => (f.life -= dt * 1.6) > 0);
      for (const f of flames) {
        f.x += (f.vx + Math.sin(t * 6 + f.y * 0.05) * 18) * dt; f.y += f.vy * dt;
        const col = f.life > 0.75 ? '255,200,90' : f.life > 0.45 ? '255,120,40' : '190,50,20';
        const rr = f.r * (0.4 + f.life * 0.9);
        const fg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        fg.addColorStop(0, `rgba(${col},${f.life * 0.3})`); fg.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = fg; c.beginPath(); c.arc(f.x, f.y, rr, 0, TAU); c.fill();
      }
      sparks = sparks.filter((s) => (s.life -= dt * 0.5) > 0);
      for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx += Math.sin(t * 3 + s.y) * 2; c.fillStyle = `rgba(255,190,90,${s.life})`; c.fillRect(s.x, s.y, 2, 2); }
      // kunang-kunang
      for (const fl of flies) {
        fl.x += fl.vx * dt + Math.sin(t + fl.ph) * 0.4; fl.y += fl.vy * dt + Math.cos(t * 0.8 + fl.ph) * 0.3;
        if (fl.x < 0 || fl.x > w) fl.vx *= -1; if (fl.y < h * 0.3 || fl.y > h * 0.85) fl.vy *= -1;
        const a = Math.max(0, Math.sin(t * 1.3 + fl.ph));
        const rg = c.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 9);
        rg.addColorStop(0, `rgba(210,255,120,${a})`); rg.addColorStop(1, 'rgba(210,255,120,0)');
        c.fillStyle = rg; c.fillRect(fl.x - 9, fl.y - 9, 18, 18);
      }
      c.globalCompositeOperation = 'source-over';
    },
  };
}

// ===================================================================== scene: pantai senja
function beachScene() {
  let glints = [];
  return {
    init(w, h, low) { glints = Array.from({ length: low ? 40 : 90 }, () => ({ x: rand(-1, 1), y: rand(0, 1), ph: rand(0, TAU), l: rand(8, 40) })); },
    draw(c, dt, t, w, h) {
      const hz = h * 0.55;
      const g = c.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0, '#3d2c6b'); g.addColorStop(0.55, '#e0708a'); g.addColorStop(1, '#ffc58a');
      c.fillStyle = g; c.fillRect(0, 0, w, hz);
      const sx = w * 0.5; const sr = Math.min(w, h) * 0.11;
      const glow = c.createRadialGradient(sx, hz, sr * 0.6, sx, hz, sr * 5);
      glow.addColorStop(0, 'rgba(255,220,160,0.6)'); glow.addColorStop(1, 'rgba(255,200,150,0)');
      c.fillStyle = glow; c.fillRect(0, 0, w, h);
      c.save(); c.beginPath(); c.rect(0, 0, w, hz); c.clip();
      c.fillStyle = '#ffe3a6'; c.beginPath(); c.arc(sx, hz + sr * 0.25, sr, 0, TAU); c.fill(); c.restore();
      // laut
      const sea = c.createLinearGradient(0, hz, 0, h);
      sea.addColorStop(0, '#d66f7f'); sea.addColorStop(0.35, '#5a4a8a'); sea.addColorStop(1, '#232a55');
      c.fillStyle = sea; c.fillRect(0, hz, w, h - hz);
      // pantulan matahari
      for (const gl of glints) {
        const y = hz + Math.pow(gl.y, 1.6) * (h * 0.32);
        const spread = 0.04 + gl.y * 0.25;
        const x = sx + gl.x * w * spread;
        const a = Math.max(0, Math.sin(t * 2 + gl.ph));
        c.fillStyle = `rgba(255,225,170,${a * (0.9 - gl.y * 0.6)})`;
        c.fillRect(x - gl.l / 2, y, gl.l * (1 - gl.y * 0.5), 2);
      }
      // garis ombak
      c.strokeStyle = 'rgba(255,220,230,0.25)'; c.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) {
        const y0 = hz + (h - hz) * (0.15 + k * 0.1);
        c.beginPath();
        for (let x = 0; x <= w; x += 20) c.lineTo(x, y0 + Math.sin(x * 0.012 + t * (0.6 + k * 0.1) + k) * (2 + k));
        c.stroke();
      }
      // pasir + buih yang maju mundur
      const shore = h * 0.88 + Math.sin(t * 0.55) * h * 0.025;
      c.fillStyle = '#c9a07e'; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, shore + Math.sin(x * 0.01 + 1) * 8);
      c.lineTo(w, h); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3; c.beginPath();
      for (let x = 0; x <= w; x += 12) c.lineTo(x, shore - 2 + Math.sin(x * 0.03 + t * 1.5) * 3 + Math.sin(x * 0.01 + 1) * 8);
      c.stroke();
    },
  };
}

// ===================================================================== scene: kota retro (pixel art)
function cityScene() {
  const PW = 192; const PH = 108;
  let off = null; let oc = null;
  let buildings = []; let rain = []; let neonPh = 0;
  return {
    init() {
      off = document.createElement('canvas'); off.width = PW; off.height = PH; oc = off.getContext('2d');
      buildings = [];
      for (let layer = 0; layer < 2; layer++) {
        let x = -4;
        while (x < PW) {
          const bw = Math.floor(rand(10, 24)); const bh = Math.floor(rand(25, 70) * (layer ? 1 : 0.8));
          const wins = [];
          for (let wy = 4; wy < bh - 3; wy += 4) for (let wx = 2; wx < bw - 2; wx += 3) wins.push({ x: wx, y: wy, on: Math.random() < 0.45, t: rand(2, 20) });
          buildings.push({ x, w: bw, h: bh, layer, wins, col: layer ? '#141428' : '#22203b' });
          x += bw + Math.floor(rand(0, 3));
        }
      }
      rain = Array.from({ length: 70 }, () => ({ x: rand(0, PW), y: rand(0, PH), v: rand(50, 80) }));
    },
    draw(c, dt, t, w, h) {
      // langit berpita (dithering sederhana)
      const bands = ['#0d0b24', '#14113a', '#221a4d', '#35215c', '#4c2a66'];
      bands.forEach((col, i) => { oc.fillStyle = col; oc.fillRect(0, Math.floor((i * PH * 0.6) / bands.length), PW, Math.ceil((PH * 0.6) / bands.length) + 1); });
      oc.fillStyle = '#4c2a66'; oc.fillRect(0, PH * 0.6, PW, PH);
      oc.fillStyle = '#f4e8c1'; oc.fillRect(150, 14, 8, 8); oc.fillRect(149, 15, 10, 6); oc.fillStyle = '#d8c99a'; oc.fillRect(152, 16, 2, 2);
      for (const b of buildings) {
        const top = PH - b.h - (b.layer ? 0 : 6);
        oc.fillStyle = b.col; oc.fillRect(b.x, top, b.w, b.h + 6);
        for (const win of b.wins) {
          win.t -= dt; if (win.t < 0) { win.on = Math.random() < 0.5; win.t = rand(3, 25); }
          if (win.on) { oc.fillStyle = b.layer ? '#ffd27a' : '#c7a160'; oc.fillRect(b.x + win.x, top + win.y, 1, 2); }
        }
      }
      neonPh += dt;
      const on = Math.sin(neonPh * 3) > -0.6 || Math.random() < 0.02;
      oc.fillStyle = on ? '#ff4fa3' : '#5a2244'; oc.fillRect(60, 58, 14, 3);
      oc.fillStyle = on ? '#4ff0ff' : '#1d4a55'; oc.fillRect(118, 50, 3, 10);
      oc.fillStyle = '#0a0918'; oc.fillRect(0, PH - 6, PW, 6);
      oc.fillStyle = on ? 'rgba(255,79,163,0.35)' : 'rgba(0,0,0,0)'; oc.fillRect(56, PH - 6, 22, 2);
      oc.fillStyle = 'rgba(160,180,255,0.55)';
      for (const r of rain) { r.y += r.v * dt; r.x -= r.v * dt * 0.25; if (r.y > PH) { r.y = -2; r.x = rand(0, PW + 20); } oc.fillRect(Math.floor(r.x), Math.floor(r.y), 1, 2); }
      c.imageSmoothingEnabled = false;
      const s = Math.max(w / PW, h / PH);
      c.drawImage(off, (w - PW * s) / 2, (h - PH * s) / 2, PW * s, PH * s);
    },
  };
}

// ===================================================================== scene: salju
function snowScene() {
  let flakes = [];
  let hills = [];
  return {
    init(w, h, low) {
      flakes = Array.from({ length: low ? 120 : 280 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.8, 3.4), v: rand(18, 60), ph: rand(0, TAU) }));
      hills = [ridge(33, 0.5), ridge(33, 0.45)];
    },
    draw(c, dt, t, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1a2440'); g.addColorStop(0.7, '#3a4a6e'); g.addColorStop(1, '#6b7ea3');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      ['#aab8d4', '#e6edf7'].forEach((col, i) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
        hills[i].forEach((v, k) => c.lineTo((k / (hills[i].length - 1)) * w, h * (0.72 + i * 0.1) - v * h * 0.1));
        c.lineTo(w, h); c.fill();
      });
      // jendela rumah kecil yang hangat
      const hx = w * 0.7; const hy = h * 0.79;
      c.fillStyle = '#3b2a2a'; c.fillRect(hx, hy, 70, 44);
      c.fillStyle = '#5a3a3a'; c.beginPath(); c.moveTo(hx - 10, hy); c.lineTo(hx + 35, hy - 30); c.lineTo(hx + 80, hy); c.fill();
      const fl = 0.8 + 0.2 * Math.sin(t * 5);
      c.fillStyle = `rgba(255,200,110,${fl})`; c.fillRect(hx + 12, hy + 12, 16, 14); c.fillRect(hx + 42, hy + 12, 16, 14);
      const glow = c.createRadialGradient(hx + 35, hy + 20, 5, hx + 35, hy + 20, 120);
      glow.addColorStop(0, `rgba(255,190,100,${0.25 * fl})`); glow.addColorStop(1, 'rgba(255,190,100,0)');
      c.fillStyle = glow; c.fillRect(hx - 100, hy - 100, 270, 240);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (const f of flakes) {
        f.y += f.v * dt; f.x += Math.sin(t * 0.8 + f.ph) * 12 * dt;
        if (f.y > h) { f.y = -4; f.x = rand(0, w); }
        c.globalAlpha = 0.4 + f.r / 6; c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    },
  };
}

const FACTORY = { room: roomScene, rain: rainScene, sunset: sunsetScene, aurora: auroraScene, stars: starsScene, campfire: campfireScene, beach: beachScene, city: cityScene, snow: snowScene };
export const isCanvasScene = (id) => !!FACTORY[id];

/** Penjalan animasi: setScene(id), start(), stop(), setLowPower(b), setState(obj). */
export function createSceneRunner(canvas) {
  const c = canvas.getContext('2d');
  let scene = null;
  let id = null;
  let raf = 0;
  let last = 0;
  let t0 = performance.now();
  let low = false;
  let w = 0, h = 0;
  let state = {};
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function size() {
    const dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene) scene.init(w, h, low);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const minGap = reduce ? 500 : low ? 1000 / 24 : 1000 / 60;
    if (now - last < minGap - 1) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    if (scene) { try { scene.draw(c, reduce ? dt * 0.2 : dt, (now - t0) / 1000, w, h, state); } catch (e) { console.error(e); stop(); } }
  }
  function start() { if (!raf && scene) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  const onResize = () => { if (scene) size(); };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (canvas.isConnected && !canvas.closest('[hidden]')) start(); });
  return {
    setScene(next) {
      if (next === id && scene) return;
      id = next;
      scene = FACTORY[next] ? FACTORY[next]() : null;
      if (scene) { size(); start(); } else { stop(); c.clearRect(0, 0, canvas.width, canvas.height); }
    },
    setLowPower(b) { if (low !== !!b) { low = !!b; size(); } },
    setState(s) { state = { ...state, ...s }; },
    start, stop, resize: size,
    get running() { return !!raf; },
  };
}
