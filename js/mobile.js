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
  /** Tukar panel `from` dengan `to` tanpa menggeser riwayat (mis. Lobby → Lirik). */
  swap(from, to, close) {
    const i = stack.findIndex((o) => o.name === from);
    if (i < 0) { this.open(to, close); return; }
    stack[i] = { name: to, close };
    if (i === stack.length - 1) { try { history.replaceState({ mtvOverlay: to }, ''); } catch { /* abaikan */ } }
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
