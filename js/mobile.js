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

// ---------- Media Session (notifikasi & layar kunci Android) ----------
export function setupMediaSession(player, store) {
  if (!('mediaSession' in navigator)) return () => {};
  const ms = navigator.mediaSession;
  const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* aksi tidak didukung */ } };
  safe('play', () => { if (!player.isPlaying) player.toggle(); });
  safe('pause', () => { if (player.isPlaying) player.toggle(); });
  safe('previoustrack', () => player.prev());
  safe('nexttrack', () => player.next());
  safe('seekbackward', (d) => player.seek(Math.max(0, player.time() - ((d && d.seekOffset) || 10))));
  safe('seekforward', (d) => player.seek(player.time() + ((d && d.seekOffset) || 10)));
  safe('seekto', (d) => { if (d && typeof d.seekTime === 'number') player.seek(d.seekTime); });

  let lastId = null;
  let lastTitle = null;
  return function update() {
    const cur = player.current;
    if (!cur) {
      ms.metadata = null;
      ms.playbackState = 'none';
      lastId = null;
      return;
    }
    const v = store.data.videos[cur.youtubeId] || {};
    const title = v.title || 'MyTube Vault';
    if (cur.youtubeId !== lastId || title !== lastTitle) {
      lastId = cur.youtubeId;
      lastTitle = title;
      try {
        ms.metadata = new MediaMetadata({
          title,
          artist: v.channel || '',
          album: 'MyTube Vault',
          artwork: [
            { src: thumbUrl(cur.youtubeId, 'mqdefault'), sizes: '320x180', type: 'image/jpeg' },
            { src: thumbUrl(cur.youtubeId, 'hqdefault'), sizes: '480x360', type: 'image/jpeg' },
          ],
        });
      } catch { /* abaikan */ }
    }
    ms.playbackState = player.isPlaying ? 'playing' : 'paused';
    const d = player.duration();
    if (d > 0 && ms.setPositionState) {
      try { ms.setPositionState({ duration: d, position: Math.min(d, player.time()), playbackRate: 1 }); } catch { /* abaikan */ }
    }
  };
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
