// Fitur khusus HP/Android dan PWA:
// - tombol Back Android menutup panel (sheet, player layar penuh, antrean, menu playlist)
// - urutan manual dengan sentuhan (geser pegangan)
// - kontrol di notifikasi / layar kunci (Media Session API)
// - pasang sebagai aplikasi (PWA) + terima "Bagikan" dari aplikasi YouTube

import { thumbUrl } from './metadata.js';

export const isPhone = () => window.matchMedia('(max-width: 640px)').matches;

// ---------- overlay + tombol Back ----------
// Setiap panel yang dibuka mendapat satu entri riwayat; tombol Back menutup panel teratas.
const stack = [];

export const overlay = {
  isOpen(name) { return stack.some((o) => o.name === name); },
  open(name, close) {
    if (this.isOpen(name)) return;
    stack.push({ name, close });
    try { history.pushState({ mtvOverlay: name }, ''); } catch { /* abaikan */ }
  },
  /** Tutup lewat UI (tombol X, scrim). Kalau panel ini teratas, mundurkan riwayat juga. */
  close(name) {
    const i = stack.findIndex((o) => o.name === name);
    if (i < 0) return;
    if (i === stack.length - 1 && history.state && history.state.mtvOverlay === name) {
      history.back(); // popstate yang akan memanggil close()
      return;
    }
    const [o] = stack.splice(i, 1);
    o.close();
  },
};

window.addEventListener('popstate', () => {
  const top = stack.pop();
  if (top) top.close();
});

// ---------- urutan manual dengan sentuhan ----------
export function enableTouchReorder(list, { canReorder, entryByKey, move }) {
  let drag = null;

  const clear = () => list.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));

  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip || e.pointerType === 'mouse' || !canReorder()) return;
    const row = grip.closest('.vrow');
    const en = row && entryByKey(row.dataset.key);
    if (!en) return;
    e.preventDefault();
    try { grip.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
    drag = { row, from: en.index, target: null, after: false, y: e.clientY, raf: 0 };
    row.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(12);
  });

  list.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.y = e.clientY;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el && el.closest('.vrow');
    clear();
    if (row && list.contains(row) && row !== drag.row) {
      const r = row.getBoundingClientRect();
      drag.after = e.clientY > r.top + r.height / 2;
      drag.target = row;
      row.classList.add(drag.after ? 'drop-after' : 'drop-before');
    } else {
      drag.target = null;
    }
    // gulir otomatis di dekat tepi layar
    if (!drag.raf) {
      const step = () => {
        if (!drag) return;
        const edge = 90;
        const bottomLimit = window.innerHeight - edge - 120; // di atas dock + navigasi bawah
        let dy = 0;
        if (drag.y < edge + 60) dy = -8;
        else if (drag.y > bottomLimit) dy = 8;
        if (dy) window.scrollBy(0, dy);
        drag.raf = dy ? requestAnimationFrame(step) : 0;
      };
      drag.raf = requestAnimationFrame(step);
    }
  });

  const end = (commit) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    d.row.classList.remove('dragging');
    clear();
    if (!commit || !d.target) return;
    const t = entryByKey(d.target.dataset.key);
    if (!t) return;
    let to = t.index + (d.after ? 1 : 0);
    if (to > d.from) to--;
    if (to !== d.from) move(t.playlistId, d.from, to);
  };
  list.addEventListener('pointerup', () => end(true));
  list.addEventListener('pointercancel', () => end(false));
}

// ---------- jembatan audio + notifikasi milik aplikasi ----------
// Masalah: audio datang dari iframe YouTube, jadi Android memakai notifikasi milik YouTube
// (tanpa Next/Back, tidak bisa kita kendalikan), dan YouTube menjeda diri saat layar mati.
// Solusi: putar audio "hening" (derau sangat kecil, tak terdengar) di halaman utama selama musik jalan.
// Chrome lalu memakai Media Session halaman utama → notifikasi kita (judul, Back/Next, seek),
// dan sesi media tetap hidup sehingga kita bisa terus meminta YouTube melanjutkan.

function silentWavUrl(seconds = 12, rate = 8000) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  // ±1 LSB pada 16-bit (≈ -90 dB): tidak terdengar, tapi bukan nol mutlak.
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, (i % 2 ? 1 : -1), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const bridge = { audio: null, want: false, unlocked: false };
function bridgeAudio() {
  if (!bridge.audio) {
    const a = document.createElement('audio');
    a.loop = true;
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    a.src = silentWavUrl();
    bridge.audio = a;
  }
  return bridge.audio;
}
function bridgePlay() {
  bridge.want = true;
  const a = bridgeAudio();
  if (!a.paused) return;
  const pr = a.play();
  if (pr && pr.then) pr.then(() => { bridge.unlocked = true; if (!bridge.want) a.pause(); }).catch(() => {});
}
function bridgePause() {
  bridge.want = false;
  if (bridge.audio && !bridge.audio.paused) bridge.audio.pause();
}

/**
 * Notifikasi/layar kunci + usaha tetap putar di latar belakang.
 * Mengembalikan fungsi update() untuk menyegarkan judul & posisi di notifikasi.
 */
export function setupBackgroundAudio(player, store, enabled) {
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
  let keep = false;     // musik seharusnya tetap jalan walau YouTube menjeda (bukan pengguna)
  let retryTimer = null;
  let retryUntil = 0;

  const userPausedRecently = () => Date.now() - player.pauseIntentAt < 2500;
  const shouldSound = () => player.isPlaying || player.state === 'loading' || (keep && !!player.current);

  // Buka "kunci" autoplay audio jembatan pada ketukan pertama pengguna.
  const unlock = () => {
    if (bridge.unlocked) return;
    bridgePlay();
    if (!shouldSound()) setTimeout(() => { if (!shouldSound()) bridgePause(); }, 0);
  };
  document.addEventListener('click', unlock, true);
  document.addEventListener('touchend', unlock, true);

  function stopRetry() { clearInterval(retryTimer); retryTimer = null; }
  function startRetry() {
    if (retryTimer || !enabled()) return;
    retryUntil = Date.now() + 90000; // coba terus selama 1,5 menit
    retryTimer = setInterval(() => {
      if (!keep || !player.current) { stopRetry(); return; }
      if (player.isPlaying) return;
      if (Date.now() > retryUntil) { // menyerah: tampilkan status jeda yang jujur di notifikasi
        stopRetry();
        keep = false;
        bridgePause();
        update();
        return;
      }
      player.resume();
    }, 2500);
  }

  function update() {
    if (shouldSound()) bridgePlay(); else bridgePause();
    if (!ms) return;
    const cur = player.current;
    if (!cur) { ms.metadata = null; ms.playbackState = 'none'; return; }
    const v = store.data.videos[cur.youtubeId] || {};
    const title = v.title || 'MyTube Vault';
    const m = ms.metadata;
    if (!m || m.title !== title || !m.artwork.length || !m.artwork[0].src.includes(cur.youtubeId)) {
      try {
        ms.metadata = new MediaMetadata({
          title,
          artist: v.channel || '',
          album: 'MyTube Vault',
          artwork: [
            { src: thumbUrl(cur.youtubeId, 'hqdefault'), sizes: '480x360', type: 'image/jpeg' },
            { src: thumbUrl(cur.youtubeId, 'mqdefault'), sizes: '320x180', type: 'image/jpeg' },
          ],
        });
      } catch { /* abaikan */ }
    }
    ms.playbackState = shouldSound() ? 'playing' : 'paused';
    const d = player.duration();
    if (d > 0 && ms.setPositionState) {
      try { ms.setPositionState({ duration: d, position: Math.min(d, Math.max(0, player.time())), playbackRate: 1 }); } catch { /* abaikan */ }
    }
  }

  if (ms) {
    const on = (action, fn) => { try { ms.setActionHandler(action, (d) => { fn(d); setTimeout(update, 50); }); } catch { /* tidak didukung */ } };
    on('play', () => {
      player.pauseIntentAt = 0;
      keep = true;
      bridgePlay();
      if (player.state === 'ended') player.toggle(); else player.resume();
      if (document.hidden) startRetry();
    });
    on('pause', () => {
      keep = false;
      stopRetry();
      if (player.isPlaying) player.toggle(); else player.pauseIntentAt = Date.now();
      bridgePause();
    });
    on('previoustrack', () => { keep = true; bridgePlay(); player.prev(); });
    on('nexttrack', () => { keep = true; bridgePlay(); player.next(); });
    on('seekbackward', (d) => player.seek(Math.max(0, player.time() - ((d && d.seekOffset) || 10))));
    on('seekforward', (d) => player.seek(player.time() + ((d && d.seekOffset) || 10)));
    on('seekto', (d) => { if (d && typeof d.seekTime === 'number') player.seek(d.seekTime); });
    on('stop', () => { keep = false; stopRetry(); player.pauseIntentAt = Date.now(); if (player.isPlaying) player.toggle(); bridgePause(); });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      keep = player.isPlaying || player.state === 'loading' || player.state === 'buffering';
      if (keep) bridgePlay();
    } else {
      // Kembali ke aplikasi: kalau YouTube sempat menjeda sendiri, lanjutkan.
      if (keep && enabled() && player.current && !player.isPlaying && !userPausedRecently()) player.resume();
      stopRetry();
    }
    update();
  });

  player.on((type) => {
    if (type === 'playing') {
      keep = true;
    } else if (type === 'track' && !player.current) {
      keep = false; stopRetry();
    } else if (type === 'state' && (player.state === 'paused' || player.state === 'ended')) {
      if (userPausedRecently() || (player.state === 'ended' && !player.autoNext)) { keep = false; stopRetry(); }
      else if (player.state === 'paused' && document.hidden && keep && enabled()) startRetry();
      else if (!document.hidden && player.state === 'paused') keep = false; // dijeda dari dalam player saat terlihat
    } else if (type === 'unstarted' && document.hidden && keep && enabled()) {
      startRetry(); // lagu berikutnya tertahan saat layar mati
    } else if (type === 'end-of-queue') {
      keep = false; stopRetry();
    }
    update();
  });

  return update;
}

// ---------- PWA ----------
let installEvent = null;

export function setupPwa(onInstallAvailable) {
  const okContext = window.isSecureContext && location.protocol !== 'file:';
  if ('serviceWorker' in navigator && okContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker gagal didaftarkan:', e));
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    onInstallAvailable(true);
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    onInstallAvailable(false);
  });
}

export async function promptInstall() {
  if (!installEvent) return null;
  installEvent.prompt();
  const choice = await installEvent.userChoice.catch(() => null);
  installEvent = null;
  return choice ? choice.outcome : null;
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Baca parameter dari share target / shortcut, lalu bersihkan URL. */
export function takeLaunchParams() {
  const p = new URLSearchParams(location.search);
  const out = {
    shared: [p.get('share_url'), p.get('share_text'), p.get('share_title')].filter(Boolean).join('\n'),
    action: p.get('action'),
    view: p.get('view'),
  };
  if ([...p.keys()].length) {
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch { /* abaikan */ }
  }
  return out;
}
