// Perantara Lobby. Kode Lobby (kamar, kafe, pengunjung, pelukis, cuaca, suara alam: ±300 KB) tidak dimuat
// saat aplikasi dibuka, melainkan saat Lobby pertama kali dibutuhkan: dibuka, tombolnya disentuh, atau
// saat aplikasi senggang bila Lobby pernah dipakai (supaya lukisannya bisa disiapkan lebih dulu).
// Pemanggil memakai objek yang sama seperti hasil createLobby(); selama modul belum ada, pertanyaan
// ("terbuka?") dijawab tidak, dan perintah ("buka") menunggu modulnya selesai dimuat.

/** Muat sekali; kalau gagal (mis. offline sebelum pernah di-cache), boleh dicoba lagi. */
export function once(loader) {
  let p = null;
  return () => {
    if (!p) p = loader().catch((e) => { p = null; throw e; });
    return p;
  };
}

export function createLobbyHost({ onAmbient, toast, ...deps }) {
  let inst = null;
  const load = once(async () => {
    const [{ createLobby }, amb] = await Promise.all([import('./lobby.js'), import('./ambient.js')]);
    if (onAmbient) onAmbient(amb);
    inst = createLobby({ ...deps, toast });
    return inst;
  });

  const run = (fn) => {
    if (inst) return fn(inst);
    document.body.classList.add('lobby-loading');
    return load()
      .then(fn)
      .catch((e) => {
        console.error(e);
        toast('Lobby gagal dimuat. Periksa koneksi, lalu coba lagi.', 'error', 6000);
      })
      .finally(() => document.body.classList.remove('lobby-loading'));
  };

  // mulai memuat begitu tombol Lobby disentuh/disorot: biasanya sudah siap saat diklik
  const warm = (e) => { if (!inst && e.target.closest && e.target.closest('[data-action=lobby], [data-action=lobby-mixer]')) load().catch(() => {}); };
  document.addEventListener('pointerover', warm, { passive: true });
  document.addEventListener('touchstart', warm, { passive: true });

  return {
    get loaded() { return !!inst; },
    load,
    isOpen: () => !!inst && inst.isOpen(),
    key: (k) => !!inst && inst.key(k),
    escape: () => !!inst && inst.escape(),
    update: (type) => { if (inst) inst.update(type); },
    close: () => { if (inst) inst.close(); },
    ambientActive: () => !!inst && inst.ambientActive(),
    open: () => run((l) => l.open()),
    toggle: () => run((l) => l.toggle()),
    openMixer: () => run((l) => l.openMixer()),
    openScene: () => run((l) => l.openScene()),
    openFocus: () => run((l) => l.openFocus()),
    openSleep: () => run((l) => l.openSleep()),
    toLyrics: (...a) => run((l) => l.toLyrics(...a)),
    /** Siapkan Lobby di latar belakang (hanya dipanggil saat aplikasi senggang). */
    prewarm: () => load().then((l) => l.prewarm()).catch(() => {}),
  };
}
