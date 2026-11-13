// Kontrol di notifikasi, layar kunci, dan tombol media keyboard (v41) lewat Media Session API.
//
// Masalahnya: suara berasal dari iframe YouTube, dan browser mengarahkan tombol media ke frame yang
// sedang memutar suara — jadi tombol Sebelumnya/Berikutnya akan dipegang player YouTube (yang tidak
// tahu antrean kita). Solusinya: halaman ini ikut memutar audio sunyi pendek yang diulang (tanpa
// suara apa pun) selama lagu berjalan. Frame paling atas yang memutar media diutamakan, sehingga judul,
// sampul, dan semua tombol di notifikasi mengikuti antrean MyTube Vault.

const SEEK_STEP = 10;

/** File WAV sunyi 6 detik (8 kHz, 8-bit mono, ±48 KB). Notifikasi media Android hanya muncul untuk media ≥ 5 detik. */
export function silentWav(seconds = 6, rate = 8000) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n);
  const d = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); d.setUint32(4, 36 + n, true); w(8, 'WAVE');
  w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, rate, true); d.setUint32(28, rate, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true);
  w(36, 'data'); d.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128); // 8-bit tanpa tanda: 128 = hening
  return buf;
}

/**
 * getMeta(): { title, artist, album, art: (quality) => url } untuk lagu sekarang, atau null.
 * enabled(): setelan pengguna (Setelan → Umum → Kontrol di notifikasi & layar kunci).
 */
export function createMediaSession({ player, getMeta, enabled = () => true }) {
  const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
  if (!ms || typeof MediaMetadata === 'undefined') return { configure() {}, update() {}, supported: false };
  let anchor = null;
  let on = false;
  let lastMeta = '';
  let lastPos = 0;

  const anchorEl = () => {
    if (anchor) return anchor;
    anchor = new Audio(URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' })));
    anchor.loop = true;
    anchor.preload = 'auto';
    anchor.setAttribute('aria-hidden', 'true');
    return anchor;
  };
  // iPhone/iPad: memutar audio kedua bisa menghentikan suara YouTube, jadi di sana hanya judul & tombol yang dipasang.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const setAnchor = (playing) => {
    if (!on || ios) { if (anchor && !anchor.paused) anchor.pause(); return; }
    const a = anchorEl();
    if (playing && a.paused) a.play().catch(() => { /* belum ada interaksi pengguna: coba lagi saat lagu berikutnya */ });
    else if (!playing && !a.paused) a.pause();
  };

  const handlers = {
    play: () => { if (!player.isPlaying) player.toggle(); },
    pause: () => player.pause(),
    stop: () => player.pause(),
    previoustrack: () => player.prev(),
    nexttrack: () => player.next(),
    seekbackward: (d) => player.seek(Math.max(player.bounds().start, player.time() - ((d && d.seekOffset) || SEEK_STEP))),
    seekforward: (d) => player.seek(Math.min(player.duration() - 1, player.time() + ((d && d.seekOffset) || SEEK_STEP))),
    seekto: (d) => { if (d && Number.isFinite(d.seekTime)) player.seek(d.seekTime); },
  };
  const bind = (yes) => {
    for (const [k, fn] of Object.entries(handlers)) {
      try { ms.setActionHandler(k, yes ? fn : null); } catch { /* aksi ini tidak didukung browser */ }
    }
  };

  function update(force = false) {
    if (!on) return;
    const cur = player.current;
    if (!cur) {
      ms.metadata = null; ms.playbackState = 'none'; lastMeta = '';
      setAnchor(false);
      return;
    }
    const m = getMeta() || {};
    const key = `${cur.youtubeId}|${m.title}|${m.artist}|${m.album}`;
    if (force || key !== lastMeta) {
      lastMeta = key;
      try {
        ms.metadata = new MediaMetadata({
          title: m.title || 'MyTube Vault', artist: m.artist || '', album: m.album || 'MyTube Vault',
          artwork: m.art ? [
            { src: m.art('mqdefault'), sizes: '320x180', type: 'image/jpeg' },
            { src: m.art('hqdefault'), sizes: '480x360', type: 'image/jpeg' },
          ] : [],
        });
      } catch { /* abaikan */ }
    }
    ms.playbackState = player.isPlaying ? 'playing' : 'paused';
    setAnchor(player.isPlaying);
    position();
  }
  /** Posisi & durasi untuk bilah geser di notifikasi. */
  function position() {
    if (!on || !ms.setPositionState || !player.current) return;
    const d = player.duration();
    const t = player.time();
    if (!(d > 0) || !Number.isFinite(t)) return;
    lastPos = Date.now();
    try { ms.setPositionState({ duration: d, position: Math.min(d, Math.max(0, t)), playbackRate: player.rate || 1 }); } catch { /* abaikan */ }
  }

  function configure() {
    const want = !!enabled();
    if (want === on) { update(true); return; }
    on = want;
    bind(on);
    if (on) update(true);
    else { try { ms.metadata = null; ms.playbackState = 'none'; } catch { /* */ } setAnchor(false); lastMeta = ''; }
  }

  player.on((type) => {
    if (type === 'track' || type === 'state' || type === 'playing' || type === 'ended' || type === 'error') update();
  });
  // posisi diperbarui sesekali (browser memperkirakan sendiri di antaranya)
  setInterval(() => { if (on && player.isPlaying && Date.now() - lastPos > 5000) position(); }, 1000);

  // configure() pertama dipanggil main.js setelah setelan dimuat
  return { configure, update, position, supported: true };
}
