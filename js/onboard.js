// "Mulai cepat": checklist langkah awal yang tercentang otomatis + "Apa yang baru" setelah update.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

export const APP_VERSION = 'v45';
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

// [ikon, judul, penjelasan, versi?] — entri bertanda versi sekarang tampil penuh; sisanya dilipat di "Pembaruan sebelumnya".
const CHANGES = [
  ['sliders', 'Tampilan lebih tenang', 'Merah penuh kini hanya untuk tombol Putar; Tambah di bar atas jadi tombol biasa dan tag di daftar lagu tidak lagi berwarna. Ajakan backup lebih ringkas dan hanya muncul di 3 kunjungan pertama (setelah itu cukup tanda Lokal saja). Chip tag dikumpulkan jadi satu chip Tag, ikon di bawah sidebar diberi nama, dan Lobby punya label di layar lebar.', 'v45'],
  ['grip', 'Urutan lagu & perbaikan kecil', 'Pegangan geser kini muncul saat baris disorot di PC; di HP lewat tombol urutan → Atur urutan (seret). Teks Inggris di tab Cloud Sync dilengkapi, pesan token GitHub yang ditolak kini menjelaskan langkah berikutnya, dan notifikasi tidak lagi menumpuk di atas kartu Lanjutkan.', 'v45'],
  ['merge', 'Sinkron yang menggabungkan', 'Kalau HP dan PC sama-sama diubah sebelum sempat sinkron, perubahannya kini digabung otomatis: lagu & playlist baru dari keduanya masuk, yang dihapus di salah satu ikut terhapus, jumlah putar diambil yang terbesar. Dialog “pilih versi” hanya muncul kalau penggabungan gagal, dan salinan sebelum digabung tetap disimpan.', 'v44'],
  ['gift', 'Wrapped & Setahun lalu', 'Ikon hadiah di samping membuka rekap tahun ini: total waktu mendengarkan, lagu pertama, lagu & artis teratas, bulan dan jam favorit, lalu simpan “Top 2026” jadi playlist. Di Mix dan Riwayat muncul kartu “Setahun lalu” berisi lagu yang sering kamu putar di hari yang sama tahun lalu.', 'v44'],
  ['type', 'Cara baca lirik & mode karaoke', 'Lirik Korea, Jepang (kana), dan Mandarin kini bisa ditampilkan dengan cara bacanya (romanisasi/pinyin) lewat tombol Cara baca. Tombol Karaoke membuka lirik layar penuh: baris yang sedang dinyanyikan terisi perlahan mengikuti lagu.', 'v44'],
  ['users', 'Antrean bareng teman & import Spotify', 'Kirim lagu ke antrean teman lewat link (⋮ → Lainnya → Kirim ke antrean teman), atau undang teman mengisi antreanmu dari menu player. Tambah → Dari Spotify menerima file CSV dari exportify.net atau daftar “Artis - Judul” dan mencarikan versi YouTube-nya.', 'v44'],
  ['pip', 'Mini player, riwayat antrean & acak rapi', 'Di PC, menu player → Mini player mengambang membuka jendela kecil yang selalu di atas. Panel antrean punya bagian “Baru saja diputar” untuk kembali ke lagu sebelumnya. Acak kini menghindari artis yang sama berturut-turut dan menaruh lagu yang baru diputar di belakang.', 'v44'],
  ['download', 'Penyimpanan lebih lega & backup otomatis', 'Data kini disimpan di IndexedDB (tidak lagi dibatasi ±5 MB), riwayat putar bisa sampai 25.000 putaran. Seminggu sekali salinan otomatis dibuat di perangkat (Setelan → Backup), dan aplikasi mengingatkan untuk mengunduh file backup. Saat offline ada tanda “Offline” dan thumbnail & lirik yang pernah dibuka tetap tampil.', 'v44'],
  ['keyboard', 'Lebih ramah keyboard & layar sentuh', 'Tombol kecil di HP kini lebih besar dan mudah diketuk, fokus keyboard terlihat jelas, ada tautan “Lompat ke konten”, kontras tombol utama ditingkatkan, dan animasi dikurangi bila sistem meminta (reduce motion).', 'v44'],
  ['moon', 'Layar mati & pindah aplikasi di HP', 'YouTube menghentikan musik di browser HP begitu layar mati atau aplikasi ditinggal (aturan YouTube sejak 2026, kecuali Premium di aplikasinya). Sekarang aplikasi tahu lagunya berhenti: tombol & notifikasi tidak lagi menampilkan “sedang diputar”, antrean tidak melompat-lompat karena error, dan begitu aplikasi dibuka lagi lagu dilanjutkan dari posisi terakhir (bisa dimatikan di Setelan → Umum).', 'v43'],
  ['video', 'Tombol video YouTube bisa diklik lagi', 'Pengaturan kualitas, teks (CC), layar penuh, dan tombol lain di video YouTube kembali bisa diklik. Lapisan “ketuk video” dari v41 yang menutupinya dihapus; putar/jeda tetap lewat tombol di video atau player bawah.', 'v42'],
  ['more', 'Menu & tombol lebih ringkas', 'Menu ⋮ lagu kini dimulai dengan empat tombol besar (Berikutnya, Antrean, Playlist, Favorit); yang jarang dipakai ada di Lainnya. Menu player hanya berisi hal soal lagu yang diputar: kecepatan, timer tidur, Berhenti setelah lagu ini, dan potong lagu. Tombol ⋮ player kini paling kanan dan diberi titik bila ada yang aktif. Di HP, mini player cukup Putar & Berikutnya.', 'v41'],
  ['undo', 'Urungkan di mana-mana', 'Hapus dari library, hapus atau kosongkan playlist, pindah ke playlist lain, dan aksi di mode pilih kini langsung jalan tanpa dialog konfirmasi, dengan tombol Urungkan di notifikasi (atau Ctrl+Z). Di PC, Ctrl+klik dan Shift+klik memilih beberapa lagu sekaligus.', 'v41'],
  ['merge', 'Lagu ganda & judul bersih', 'Lagu yang sama dengan video berbeda (mis. MV dan versi audio) dikenali saat ditambahkan, dan bisa digabung lewat ⋮ → Cari lagu ganda: playlist, favorit, tag, dan jumlah putarnya ikut digabung. Tempelan seperti “(Official Video)” atau “[HD]” disembunyikan dari judul; judul aslinya tetap tersimpan.', 'v41'],
];

/** Tampilkan "Apa yang baru" sekali setelah update (bukan untuk pengguna baru). */
export function maybeShowWhatsNew({ fresh }) {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { return; }
  if (fresh || seen === APP_VERSION) return;
  setTimeout(() => showWhatsNew(), 900);
}

/** Pisahkan catatan versi sekarang dari yang lama (murni, mudah diuji). */
export function splitChanges(list = CHANGES, version = APP_VERSION) {
  const now = list.filter((c) => c[3] === version);
  return now.length ? { now, older: list.filter((c) => c[3] !== version) } : { now: list.slice(0, 1), older: list.slice(1) };
}

export function showWhatsNew() {
  const { now, older } = splitChanges();
  const item = ([ic, t, d]) => `<li>${icon(ic)}<span><b>${escapeHtml(t)}</b><br><span class="muted">${escapeHtml(d)}</span></span></li>`;
  return modal({
    title: `Apa yang baru di MyTube Vault (${APP_VERSION})`,
    body: `<ul class="feature-list wn-list">${now.map(item).join('')}</ul>
      ${older.length ? `<details class="wn-older"><summary>Pembaruan sebelumnya</summary><ul class="feature-list wn-list">${older.map(item).join('')}</ul></details>` : ''}
      <p class="hint">Daftar pintasan keyboard: tekan <kbd>?</kbd>. Semua perintah: <kbd>Ctrl</kbd> <kbd>K</kbd>.</p>`,
    actions: [{ label: 'Oke, mengerti', value: true, variant: 'primary' }],
  });
}
