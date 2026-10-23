// Fitur khusus HP/Android dan PWA:
// - tombol Back Android menutup panel (sheet, player layar penuh, antrean, menu playlist)
// - urutan manual dengan sentuhan (geser pegangan)
// - pasang sebagai aplikasi (PWA) + terima "Bagikan" dari aplikasi YouTube


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

// ---------- PWA ----------
let installEvent = null;

export function setupPwa(onInstallAvailable, onUpdate) {
  const okContext = window.isSecureContext && location.protocol !== 'file:';
  if ('serviceWorker' in navigator && okContext) {
    const hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch((e) => console.warn('Service worker gagal didaftarkan:', e));
    });
    // Versi baru aktif → tawarkan muat ulang (tidak otomatis, supaya musik tidak terputus).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && typeof onUpdate === 'function') onUpdate();
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
