// "Mulai cepat": checklist langkah awal yang tercentang otomatis + "Apa yang baru" setelah update.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

export const APP_VERSION = 'v28';
const SEEN_KEY = 'mytube_vault_seen_version';

/** Langkah mulai cepat dan statusnya (murni, mudah diuji). */
export function quickstartSteps({ videos = 0, played = false, apiKey = false, cloud = false, standalone = false }) {
  return [
    { id: 'add', label: 'Tambah lagu pertama', hint: 'Tempel link YouTube di kolom atas, atau cari langsung.', done: videos > 0, action: 'open-add', cta: 'Tambah' },
    { id: 'play', label: 'Putar lagu', hint: 'Tekan Putar di atas daftar, atau ketuk thumbnail.', done: played, action: 'play-all', cta: 'Putar' },
    { id: 'key', label: 'Aktifkan pencarian YouTube', hint: 'Opsional · API key gratis untuk cari lagu, import playlist & versi audio.', done: apiKey, action: 'open-settings', tab: 'general', cta: 'Atur', optional: true },
    { id: 'cloud', label: 'Backup otomatis ke GitHub Gist', hint: 'Opsional · supaya playlist aman & sama di semua perangkat.', done: cloud, action: 'open-settings', tab: 'cloud', cta: 'Aktifkan', optional: true },
    { id: 'install', label: 'Pasang sebagai aplikasi', hint: 'Opsional · buka dari layar utama/desktop seperti aplikasi biasa.', done: standalone, action: 'install-app', cta: 'Pasang', optional: true },
  ];
}

let qsOpen = false;
export function toggleQuickstart() { qsOpen = !qsOpen; }

/** Mulai cepat versi ringkas: satu baris (progres + langkah berikutnya); daftar lengkap bisa dibuka. */
export function renderQuickstart(host, state, { installable = false } = {}) {
  const steps = quickstartSteps(state).filter((s) => s.id !== 'install' || installable || s.done);
  const done = steps.filter((s) => s.done).length;
  const core = steps.filter((s) => !s.optional).every((s) => s.done);
  if (state.dismissed || done === steps.length || (core && state.videos >= 10)) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  host.classList.toggle('open', qsOpen);
  const pct = Math.round((done / steps.length) * 100);
  const next = steps.find((s) => !s.done && !s.optional) || steps.find((s) => !s.done);
  const btn = (s, primary) => `<button type="button" class="btn sm${primary ? ' btn-primary' : ''}" data-action="${s.action}"${s.tab ? ` data-tab="${s.tab}"` : ''}>${escapeHtml(s.cta)}</button>`;
  host.innerHTML = `
    <div class="qs-row">
      <span class="qs-ring" style="--p:${pct}" aria-hidden="true"><b>${done}/${steps.length}</b></span>
      <div class="qs-title"><b>Mulai cepat</b><span class="muted small">Berikutnya: ${escapeHtml(next.label)}</span></div>
      ${btn(next, true)}
      <button type="button" class="icon-btn sm" data-action="qs-toggle" aria-expanded="${qsOpen}" aria-label="${qsOpen ? 'Sembunyikan langkah' : 'Lihat semua langkah'}" title="${qsOpen ? 'Sembunyikan langkah' : 'Lihat semua langkah'}">${icon(qsOpen ? 'up' : 'down')}</button>
      <button type="button" class="icon-btn sm" data-action="qs-dismiss" aria-label="Sembunyikan panduan" title="Sembunyikan (bisa dibuka lagi dari Ctrl+K atau Setelan)">${icon('x')}</button>
    </div>
    ${qsOpen ? `<ol class="qs-steps">${steps.map((s) => `
      <li class="${s.done ? 'done' : ''}">
        <span class="qs-check">${icon(s.done ? 'checkCircle' : 'circle')}</span>
        <span class="qs-text"><b>${escapeHtml(s.label)}</b><span class="muted small">${escapeHtml(s.hint)}</span></span>
        ${s.done ? '' : btn(s, false)}
      </li>`).join('')}</ol>` : ''}`;
}

const CHANGES = [
  ['bolt', 'Lobby terbuka lebih cepat', 'Lukisan kamar kini disimpan di perangkat: membuka Lobby lagi langsung tampil, dan saat aplikasi senggang lukisannya disiapkan lebih dulu. Melukis suasana baru tidak lagi membuat layar tersendat, dan Lobby yang dibuka ulang tidak lagi diam.'],
  ['mic', 'Dari Lobby langsung ke lirik', 'Klik bar musik di Lobby → pindah ke halaman lirik dengan animasi (artwork & judul ikut berpindah). Tombol Back kembali ke daftar lagu.'],
  ['volume', 'Suara alam pakai rekaman asli', 'Hujan, petir, jangkrik, kafe, keramaian orang, kipas angin, lalu lintas, dan lainnya kini rekaman asli (CC0/Pixabay), diputar berulang tanpa jeda. Baru: hujan deras, burung camar, burung hantu, restoran ramai, kucing mendengkur.'],
  ['translate', 'Bahasa Inggris', 'Setelan → Umum → Bahasa / Language (atau Ctrl+K). Judul lagu, nama playlist, dan lirik tetap seperti aslinya.'],
  ['rain', 'Hujan & petir baru', 'Hujan lebih nyata (desis, tetes kecil, tetes besar di kusen) dan petir yang bergemuruh panjang dengan gema.'],
  ['users', 'Suasana kafe & suara lain', 'Kafe ramai dengan orang mengobrol, Orang ngobrol, Ketikan keyboard, Jam dinding, Kereta, Kipas angin, Lalu lintas.'],
  ['sliders', 'Pengaturan suara tidak berubah sendiri', 'Begitu kamu mengatur suara, “Ikuti suasana” otomatis dimatikan — racikanmu tetap seperti yang kamu atur.'],
  ['search', 'Cari & tempel link di satu kolom', 'Kolom atas sekarang serbaguna: ketik untuk mencari, tempel link YouTube untuk langsung menambah. Tombol Tambah (A) membuka opsi lengkap.'],
  ['sofa', 'Lobby minimalis', 'Cukup 4 ikon kecil: Suasana (pemandangan & suara), Timer (Fokus & tidur), Setelan, Tutup — semuanya menghilang saat diam.'],
  ['sparkle', 'Lukisan yang lebih manusiawi', 'Garis seperti digambar tangan, sapuan kuas meruncing, bayangan dingin & cahaya hangat, plus barang-barang kecil di kamar.'],
  ['type', 'Font Poppins', 'Tampilan lebih bersih dan modern di seluruh aplikasi.'],
  ['sort', 'Header playlist lebih ringkas', 'Urutan & tampilan digabung ke satu tombol; baris lagu cukup ♥ dan ⋮.'],
  ['sliders', 'Suara alam', 'Hujan, petir, ombak, api unggun, kafe, dan lainnya — racik sendiri lalu simpan.'],
  ['sparkle', 'Mix untukmu', 'Koleksi baru di sidebar: rekomendasi dari library-mu sendiri, berganti tiap hari.'],
  ['heartPulse', 'Periksa video rusak', 'Menu ⋮ playlist → temukan video yang sudah dihapus/privat, lalu hapus sekaligus.'],
  ['translate', 'Terjemahan lirik', 'Tombol Terjemahkan di layar lirik — terjemahan Indonesia di bawah tiap baris.'],
  ['volume', 'Transisi halus antar lagu', 'Volume turun pelan di akhir lagu dan naik di awal lagu berikutnya (⋮ player).'],
  ['upload', 'Export untuk Spotify / Apple Music', 'Menu ⋮ playlist → daftar “Artis - Judul” / CSV untuk TuneMyMusic atau Soundiiz.'],
  ['video', 'Video tersembunyi secara bawaan', 'Cukup player di bawah; tekan 🎥 atau V untuk menampilkan video.'],
  ['music', 'Ganti ke versi audio', 'Lirik langsung pas: tukar MV dengan versi Topic/Official Audio.'],
];

/** Tampilkan "Apa yang baru" sekali setelah update (bukan untuk pengguna baru). */
export function maybeShowWhatsNew({ fresh }) {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { return; }
  if (fresh || seen === APP_VERSION) return;
  setTimeout(() => showWhatsNew(), 900);
}

export function showWhatsNew() {
  return modal({
    title: `Apa yang baru di MyTube Vault (${APP_VERSION})`,
    body: `<ul class="feature-list wn-list">${CHANGES.map(([ic, t, d]) => `<li>${icon(ic)}<span><b>${escapeHtml(t)}</b><br><span class="muted">${escapeHtml(d)}</span></span></li>`).join('')}</ul>
      <p class="hint">Daftar pintasan keyboard: tekan <kbd>?</kbd>. Semua perintah: <kbd>Ctrl</kbd> <kbd>K</kbd>.</p>`,
    actions: [{ label: 'Oke, mengerti', value: true, variant: 'primary' }],
  });
}
