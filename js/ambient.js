// Suara alam untuk Lobby. Sebagian besar memakai REKAMAN ASLI (folder sounds/, lisensi CC0 / Pixabay —
// lihat sounds/CREDITS.md) yang dimuat saat dinyalakan lalu diputar berulang dengan crossfade supaya
// sambungannya tidak terdengar. Kalau file gagal dimuat (mis. offline dan belum tersimpan), suara
// sintetis Web Audio dipakai sebagai cadangan. Plus "suara sendiri" dari file yang diunggah pengguna.

export const SOUNDS = [
  { id: 'rain', name: 'Hujan di jendela', icon: 'rain' },
  { id: 'heavyrain', name: 'Hujan deras', icon: 'rain' },
  { id: 'thunder', name: 'Petir', icon: 'bolt' },
  { id: 'wind', name: 'Angin', icon: 'wind' },
  { id: 'waves', name: 'Ombak', icon: 'waves' },
  { id: 'fire', name: 'Api unggun', icon: 'flame' },
  { id: 'crickets', name: 'Jangkrik', icon: 'moon' },
  { id: 'birds', name: 'Burung', icon: 'bird' },
  { id: 'stream', name: 'Sungai', icon: 'droplet' },
  { id: 'seagulls', name: 'Burung camar', icon: 'bird' },
  { id: 'owl', name: 'Burung hantu', icon: 'moon' },
  { id: 'cafe', name: 'Kafe', icon: 'coffee' },
  { id: 'restaurant', name: 'Restoran ramai', icon: 'coffee' },
  { id: 'people', name: 'Keramaian orang', icon: 'users' },
  { id: 'purr', name: 'Kucing mendengkur', icon: 'heart' },
  { id: 'keyboard', name: 'Ketikan keyboard', icon: 'keyboard' },
  { id: 'clock', name: 'Jam dinding', icon: 'clock' },
  { id: 'train', name: 'Kereta', icon: 'train' },
  { id: 'fan', name: 'Kipas angin', icon: 'fan' },
  { id: 'traffic', name: 'Lalu lintas', icon: 'car' },
  { id: 'vinyl', name: 'Piringan hitam', icon: 'disc' },
  { id: 'brown', name: 'Brown noise', icon: 'noise' },
  { id: 'pink', name: 'Pink noise', icon: 'noise' },
  { id: 'white', name: 'White noise', icon: 'noise' },
];

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
let ctx = null;
let master = null;
let masterLevel = 0.8;
const voices = new Map(); // id → { gain, stop }
const buffers = new Map();
const customBuffers = new Map(); // id → AudioBuffer
const listeners = new Set();

export const isSupported = () => !!AC;
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* abaikan */ } });

function ensure() {
  if (!AC) throw new Error('Browser ini tidak mendukung Web Audio.');
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = masterLevel;
    // pembatas lembut supaya beberapa suara yang dinyalakan bersamaan tidak pecah
    if (ctx.createDynamicsCompressor) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.4;
      master.connect(comp); comp.connect(ctx.destination);
    } else master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ---------- pembangkit buffer (murni, bisa diuji tanpa AudioContext) ----------
/** Isi Float32Array dengan noise: 'white' | 'pink' | 'brown'. */
export function fillNoise(arr, type = 'white', rnd = Math.random) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < arr.length; i++) {
    const w = rnd() * 2 - 1;
    if (type === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      arr[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      arr[i] = last * 3.5;
    } else arr[i] = w * 0.5;
  }
  return arr;
}

/** Klik/letupan acak (untuk tetes hujan, api, piringan hitam). */
export function fillClicks(arr, rate, { count, minDecay = 0.001, maxDecay = 0.006, amp = 1, power = 1, rnd = Math.random } = {}) {
  arr.fill(0);
  for (let n = 0; n < count; n++) {
    const at = Math.floor(rnd() * arr.length);
    const decay = (minDecay + rnd() * (maxDecay - minDecay)) * rate;
    const a = amp * Math.pow(rnd(), power) * (rnd() < 0.5 ? -1 : 1);
    const len = Math.min(arr.length - at, Math.floor(decay * 6));
    for (let k = 0; k < len; k++) arr[at + k] += a * Math.exp(-k / decay) * (rnd() * 2 - 1);
  }
  return arr;
}

function makeBuffer(seconds, fill, channels = 1) {
  const c = ensure();
  const buf = c.createBuffer(channels, Math.floor(c.sampleRate * seconds), c.sampleRate);
  for (let ch = 0; ch < channels; ch++) fill(buf.getChannelData(ch), c.sampleRate, ch);
  return buf;
}
function cached(key, make) {
  if (!buffers.has(key)) buffers.set(key, make());
  return buffers.get(key);
}
const noise = (type, sec = 6) => cached(`n-${type}`, () => makeBuffer(sec, (a) => fillNoise(a, type), 2));

function loop(buf, dest, { rate = 1 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.connect(dest);
  s.start(0, Math.random() * buf.duration);
  return s;
}
function filter(type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}
function gainNode(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
function lfo(freq, depth, target) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = gainNode(depth);
  o.connect(g).connect(target);
  o.start();
  return o;
}
const pending = new Set();

// ---------- rekaman asli ----------
/** Suara yang punya rekaman di folder sounds/ (id → [nama file, penguat]). Kekerasan file sudah
 *  disamakan (loudness-normalized) saat dikompres, jadi penguatnya hanya penyesuaian kecil. */
export const FILES = {
  rain: ['rain', 1], heavyrain: ['heavyrain', 1], thunder: ['thunder', 1.1], wind: ['wind', 1], waves: ['waves', 1],
  fire: ['fire', 1.5], crickets: ['crickets', 1], birds: ['birds', 1], stream: ['stream', 1], seagulls: ['seagulls', 1],
  owl: ['owl', 1], cafe: ['cafe', 1], restaurant: ['restaurant', 1], people: ['people', 1], purr: ['purr', 0.8],
  keyboard: ['keyboard', 1], clock: ['clock', 1], train: ['train', 0.6], fan: ['fan', 1], traffic: ['traffic', 0.65], vinyl: ['vinyl', 0.6],
};
const SOUND_BASE = (() => { try { return new URL('../sounds/', import.meta.url).href; } catch { return 'sounds/'; } })();
const fileCache = new Map(); // id → Promise<{buf, norm}>
function loadFile(id) {
  if (!fileCache.has(id)) {
    const [name, trim] = FILES[id];
    const pr = fetch(`${SOUND_BASE}${name}.mp3`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => ({ buf, norm: trim * 2.2 }));
    pr.catch(() => fileCache.delete(id)); // coba lagi lain kali
    fileCache.set(id, pr);
  }
  return fileCache.get(id);
}
/** Putar buffer berulang dengan crossfade equal-power; dijadwalkan ±90 detik ke depan
 *  supaya tetap mulus walau timer tab latar dibatasi browser. */
function xfadeLoop(buf, dest) {
  const xf = Math.min(3, buf.duration / 4);
  const N = 64; const fadeIn = new Float32Array(N); const fadeOut = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = i / (N - 1); fadeIn[i] = Math.sin((x * Math.PI) / 2); fadeOut[i] = Math.cos((x * Math.PI) / 2); }
  const live = new Set();
  let alive = true; let timer = null;
  let next = ctx.currentTime + 0.05;
  let offset = Math.random() * Math.max(0, buf.duration - xf * 3);
  const schedule = () => {
    if (!alive) return;
    while (next < ctx.currentTime + 90) {
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); src.connect(g); g.connect(dest);
      const dur = buf.duration - offset;
      g.gain.setValueCurveAtTime(fadeIn, next, xf);
      g.gain.setValueCurveAtTime(fadeOut, next + dur - xf, xf);
      src.start(next, offset); src.stop(next + dur + 0.05);
      live.add(src); src.onended = () => { live.delete(src); try { g.disconnect(); } catch { /* */ } };
      next += dur - xf; offset = 0;
    }
    timer = setTimeout(schedule, 20000);
  };
  schedule();
  return { stop: () => { alive = false; clearTimeout(timer); live.forEach((x) => { try { x.stop(); } catch { /* */ } }); } };
}
/** Suara dari rekaman; kalau gagal dimuat, pakai versi sintetis (kalau ada). */
function fileVoice(id, out) {
  let alive = true; let part = null;
  const pr = loadFile(id).then(({ buf, norm }) => {
    if (!alive) return;
    const g = gainNode(norm); g.connect(out);
    part = xfadeLoop(buf, g);
  }).catch(() => {
    if (!alive || !RECIPES[id]) return;
    const ps = RECIPES[id](out); part = { stop: () => ps.forEach((p) => { try { p.stop(); } catch { /* */ } }) };
  });
  pending.add(pr); pr.finally(() => pending.delete(pr));
  return { stop: () => { alive = false; if (part) part.stop(); } };
}
/** Selesai kalau semua suara yang dibuat secara async (mis. obrolan kafe) sudah siap. */
export const whenReady = () => Promise.all([...pending]);
const panner = (pan) => { if (!ctx.createStereoPanner) return gainNode(1); const p = ctx.createStereoPanner(); p.pan.value = pan; return p; };
/** Gema ruangan/alam sederhana (respons impuls dari noise yang meluruh). */
function reverb(seconds = 2.4, decay = 3) {
  const cv = ctx.createConvolver();
  cv.buffer = cached(`ir-${seconds}-${decay}`, () => makeBuffer(seconds, (a) => {
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / a.length, decay);
  }, 2));
  return cv;
}

/** Suara orang mengobrol (tidak bisa dimengerti, seperti keramaian), dirender sekali dengan OfflineAudioContext. */
const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [660, 1720, 2410], [440, 1020, 2240], [400, 1600, 2500]];
function renderBabble(voices, seconds, { lp = 3200, room = 0.35, spread = 0.9 } = {}) {
  const OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!OAC) return Promise.resolve(null);
  const sr = ctx.sampleRate;
  const oc = new OAC(2, Math.floor(sr * seconds), sr);
  const bus = oc.createGain(); bus.gain.value = 0.9 / Math.sqrt(voices);
  const lpf = oc.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp;
  bus.connect(lpf); lpf.connect(oc.destination);
  if (room > 0) {
    const cv = oc.createConvolver();
    const ir = oc.createBuffer(2, Math.floor(sr * 1.2), sr);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / a.length, 4); }
    cv.buffer = ir;
    const wet = oc.createGain(); wet.gain.value = room;
    lpf.connect(cv); cv.connect(wet); wet.connect(oc.destination);
  }
  const breath = oc.createBuffer(1, sr * 2, sr); fillNoise(breath.getChannelData(0), 'pink');
  for (let v = 0; v < voices; v++) {
    const male = Math.random() < 0.5;
    const base = male ? 95 + Math.random() * 45 : 175 + Math.random() * 65;
    const fm = male ? 1 : 1.17;
    const osc = oc.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = base;
    const nz = oc.createBufferSource(); nz.buffer = breath; nz.loop = true;
    const nzg = oc.createGain(); nzg.gain.value = 0.25;
    const src = oc.createGain(); src.gain.value = 0.5;
    osc.connect(src); nz.connect(nzg); nzg.connect(src);
    const env = oc.createGain(); env.gain.value = 0;
    const formants = [0, 1, 2].map((k) => { const f = oc.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [5, 9, 11][k]; f.frequency.value = VOWELS[0][k] * fm; const g = oc.createGain(); g.gain.value = [1, 0.55, 0.3][k]; src.connect(f); f.connect(g); g.connect(env); return f; });
    const pan = oc.createStereoPanner ? oc.createStereoPanner() : oc.createGain();
    if (pan.pan) pan.pan.value = (Math.random() * 2 - 1) * spread;
    const dist = oc.createGain(); dist.gain.value = 0.35 + Math.random() * 0.9;
    env.connect(dist); dist.connect(pan); pan.connect(bus);
    let t = Math.random() * 2.5;
    while (t < seconds - 0.5) {
      const syll = 4 + Math.floor(Math.random() * 16);
      const amp = 0.6 + Math.random() * 0.5;
      for (let k = 0; k < syll && t < seconds - 0.3; k++) {
        const dur = 0.11 + Math.random() * 0.17;
        const vw = VOWELS[Math.floor(Math.random() * VOWELS.length)];
        formants.forEach((f, i) => f.frequency.setTargetAtTime(vw[i] * fm * (0.92 + Math.random() * 0.16), t, 0.025));
        const fall = 1 - (k / syll) * 0.18;
        osc.frequency.setTargetAtTime(base * fall * (0.9 + Math.random() * 0.25) * (k === 0 ? 1.12 : 1), t, 0.04);
        env.gain.setTargetAtTime(amp * (0.7 + Math.random() * 0.3), t, 0.018);
        env.gain.setTargetAtTime(amp * 0.12, t + dur * 0.72, 0.025);
        t += dur + (Math.random() < 0.2 ? 0.05 + Math.random() * 0.12 : 0);
      }
      env.gain.setTargetAtTime(0, t, 0.05);
      t += 0.35 + Math.random() * 2.4;
    }
    osc.start(0); nz.start(0, Math.random());
  }
  return oc.startRendering();
}
/** Putar buffer async (mis. obrolan) begitu siap — kalau suaranya belum dimatikan. */
function asyncLoop(key, make, dest, gain = 1) {
  const node = gainNode(gain); node.connect(dest);
  let src = null; let alive = true;
  if (!buffers.has(key)) {
    const pr = make().then((b) => { buffers.set(key, b); return b; }).catch(() => null);
    buffers.set(key, pr); pending.add(pr); pr.finally(() => pending.delete(pr));
  }
  Promise.resolve(buffers.get(key)).then((b) => { if (alive && b) src = loop(b, node); });
  return { stop: () => { alive = false; if (src) try { src.stop(); } catch { /* abaikan */ } } };
}

/** Tetes hujan: desis halus, "plink" gelembung kecil (nada naik), dan tetes besar di kusen jendela. */
function fillRainDrops(a, rate, ch, { ticks = 6500, plinks = 520, heavy = 140 } = {}) {
  a.fill(0);
  const rnd = Math.random;
  for (let n = 0; n < ticks; n++) {
    const at = Math.floor(rnd() * a.length); const d = (0.0004 + rnd() * 0.0016) * rate; const amp = 0.14 * Math.pow(rnd(), 2);
    for (let k = 0, len = Math.min(a.length - at, d * 5); k < len; k++) a[at + k] += amp * Math.exp(-k / d) * (rnd() * 2 - 1);
  }
  for (let n = 0; n < plinks; n++) {
    const at = Math.floor(rnd() * a.length); const tau = (0.006 + rnd() * 0.02) * rate; const f0 = 1100 + rnd() * 3200; const amp = 0.05 + 0.22 * Math.pow(rnd(), 2.2);
    let ph = 0;
    for (let k = 0, len = Math.min(a.length - at, tau * 5); k < len; k++) {
      const f = f0 * (1 + 0.35 * (k / (tau * 5)));
      ph += (2 * Math.PI * f) / rate;
      a[at + k] += amp * Math.exp(-k / tau) * Math.sin(ph);
    }
  }
  for (let n = 0; n < heavy; n++) {
    const at = Math.floor(rnd() * a.length); const d = (0.002 + rnd() * 0.005) * rate; const amp = 0.25 + rnd() * 0.35;
    let y = 0;
    for (let k = 0, len = Math.min(a.length - at, d * 5); k < len; k++) { y += 0.35 * ((rnd() * 2 - 1) - y); a[at + k] += amp * Math.exp(-k / d) * y; }
  }
  void ch;
  return a;
}

/** Satu sambaran petir: retakan (kalau dekat) lalu gemuruh yang bergulung dan memantul. */
function fillThunder(a, rate, ch, near) {
  const rnd = Math.random;
  const len = a.length;
  const bumps = [];
  let t = near ? 0.25 : 0.6 + rnd();
  const n = 3 + Math.floor(rnd() * 5);
  for (let k = 0; k < n; k++) { bumps.push([t, 0.05 + rnd() * 0.35, 0.7 + rnd() * 2.2, Math.pow(0.72, k) * (0.6 + rnd() * 0.6)]); t += 0.3 + rnd() * 2; }
  let brown = 0; let lp2 = 0;
  for (let i = 0; i < len; i++) {
    const s = i / rate;
    let env = 0;
    for (const [bt, at, dc, amp] of bumps) { if (s < bt) continue; const x = s - bt; env += amp * (x < at ? x / at : Math.exp(-(x - at) / dc)); }
    env *= Math.min(1, (len / rate - s) / 1.5);
    brown = (brown + 0.02 * (rnd() * 2 - 1)) / 1.02;
    lp2 += 0.08 * (brown * 3.5 - lp2);
    a[i] = env * (brown * 3.2 + lp2 * 1.5) * 0.9;
  }
  if (near) { // retakan tajam di awal
    const cl = Math.floor(rate * (0.25 + rnd() * 0.3));
    let hp = 0; let prev = 0;
    for (let i = 0; i < cl; i++) {
      const w = rnd() * 2 - 1; hp = 0.85 * (hp + w - prev); prev = w;
      const e = Math.exp(-i / (rate * 0.06)) * (0.6 + 0.4 * Math.sin(i / (rate * 0.004)));
      a[i] += hp * e * 0.5;
    }
  }
  void ch;
  return a;
}

/** Sambungkan berurutan; mengembalikan node PERTAMA (tempat sumber suara dihubungkan). */
const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[0]; };

// ---------- resep tiap suara: build(out) → fungsi stop ----------
const RECIPES = {
  white: (out) => { const s = loop(noise('white'), chain(gainNode(0.32), out)); return [s]; },
  pink: (out) => { const s = loop(noise('pink'), out); return [s]; },
  brown: (out) => { const s = loop(noise('brown'), out); return [s]; },

  rain: (out) => {
    // dasar desis hujan lebat (dibentuk supaya tidak sekadar "white noise")
    const bedGain = gainNode(0.72);
    const peak = filter('peaking', 2400, 0.8); peak.gain.value = 4;
    const bedIn = chain(filter('highpass', 380), filter('lowpass', 8500), peak, bedGain, out);
    const s1 = loop(noise('pink'), bedIn);
    // gemuruh hujan di kejauhan (memberi kedalaman)
    const s2 = loop(noise('brown'), chain(filter('lowpass', 420), gainNode(0.3), out));
    // tetes: dua buffer dengan panjang berbeda supaya pengulangannya tidak terasa
    const d1 = cached('rain-drops-a', () => makeBuffer(7.3, (x, r, c) => fillRainDrops(x, r, c), 2));
    const d2 = cached('rain-drops-b', () => makeBuffer(11.9, (x, r, c) => fillRainDrops(x, r, c, { ticks: 3500, plinks: 380, heavy: 90 }), 2));
    const dropGain = gainNode(1.05);
    const dropIn = chain(filter('highpass', 220), dropGain, out);
    const s3 = loop(d1, dropIn);
    const s4 = loop(d2, chain(gainNode(0.7), dropIn));
    // sedikit gema ruang
    const verb = reverb(1.6, 3.5); const wet = gainNode(0.22); dropGain.connect(verb); verb.connect(wet); wet.connect(out);
    // intensitas naik-turun pelan (angin membawa hujan)
    const swell = lfo(0.045, 0.14, bedGain.gain);
    const swell2 = lfo(0.031, 0.18, dropGain.gain);
    return [s1, s2, s3, s4, swell, swell2];
  },

  thunder: (out) => {
    let alive = true;
    let timer = null;
    const verb = reverb(3.8, 2.6); const wet = gainNode(0.55); verb.connect(wet); wet.connect(out);
    const strikes = [0, 1, 2, 3].map((k) => () => cached(`thunder-${k}`, () => makeBuffer(14, (x, r, c) => fillThunder(x, r, c, k < 2), 2)));
    const strike = () => {
      if (!alive) return;
      const now = ctx.currentTime;
      const k = Math.floor(Math.random() * 4);
      const src = ctx.createBufferSource();
      src.buffer = strikes[k]();
      const near = k < 2;
      const lp = filter('lowpass', near ? 900 + Math.random() * 900 : 260 + Math.random() * 260, 0.6);
      const g = gainNode(near ? 0.9 : 0.75 + Math.random() * 0.4);
      const pn = panner((Math.random() * 2 - 1) * 0.6);
      chain(src, lp, g, pn, out);
      pn.connect(verb);
      src.start(now);
      src.onended = () => { try { pn.disconnect(); } catch { /* */ } };
      timer = setTimeout(strike, (11 + Math.random() * 26) * 1000);
    };
    timer = setTimeout(strike, 1500 + Math.random() * 3000);
    return [{ stop: () => { alive = false; clearTimeout(timer); } }];
  },

  wind: (out) => {
    const bp = filter('bandpass', 420, 0.9);
    const g = gainNode(1);
    chain(bp, g, out);
    const s = loop(noise('brown'), bp);
    const s2 = loop(noise('pink'), chain(filter('bandpass', 900, 1.4), gainNode(0.12), g));
    const l1 = lfo(0.06, 260, bp.frequency);
    const l2 = lfo(0.11, 0.35, g.gain);
    return [s, s2, l1, l2];
  },

  waves: (out) => {
    const g = gainNode(0.45);
    g.connect(out);
    const lp = filter('lowpass', 800);
    chain(lp, g);
    const s1 = loop(noise('brown'), lp);
    const foam = chain(filter('highpass', 1800), gainNode(0.18), g);
    const s2 = loop(noise('pink'), foam);
    const l1 = lfo(0.105, 0.42, g.gain);
    const l2 = lfo(0.105, 500, lp.frequency);
    return [s1, s2, l1, l2];
  },

  fire: (out) => {
    const lp = filter('lowpass', 380);
    chain(lp, gainNode(0.55), out);
    const s1 = loop(noise('brown'), lp);
    const crackle = cached('fire-crackle', () => makeBuffer(5, (a, r) => fillClicks(a, r, { count: 260, minDecay: 0.0004, maxDecay: 0.004, amp: 1, power: 3 }), 2));
    const hp = filter('highpass', 1400);
    chain(hp, gainNode(0.75), out);
    const s2 = loop(crackle, hp);
    const pops = cached('fire-pops', () => makeBuffer(7, (a, r) => fillClicks(a, r, { count: 18, minDecay: 0.004, maxDecay: 0.012, amp: 1, power: 1 }), 2));
    const s3 = loop(pops, chain(filter('bandpass', 900, 0.8), gainNode(0.5), out));
    return [s1, s2, s3];
  },

  crickets: (out) => {
    const buf = cached('crickets', () => makeBuffer(6, (a, rate) => {
      a.fill(0);
      [[4300, 0.75], [4720, 0.95], [5120, 0.62]].forEach(([f, period], idx) => {
        let t = Math.random() * period;
        while (t < a.length / rate - 0.3) {
          const pulses = 3 + (Math.random() < 0.4 ? 1 : 0);
          for (let p = 0; p < pulses; p++) {
            const start = Math.floor((t + p * 0.045) * rate);
            const len = Math.floor(0.022 * rate);
            for (let k = 0; k < len && start + k < a.length; k++) {
              const env = Math.sin((Math.PI * k) / len);
              a[start + k] += 0.12 * env * Math.sin((2 * Math.PI * f * (start + k)) / rate) * (idx === 2 ? 0.6 : 1);
            }
          }
          t += period * (0.9 + Math.random() * 0.25);
        }
      });
    }));
    const s = loop(buf, chain(gainNode(1.6), out));
    return [s];
  },

  birds: (out) => {
    const buf = cached('birds', () => makeBuffer(18, (a, rate) => {
      a.fill(0);
      const phrases = 9;
      for (let ph = 0; ph < phrases; ph++) {
        let t = Math.random() * 16.5;
        const base = 2200 + Math.random() * 2600;
        const notes = 2 + Math.floor(Math.random() * 5);
        const amp = 0.08 + Math.random() * 0.1;
        for (let n = 0; n < notes; n++) {
          const dur = 0.05 + Math.random() * 0.13;
          const f1 = base * (0.8 + Math.random() * 0.5);
          const f2 = f1 * (Math.random() < 0.5 ? 1.35 : 0.7);
          const start = Math.floor(t * rate);
          const len = Math.floor(dur * rate);
          let phase = 0;
          for (let k = 0; k < len && start + k < a.length; k++) {
            const x = k / len;
            const f = f1 + (f2 - f1) * x;
            phase += (2 * Math.PI * f) / rate;
            a[start + k] += amp * Math.sin(Math.PI * x) * Math.sin(phase + 0.6 * Math.sin(phase * 0.02));
          }
          t += dur + 0.03 + Math.random() * 0.12;
        }
      }
    }));
    const s = loop(buf, chain(filter('highpass', 1200), gainNode(1.8), out));
    return [s];
  },

  stream: (out) => {
    const bp = filter('bandpass', 1100, 0.45);
    const g = gainNode(0.95);
    chain(bp, g, out);
    const s1 = loop(noise('pink'), bp);
    const gurgle = cached('stream-gurgle', () => makeBuffer(5, (a, r) => fillClicks(a, r, { count: 900, minDecay: 0.002, maxDecay: 0.009, amp: 0.4, power: 1.5 }), 2));
    const s2 = loop(gurgle, chain(filter('bandpass', 700, 1.2), gainNode(0.5), out));
    const l = lfo(0.3, 250, bp.frequency);
    return [s1, s2, l];
  },

  cafe: (out) => {
    // keramaian kafe: banyak orang mengobrol di kejauhan + dengung ruangan + denting cangkir + mesin kopi
    const babble = asyncLoop('babble-cafe', () => renderBabble(14, 26, { lp: 2600, room: 0.5, spread: 1 }), out, 3.6);
    const room = loop(noise('brown'), chain(filter('bandpass', 260, 0.6), gainNode(0.18), out));
    let alive = true;
    const timers = [];
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); };
    const verb = reverb(1.2, 4); const wet = gainNode(0.35); verb.connect(wet); wet.connect(out);
    const clink = () => {
      if (!alive) return;
      const now = ctx.currentTime;
      const f = 2100 + Math.random() * 2200;
      const pn = panner(Math.random() * 1.6 - 0.8);
      pn.connect(out); pn.connect(verb);
      [1, 2.76, 5.4].forEach((m, i) => {
        const o = ctx.createOscillator(); o.frequency.value = f * m;
        const e = gainNode(0);
        e.gain.setValueAtTime(0, now);
        e.gain.linearRampToValueAtTime([0.03, 0.014, 0.006][i] * (0.4 + Math.random()), now + 0.003);
        e.gain.exponentialRampToValueAtTime(0.0001, now + 0.25 + Math.random() * 0.4);
        chain(o, e, pn); o.start(now); o.stop(now + 0.8);
      });
      // sesekali cangkir diletakkan di piring
      if (Math.random() < 0.35) {
        const src = ctx.createBufferSource(); src.buffer = noise('white');
        const e = gainNode(0); e.gain.setValueAtTime(0, now + 0.05); e.gain.linearRampToValueAtTime(0.12, now + 0.052); e.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        chain(src, filter('bandpass', 1800, 1.5), e, pn); src.start(now, Math.random()); src.stop(now + 0.2);
      }
      later(clink, (1.5 + Math.random() * 6) * 1000);
    };
    const steam = () => { // mesin espresso
      if (!alive) return;
      const now = ctx.currentTime; const dur = 2.5 + Math.random() * 3;
      const src = ctx.createBufferSource(); src.buffer = noise('pink'); src.loop = true;
      const e = gainNode(0); e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(0.05, now + 0.4); e.gain.setValueAtTime(0.05, now + dur); e.gain.linearRampToValueAtTime(0, now + dur + 0.6);
      chain(src, filter('highpass', 3000), filter('lowpass', 9000), e, panner(0.5), out); src.start(now); src.stop(now + dur + 1);
      later(steam, (35 + Math.random() * 60) * 1000);
    };
    later(clink, 800); later(steam, 12000 + Math.random() * 20000);
    return [babble, room, { stop: () => { alive = false; timers.forEach(clearTimeout); } }];
  },

  people: (out) => {
    // beberapa orang mengobrol lebih dekat (tetap tidak bisa dimengerti)
    const babble = asyncLoop('babble-near', () => renderBabble(5, 30, { lp: 4200, room: 0.25, spread: 0.8 }), out, 3.8);
    return [babble];
  },

  keyboard: (out) => {
    const buf = cached('keyboard', () => makeBuffer(19, (a, rate) => {
      a.fill(0);
      const rnd = Math.random;
      const key = (t, space) => {
        const at = Math.floor(t * rate);
        const amp = (space ? 0.5 : 0.32) * (0.6 + rnd() * 0.5);
        const d = (space ? 0.004 : 0.0018) * rate;
        let prev = 0;
        for (let k = 0; k < d * 6 && at + k < a.length; k++) { const w = rnd() * 2 - 1; a[at + k] += amp * Math.exp(-k / d) * (w - prev * 0.6); prev = w; }
        const f = space ? 140 : 190 + rnd() * 90; const tau = 0.012 * rate;
        for (let k = 0; k < tau * 5 && at + k < a.length; k++) a[at + k] += amp * 0.5 * Math.exp(-k / tau) * Math.sin((2 * Math.PI * f * k) / rate);
        // lepas tombol (klik kecil)
        const up = at + Math.floor((0.06 + rnd() * 0.05) * rate);
        for (let k = 0; k < 0.001 * rate * 5 && up + k < a.length; k++) a[up + k] += amp * 0.25 * Math.exp(-k / (0.001 * rate)) * (rnd() * 2 - 1);
      };
      let t = 0.3;
      while (t < 18.5) {
        const words = 3 + Math.floor(rnd() * 9);
        for (let w = 0; w < words && t < 18.5; w++) {
          const chars = 2 + Math.floor(rnd() * 7);
          for (let c = 0; c < chars; c++) { key(t, false); t += 0.07 + rnd() * 0.11; }
          key(t, true); t += 0.1 + rnd() * 0.15;
        }
        t += 0.6 + rnd() * 2.6;
      }
    }, 1));
    const s = loop(buf, chain(filter('highpass', 120), gainNode(1.4), panner(0.15), out));
    return [s];
  },

  clock: (out) => {
    const buf = cached('clock', () => makeBuffer(2, (a, rate) => {
      a.fill(0);
      [[0, 3300, 0.32], [1, 2650, 0.26]].forEach(([t, f, amp]) => {
        const at = Math.floor(t * rate);
        for (let k = 0; k < 0.04 * rate; k++) {
          const e = Math.exp(-k / (0.004 * rate));
          a[at + k] += amp * e * (Math.sin((2 * Math.PI * f * k) / rate) * 0.7 + (Math.random() * 2 - 1) * 0.5) + amp * 0.4 * Math.exp(-k / (0.012 * rate)) * Math.sin((2 * Math.PI * 820 * k) / rate);
        }
      });
    }, 1));
    const verb = reverb(0.6, 5); const wet = gainNode(0.3);
    const dry = chain(gainNode(0.8), out); dry.connect(verb); verb.connect(wet); wet.connect(out);
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dry); s.start(0);
    return [s];
  },

  train: (out) => {
    const rumble = loop(noise('brown'), chain(filter('lowpass', 180), gainNode(0.9), out));
    const body = loop(noise('pink'), chain(filter('bandpass', 650, 0.7), gainNode(0.12), out));
    const sway = lfo(0.6, 0.04, body.playbackRate);
    const buf = cached('train-clack', () => makeBuffer(2.4, (a, rate) => {
      a.fill(0);
      [0.0, 0.16, 1.2, 1.36].forEach((t, i) => {
        const at = Math.floor(t * rate); const amp = i % 2 ? 0.45 : 0.6; let y = 0;
        for (let k = 0; k < 0.05 * rate; k++) { y += 0.25 * ((Math.random() * 2 - 1) - y); a[at + k] += amp * Math.exp(-k / (0.012 * rate)) * (y + 0.3 * Math.sin((2 * Math.PI * 95 * k) / rate)); }
      });
    }, 1));
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    chain(s, filter('lowpass', 1600), gainNode(0.8), out); s.start(0);
    return [rumble, body, sway, s];
  },

  fan: (out) => {
    const air = loop(noise('pink'), chain(filter('bandpass', 700, 0.5), gainNode(0.75), out));
    const g = gainNode(1); const whoosh = loop(noise('pink'), chain(filter('bandpass', 1500, 1.2), g, gainNode(0.12), out));
    const blade = lfo(11, 0.35, g.gain);
    const hum = ctx.createOscillator(); hum.frequency.value = 100; const hg = gainNode(0.012); chain(hum, hg, out); hum.start();
    return [air, whoosh, blade, hum];
  },

  traffic: (out) => {
    const base = loop(noise('brown'), chain(filter('lowpass', 320), gainNode(0.55), out));
    let alive = true; let timer = null;
    const pass = () => { // mobil lewat: suara mendekat lalu menjauh, bergeser kiri → kanan
      if (!alive) return;
      const now = ctx.currentTime; const dur = 3 + Math.random() * 3;
      const src = ctx.createBufferSource(); src.buffer = noise('pink'); src.loop = true;
      const bp = filter('bandpass', 900, 0.8);
      bp.frequency.setValueAtTime(1000 + Math.random() * 300, now); bp.frequency.linearRampToValueAtTime(520, now + dur);
      const e = gainNode(0); const peak = 0.12 + Math.random() * 0.2;
      e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(peak, now + dur * 0.5); e.gain.linearRampToValueAtTime(0, now + dur);
      const pn = panner(0);
      if (pn.pan) { const dir = Math.random() < 0.5 ? 1 : -1; pn.pan.setValueAtTime(-0.8 * dir, now); pn.pan.linearRampToValueAtTime(0.8 * dir, now + dur); }
      chain(src, bp, e, pn, out); src.start(now, Math.random() * 3); src.stop(now + dur + 0.2);
      timer = setTimeout(pass, (1.2 + Math.random() * 4.5) * 1000);
    };
    timer = setTimeout(pass, 500);
    return [base, { stop: () => { alive = false; clearTimeout(timer); } }];
  },

  vinyl: (out) => {
    const buf = cached('vinyl', () => makeBuffer(6, (a, r) => {
      fillClicks(a, r, { count: 140, minDecay: 0.0003, maxDecay: 0.0015, amp: 0.9, power: 3 });
      let y = 0;
      for (let i = 0; i < a.length; i++) { y = 0.96 * y + 0.04 * (Math.random() * 2 - 1); a[i] += y * 0.12; }
    }, 2));
    const s1 = loop(buf, chain(filter('lowpass', 6000), gainNode(0.8), out));
    const s2 = loop(noise('brown'), chain(filter('lowpass', 90), gainNode(0.06), out));
    return [s1, s2];
  },
};

// ---------- API ----------
export function level(id) { const v = voices.get(id); return v ? v.level : 0; }
export function activeIds() { return [...voices.keys()]; }
export const isPlaying = () => voices.size > 0;
/** true kalau browser belum mengizinkan suara (perlu ketukan pengguna). */
export const isSuspended = () => !!ctx && ctx.state !== 'running';

/** Atur volume suara (0–1). 0 = berhenti (dengan fade). */
export function setLevel(id, value) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  let voice = voices.get(id);
  if (!v) {
    if (voice) {
      voices.delete(id);
      const c = ensure();
      voice.gain.gain.setTargetAtTime(0, c.currentTime, 0.25);
      setTimeout(() => voice.stop(), 1500);
      emit();
    }
    return;
  }
  const c = ensure();
  if (!voice) {
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    let parts;
    if (id.startsWith('custom:')) {
      const b = customBuffers.get(id);
      if (!b) return;
      parts = [loop(b, gain)];
    } else if (FILES[id]) parts = [fileVoice(id, gain)];
    else if (RECIPES[id]) parts = RECIPES[id](gain);
    else return;
    voice = {
      gain, level: v,
      stop: () => { parts.forEach((p) => { try { p.stop(); } catch { /* abaikan */ } }); try { gain.disconnect(); } catch { /* abaikan */ } },
    };
    voices.set(id, voice);
  }
  voice.level = v;
  // kurva kuadrat terasa lebih alami untuk slider volume
  voice.gain.gain.setTargetAtTime(v * v, c.currentTime, 0.2);
  emit();
}

/** Terapkan satu racikan {id: level}; suara yang tidak disebut dimatikan. */
export function applyMix(mix = {}) {
  for (const id of [...voices.keys()]) if (!mix[id]) setLevel(id, 0);
  for (const [id, v] of Object.entries(mix)) if (v > 0) setLevel(id, v);
}
export function currentMix() {
  const m = {};
  for (const [id, v] of voices) m[id] = Math.round(v.level * 100) / 100;
  return m;
}
export function stopAll() { for (const id of [...voices.keys()]) setLevel(id, 0); }

export function setMaster(v, rampSeconds = 0.3) {
  masterLevel = Math.max(0, Math.min(1, v));
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(masterLevel, ctx.currentTime + Math.max(0.02, rampSeconds));
}
export const getMaster = () => masterLevel;

/** Bunyi lonceng lembut (Pomodoro). */
export function chime() {
  const c = ensure();
  const now = c.currentTime;
  [[880, 0], [1318.5, 0.18], [1760, 0.36]].forEach(([f, d]) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const e = c.createGain();
    e.gain.setValueAtTime(0, now + d);
    e.gain.linearRampToValueAtTime(0.18, now + d + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, now + d + 1.6);
    o.connect(e).connect(c.destination);
    o.start(now + d);
    o.stop(now + d + 1.7);
  });
}

/** Daftarkan suara sendiri dari ArrayBuffer file audio. */
export async function addCustom(id, arrayBuffer) {
  const c = ensure();
  const buf = await c.decodeAudioData(arrayBuffer.slice(0));
  customBuffers.set(id, buf);
  return buf.duration;
}
export const hasCustom = (id) => customBuffers.has(id);
export function removeCustom(id) { setLevel(id, 0); customBuffers.delete(id); }

/** Buka kunci audio (harus dipanggil dari ketukan/klik pengguna). */
export function unlock() { try { ensure(); } catch { /* tidak didukung */ } }
