// Suara alam untuk Lobby — semuanya DISINTESIS di browser (Web Audio): tanpa file, jalan offline,
// tanpa urusan hak cipta. Plus "suara sendiri" dari file audio yang diunggah pengguna.

export const SOUNDS = [
  { id: 'rain', name: 'Hujan', icon: 'rain' },
  { id: 'thunder', name: 'Petir', icon: 'bolt' },
  { id: 'wind', name: 'Angin', icon: 'wind' },
  { id: 'waves', name: 'Ombak', icon: 'waves' },
  { id: 'fire', name: 'Api unggun', icon: 'flame' },
  { id: 'crickets', name: 'Jangkrik', icon: 'moon' },
  { id: 'birds', name: 'Burung', icon: 'bird' },
  { id: 'stream', name: 'Sungai', icon: 'droplet' },
  { id: 'cafe', name: 'Kafe', icon: 'coffee' },
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
    master.connect(ctx.destination);
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
/** Sambungkan berurutan; mengembalikan node PERTAMA (tempat sumber suara dihubungkan). */
const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[0]; };

// ---------- resep tiap suara: build(out) → fungsi stop ----------
const RECIPES = {
  white: (out) => { const s = loop(noise('white'), chain(gainNode(0.32), out)); return [s]; },
  pink: (out) => { const s = loop(noise('pink'), out); return [s]; },
  brown: (out) => { const s = loop(noise('brown'), out); return [s]; },

  rain: (out) => {
    const hp = filter('highpass', 500);
    const lp = filter('lowpass', 7000);
    const g = gainNode(1.1);
    chain(hp, lp, g, out);
    const s1 = loop(noise('pink'), hp);
    const drops = cached('rain-drops', () => makeBuffer(4, (a, r) => fillClicks(a, r, { count: 1400, minDecay: 0.0006, maxDecay: 0.003, amp: 0.7, power: 2 }), 2));
    const bp = filter('bandpass', 2600, 0.6);
    const g2 = gainNode(1.2);
    chain(bp, g2, out);
    const s2 = loop(drops, bp);
    const wob = lfo(0.07, 1200, lp.frequency);
    return [s1, s2, wob];
  },

  thunder: (out) => {
    let alive = true;
    let timer = null;
    const rumble = () => {
      if (!alive) return;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise('brown');
      const lp = filter('lowpass', 140 + Math.random() * 220, 0.9);
      const env = gainNode(0);
      const peak = 0.7 + Math.random() * 0.6;
      const attack = 0.08 + Math.random() * 0.5;
      const dur = 4 + Math.random() * 5;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(peak, now + attack);
      env.gain.setTargetAtTime(peak * 0.45, now + attack, 0.4);
      env.gain.setTargetAtTime(0.0001, now + attack + 1.2, dur / 4);
      chain(src, lp, env, out);
      src.start(now, Math.random() * 3);
      src.stop(now + attack + dur + 2);
      timer = setTimeout(rumble, (12 + Math.random() * 28) * 1000);
    };
    timer = setTimeout(rumble, 1500);
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
    const bp = filter('bandpass', 520, 0.55);
    const g = gainNode(0.8);
    chain(bp, g, out);
    const s1 = loop(noise('brown'), bp);
    const s2 = loop(noise('pink'), chain(filter('bandpass', 1500, 0.9), gainNode(0.1), out));
    const l1 = lfo(0.23, 0.18, g.gain);
    const l2 = lfo(0.37, 120, bp.frequency);
    let alive = true;
    let timer = null;
    const clink = () => {
      if (!alive) return;
      const now = ctx.currentTime;
      const f = 2300 + Math.random() * 1800;
      [1, 2.76].forEach((m, i) => {
        const o = ctx.createOscillator();
        o.frequency.value = f * m;
        const e = gainNode(0);
        e.gain.setValueAtTime(0, now);
        e.gain.linearRampToValueAtTime((i ? 0.015 : 0.035) * (0.5 + Math.random()), now + 0.004);
        e.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        chain(o, e, out);
        o.start(now);
        o.stop(now + 0.6);
      });
      timer = setTimeout(clink, (2 + Math.random() * 7) * 1000);
    };
    timer = setTimeout(clink, 1200);
    return [s1, s2, l1, l2, { stop: () => { alive = false; clearTimeout(timer); } }];
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
    } else if (RECIPES[id]) parts = RECIPES[id](gain);
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
