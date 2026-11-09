// Timer tidur (satu untuk seluruh aplikasi: menu player & Lobby). Di menit terakhir musik dan suara
// alam memelan perlahan, lalu berhenti. Pilihan "akhir lagu ini" berhenti setelah lagu selesai.

export const SLEEP_PRESETS = [15, 30, 45, 60, 90];
const FADE = 90; // detik terakhir untuk memelankan suara

/** Label singkat untuk player bawah (murni, mudah diuji). */
export function sleepLabel({ end = 0, track = false } = {}, now = Date.now()) {
  if (track) return '⏾ akhir lagu';
  if (end) return `⏾ ${Math.max(1, Math.ceil((end - now) / 60000))} mnt`;
  return '';
}

export function createSleepTimer({ player, amb, getMaster = () => 0.8, toast = () => {} }) {
  const st = { end: 0, track: false, baseVol: null, timer: 0 };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* abaikan */ } });
  const restore = () => {
    if (st.baseVol != null) player.setVolume(st.baseVol);
    st.baseVol = null;
    try { amb.setMaster(getMaster(), 0.5); } catch { /* tidak didukung */ }
  };
  const clear = () => { clearInterval(st.timer); st.timer = 0; st.end = 0; st.track = false; player.stopAfterCurrent = false; };

  function tick() {
    if (!st.end) return;
    const left = (st.end - Date.now()) / 1000;
    if (left > FADE && st.baseVol != null) restore(); // waktu ditambah saat sedang memelan
    if (left <= FADE && left > 0) {
      if (st.baseVol == null) st.baseVol = player.volume();
      const f = left / FADE;
      if (player.isPlaying) player.setVolume(Math.round(st.baseVol * f));
      try { amb.setMaster(getMaster() * f, 0.9); } catch { /* tidak didukung */ }
    }
    if (left <= 0) {
      player.pause();
      try { amb.stopAll(); } catch { /* tidak didukung */ }
      const base = st.baseVol;
      st.baseVol = null;
      clear();
      setTimeout(() => { if (base != null) player.setVolume(base); try { amb.setMaster(getMaster(), 0.1); } catch { /* */ } }, 1500);
      toast('Timer tidur selesai. Selamat tidur 🌙', 'info', 6000);
    }
    emit();
  }

  return {
    /** menit (angka), 'track' = akhir lagu ini, 0 = matikan. */
    set(min) {
      const had = st.end || st.track;
      restore();
      clear();
      if (min === 'track') {
        st.track = true;
        player.stopAfterCurrent = true;
        toast('Musik berhenti setelah lagu ini selesai.', 'success');
      } else if (min > 0) {
        st.end = Date.now() + min * 60000;
        st.timer = setInterval(tick, 1000);
        toast(`Timer tidur ${min} menit dimulai. Suara memelan perlahan di menit terakhir.`, 'success');
      } else if (had) toast('Timer tidur dimatikan.');
      emit();
    },
    add(min) { if (st.end) { st.end += min * 60000; tick(); } },
    /** Player memberi tahu lagu terakhir sudah selesai (mode "akhir lagu ini"). */
    trackEnded() {
      if (!st.track) return;
      st.track = false;
      try { amb.stopAll(); } catch { /* tidak didukung */ }
      toast('Timer tidur: musik berhenti setelah lagu selesai. 🌙', 'info', 6000);
      emit();
    },
    get active() { return !!(st.end || st.track); },
    get endOfTrack() { return st.track; },
    remaining() { return st.end ? Math.max(0, (st.end - Date.now()) / 1000) : 0; },
    label() { return sleepLabel(st); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
