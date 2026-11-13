// Ketuk video (v41): sekali = putar/jeda, dua kali di sisi kiri/kanan = mundur/maju 10 detik
// (ketuk lagi berturut-turut untuk 20, 30, … detik), seperti aplikasi YouTube.
//
// Iframe YouTube menelan semua ketukan, jadi dipasang lapisan tipis di atas video. Bagian bawah
// (±48 px) dibiarkan terbuka supaya tombol bawaan YouTube (kualitas, teks, layar penuh) tetap bisa dipakai.

const STEP = 10;
const DOUBLE_MS = 300;   // jeda maksimum antar-ketukan untuk dianggap ketuk dua kali
const CHAIN_MS = 700;    // ketukan lanjutan setelah lompat pertama menambah lompatan

/** Sisi ketukan dari posisi x (0..1): 'back' (kiri 40%), 'fwd' (kanan 40%), atau 'mid'. */
export function tapSide(fx) {
  return fx < 0.4 ? 'back' : fx > 0.6 ? 'fwd' : 'mid';
}

export function enableVideoTaps(host, { player, icon, onToggle }) {
  if (!host) return;
  const layer = document.createElement('div');
  layer.className = 'video-tap';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<span class="vt-bubble back"></span><span class="vt-bubble fwd"></span><span class="vt-center"></span>';
  host.appendChild(layer);
  const bubble = { back: layer.querySelector('.vt-bubble.back'), fwd: layer.querySelector('.vt-bubble.fwd') };
  const center = layer.querySelector('.vt-center');

  let lastTap = 0;
  let lastSide = '';
  let single = 0;
  let chain = { side: '', n: 0, until: 0 };
  let hideT = 0;

  function show(side, secs) {
    const b = bubble[side];
    b.innerHTML = `${icon(side === 'back' ? 'rewind' : 'forward')}<span>${side === 'back' ? '−' : '+'}${secs} dtk</span>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(hideT);
    hideT = setTimeout(() => { bubble.back.classList.remove('show'); bubble.fwd.classList.remove('show'); }, 650);
  }
  function jump(side) {
    const now = Date.now();
    chain = chain.side === side && now < chain.until ? { side, n: chain.n + 1, until: now + CHAIN_MS } : { side, n: 1, until: now + CHAIN_MS };
    const { start, end } = player.bounds();
    const d = player.duration();
    const stop = (end || d || Infinity) - 1;
    const t = player.time() + (side === 'back' ? -STEP : STEP);
    player.seek(Math.max(start, Math.min(stop, t)));
    show(side, chain.n * STEP);
    if (navigator.vibrate) navigator.vibrate(8);
  }
  function flashToggle(ic) {
    center.innerHTML = icon(ic, 'fill');
    center.classList.remove('show'); void center.offsetWidth; center.classList.add('show');
  }

  layer.addEventListener('pointerup', (e) => {
    if (e.button > 0 || !player.current) return;
    const r = layer.getBoundingClientRect();
    const side = tapSide((e.clientX - r.left) / Math.max(1, r.width));
    const now = Date.now();
    // ketukan beruntun di sisi yang sama setelah lompatan pertama: langsung lompat lagi
    if (side !== 'mid' && chain.side === side && now < chain.until) { clearTimeout(single); single = 0; jump(side); lastTap = 0; return; }
    if (now - lastTap < DOUBLE_MS && side === lastSide && side !== 'mid') {
      clearTimeout(single); single = 0; lastTap = 0;
      jump(side);
      return;
    }
    lastTap = now; lastSide = side;
    clearTimeout(single);
    single = setTimeout(() => { single = 0; const was = player.isPlaying; onToggle(); flashToggle(was ? 'pause' : 'play'); }, DOUBLE_MS);
  });
  // klik dua kali di PC jangan sampai menyorot teks / memicu layar penuh browser
  layer.addEventListener('dblclick', (e) => e.preventDefault());
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
}
