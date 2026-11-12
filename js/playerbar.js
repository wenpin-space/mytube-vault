// Bilah player bawah: bilah progres yang bisa ditarik, volume, transisi halus antar lagu,
// dan potong awal/akhir lagu. Dipisah dari main.js (v39); main.js hanya memanggil fungsi yang dikembalikan.

import { createSeekbar } from './seekbar.js';
import { trimDialog } from './trim.js';
import { formatDuration } from './utils.js';

const $ = (id) => document.getElementById(id);

export function createPlayerBar({ player, store, ui, toast }) {
  // ---------- bilah progres (tarik untuk melompat) & volume ----------
  const seekbar = createSeekbar($('dock-progress'), {
    duration: () => player.duration(),
    seek: (t) => { player.seek(t); requestAnimationFrame(renderTime); },
    onPreview: (t) => { $('dock-cur').textContent = formatDuration(t) || '0:00'; },
  });
  function renderTime() {
    if (!player.current) return;
    const t = player.time();
    const d = player.duration();
    seekbar.set(t, d);
    if (!seekbar.dragging) ui.renderProgress(t, d);
  }
  /** Arsir bagian intro/outro yang dipotong di bilah progres. */
  function renderCuts() {
    const cur = player.current;
    const v = cur && store.data.videos[cur.youtubeId];
    seekbar.setCuts(v ? v.trim : null, player.duration() || (v && v.duration) || 0);
  }

  /** Volume yang dipilih pengguna (0–100); diingat antar-sesi. Fade/timer tidur tidak mengubah nilai ini. */
  const userVolume = () => (Number.isFinite(store.ui.volume) ? store.ui.volume : player.volume());
  function renderVol() { ui.renderVolume(userVolume(), player.isMuted()); }
  function setUserVolume(v) {
    const vol = Math.max(0, Math.min(100, Math.round(v)));
    store.ui.volume = vol;
    store.saveUiQuiet();
    player.setVolume(vol);
    fade.base = vol; fade.applied = null;
    renderVol();
    return vol;
  }
  $('dock-volume').addEventListener('input', (e) => setUserVolume(Number(e.target.value)));
  $('dock-volume').addEventListener('wheel', (e) => { e.preventDefault(); setUserVolume(userVolume() + (e.deltaY < 0 ? 5 : -5)); }, { passive: false });


  // ---------- transisi halus antar lagu (fade out di akhir, fade in di awal) ----------
  // Player YouTube hanya satu, jadi crossfade sejati tidak mungkin; yang bisa: volume turun pelan
  // di detik-detik terakhir lalu naik pelan di awal lagu berikutnya.
  const FADE_OUT = 4;
  const FADE_IN = 2;
  const fade = { base: null, applied: null };
  setInterval(() => {
    if (store.ui.fade !== true || !player.current || !player.isPlaying) {
      if (fade.applied != null && fade.base != null) { player.setVolume(fade.base); fade.applied = null; }
      return;
    }
    if (player.isMuted()) return;
    const d = player.duration();
    if (!d || d < 20) return;
    const cut = player.bounds();
    const t = player.time() - cut.start;      // waktu sejak titik mulai (intro yang dipotong tidak dihitung)
    const left = (cut.end || d) - player.time();
    let factor = 1;
    if (left < FADE_OUT) factor = Math.max(0.05, left / FADE_OUT);
    else if (t >= 0 && t < FADE_IN) factor = Math.max(0.15, t / FADE_IN);
    if (factor >= 1) {
      if (fade.applied != null) { player.setVolume(fade.base); fade.applied = null; }
      else fade.base = player.volume(); // ikuti volume yang diatur pengguna
      return;
    }
    if (fade.base == null) fade.base = player.volume();
    const v = Math.round(fade.base * factor);
    if (v !== fade.applied) { player.setVolume(v); fade.applied = v; }
  }, 150);

  // ---------- potong awal/akhir lagu (lewati intro & outro) ----------
  player.trimLookup = (id) => store.getTrim(id);
  setInterval(() => { if (player.isPlaying) player.checkTrim(); }, 250);

  async function editTrim() {
    const cur = player.current;
    if (!cur) { toast('Putar lagunya dulu, lalu buka menu ⋮ di player.', 'info'); return; }
    const id = cur.youtubeId;
    const v = store.data.videos[id] || {};
    player.trimPaused = true; // selama dialog terbuka lagu boleh lewat dari titik akhir (untuk mencari titik baru)
    let res;
    try {
      res = await trimDialog({ title: v.title || '', trim: store.getTrim(id), duration: player.duration() || v.duration || 0, player });
    } finally { player.trimPaused = false; }
    if (res == null) return;
    const before = store.getTrim(id);
    const saved = res === 'clear' ? store.setTrim(id, 0, 0) : store.setTrim(id, res.start, res.end);
    renderCuts();
    const undo = { label: 'Urungkan', fn: () => { store.setTrim(id, before ? before[0] : 0, before ? before[1] : 0); renderCuts(); } };
    if (!saved) { toast(before ? 'Potongan dihapus: lagu diputar penuh lagi.' : 'Tidak ada yang dipotong.', 'info', 5000, before ? undo : null); return; }
    const parts = [];
    if (saved[0]) parts.push(`mulai ${formatDuration(saved[0])}`);
    if (saved[1]) parts.push(`berakhir ${formatDuration(saved[1])}`);
    toast(`Potongan disimpan: ${parts.join(', ')}.`, 'success', 6000, undo);
    // sedang di bagian intro yang baru dipotong → langsung lompat ke titik mulai
    if (player.current && player.current.youtubeId === id && saved[0] && player.time() < saved[0]) player.seek(saved[0]);
  }

  // volume terakhir yang dipilih di aplikasi ini (player YouTube tidak selalu mengingatnya)
  let volumeApplied = false;
  player.on((type) => {
    if (type === 'playing' && !volumeApplied) {
      volumeApplied = true;
      if (Number.isFinite(store.ui.volume) && !player.isMuted() && Math.abs(player.volume() - store.ui.volume) > 1) player.setVolume(store.ui.volume);
    }
    if (type === 'track' || type === 'playing') { renderCuts(); renderVol(); }
  });

  return { renderTime, renderCuts, renderVol, userVolume, setUserVolume, editTrim };
}
