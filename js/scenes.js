// Latar animasi Lobby: hanya Kamar santai (dilukis dengan sapuan kuas, lihat room.js & paint.js).

import { roomScene } from './room.js';

export const SCENES = [{ id: 'room', name: 'Kamar santai', style: 'Lukisan · lokasi, cuaca & waktu' }];

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

const FACTORY = { room: roomScene };
export const isCanvasScene = (id) => !!FACTORY[id];

/** Resolusi kanvas Lobby: lukisan sudah lembut, jadi 1,5× sudah tajam dan jauh lebih ringan di HP. */
export const canvasDpr = () => Math.min(1.5, window.devicePixelRatio || 1);
/** HP/tablet (layar sentuh): 30 fps cukup untuk animasi santai dan hemat baterai. */
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Penjalan animasi: setScene(id), start(), stop(), setState(obj). */
export function createSceneRunner(canvas) {
  const c = canvas.getContext('2d');
  let scene = null;
  let id = null;
  let raf = 0;
  let last = 0;
  const t0 = performance.now();
  let w = 0, h = 0;
  let state = {};
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function size() {
    const dpr = canvasDpr();
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene) scene.init(w, h);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    // saat lukisan baru sedang disiapkan di belakang, animasi diperlambat supaya CPU dipakai melukis
    const busy = scene && scene.busy;
    const minGap = reduce ? 500 : coarse() || busy ? 1000 / 30 : 1000 / 60;
    if (now - last < minGap - 1) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    globalThis.__lobbyFrames = (globalThis.__lobbyFrames || 0) + 1;
    if (scene) { try { scene.draw(c, reduce ? dt * 0.2 : dt, (now - t0) / 1000, w, h, state); } catch (e) { console.error(e); stop(); } }
  }
  function start() { if (!raf && scene) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  const onResize = () => { if (scene) size(); };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (canvas.isConnected && !canvas.closest('[hidden]')) start(); });
  return {
    setScene(next) {
      if (next === id && scene) { start(); return; } // dibuka lagi: lanjutkan animasi
      id = next;
      scene = FACTORY[next] ? FACTORY[next]() : null;
      if (scene) { size(); start(); } else { stop(); c.clearRect(0, 0, canvas.width, canvas.height); }
    },
    setState(s) { state = { ...state, ...s }; },
    start, stop, resize: size,
    get running() { return !!raf; },
    /** Lukisan suasana baru sedang disiapkan (lukisan lama masih tampil). */
    get busy() { return !!(scene && scene.busy); },
  };
}
