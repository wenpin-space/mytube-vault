// "Mulai cepat": checklist langkah awal yang tercentang otomatis + "Apa yang baru" setelah update.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

export const APP_VERSION = 'v40';
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
  ['bolt', 'Setelan lebih ringan', 'Dialog Setelan & dialog lain tidak lagi memakai efek kaca buram selebar layar, dan kilau “sedang dimuat” di thumbnail berhenti begitu gambarnya tampil. Membuka Setelan, menggulir daftar lagu, dan memutar video jauh lebih ringan. Tombol bookmark “Tambah ke Vault” dihapus.', 'v40'],
  ['play', 'Lanjutkan dari terakhir', 'Saat aplikasi dibuka lagi, kartu Lanjutkan muncul di bawah: lagu, posisi, dan antrean terakhir kembali persis seperti saat ditinggal (tekan Spasi juga bisa). Tidak pernah memutar sendiri.', 'v39'],
  ['panelRight', 'Panel Sedang diputar', 'Di layar lebar (PC) ada kolom kanan berisi artwork atau video, lirik yang berjalan, lima lagu berikutnya, dan info lagu (berapa kali diputar, ada di playlist mana). Sembunyikan lewat tombol di player atau tekan I.', 'v39'],
  ['tag', 'Tag otomatis dari judul', 'Lagu baru otomatis diberi tag live, cover, remix, acoustic, lyrics, dan lainnya sesuai judulnya. Untuk lagu yang sudah ada: Setelan → Umum → Terapkan ke semua lagu.', 'v39'],
  ['gift', 'Dekorasi musiman di Lobby', 'Hiasan Natal, kembang api Tahun Baru, lampion Imlek, ketupat Lebaran, dan bendera Agustusan muncul sendiri sesuai tanggal, di Kamar santai maupun Kafe.', 'v39'],
  ['bolt', 'Lebih cepat dibuka', 'Lobby, Setelan, dan kamus bahasa Inggris kini dimuat hanya saat dibutuhkan, jadi kode yang dimuat saat aplikasi dibuka turun dari ±760 KB ke ±380 KB. Lagu yang sedang diputar ditandai batang ekualiser yang bergerak.', 'v39'],
  ['sliders', 'Player: geser, waktu & volume', 'Bilah progres di player kini bisa ditarik dengan mouse atau jari, dan menampilkan waktu tepat di bawah kursor. Di HP, layar Sedang diputar punya knob yang mudah digeser. Di PC ada tombol bisu dan slider volume; volumenya diingat.', 'v38'],
  ['scissors', 'Lewati intro & outro', 'Menu ⋮ di player → Potong awal/akhir lagu. Cari titiknya dengan pemutar kecil di dialog, lalu tekan Mulai dari sini atau Akhiri di sini. Lagu itu selalu diputar di antara dua titik tersebut, di semua playlist dan semua perangkat yang tersinkron.', 'v38'],
  ['image', 'Sampul playlist', 'Setiap playlist punya sampul mosaik dari empat lagu pertamanya, di kepala halaman dan di daftar playlist, supaya lebih mudah dikenali.', 'v38'],
  ['coffee', 'Kafe yang lebih hidup & rapi', 'Pengunjung di bangku bar kini benar-benar duduk (bangku setinggi bangku bar, siku di meja, baju berhenti di dudukan) dan pesanannya tampak di meja bar: kopi berasap & roti yang terangkat saat diminum/dimakan. Lonceng pintu berbunyi & bergoyang saat ada yang masuk atau keluar (bisa dimatikan di Setelan Lobby → Bunyi kafe). Kaki orang tertutup meja kita, tanaman di dekat pintu tidak terpotong lagi, dan kopi & roti di meja kita tetap terlihat di layar lebar dengan cahaya hangat saat malam.'],
  ['sort', 'Atur urutan playlist dengan mudah', 'Tarik lagu ke posisi baru (mouse: dari mana saja di baris; HP: dari pegangan ⋮⋮). Lagu terangkat mengikuti jari, lagu lain bergeser memberi ruang, dan layar bergulir sendiri di dekat tepi. Klik nomor urut lagu lalu ketik nomor baru untuk memindah jauh sekaligus. Pilih beberapa lagu lalu tarik salah satunya, atau ketuk Urutan: ke paling atas, ke nomor tertentu, ke paling bawah, kumpulkan, naik/turun satu (Alt+↑/↓). Semua bisa diurungkan.'],
  ['users', 'Barista yang hidup & proporsi yang pas', 'Barista kini dilukis dengan gaya yang sama seperti pengunjung, dengan ukuran yang sepadan. Ia punya ekspresi: tersenyum & mengobrol saat menerima pesanan, mengangguk saat mendengarkan, berkedip, serius saat mengelap konter sambil bersenandung, dan tersenyum lebar saat menyajikan. Kopi dibuat sesuai pesanan; pengunjung menunggu di konter sampai cangkirnya siap. Pengunjung yang duduk di bangku bar kini benar-benar duduk (kaki di pijakan bangku), dan gerakan berhenti, berbalik, serta duduk lebih halus.'],
  ['sparkle', 'Gerak pengunjung lebih alami', 'Kaki benar-benar menapak saat berjalan (tidak lagi meluncur), pinggul naik-turun & lengan berayun berlawanan dengan kaki. Saat minum, tangan meraih cangkir di meja, mengangkatnya melengkung ke mulut, memiringkannya, lalu meletakkannya kembali; sebagian pengunjung juga memesan roti dan memakannya gigitan demi gigitan. Bayangan kini lembut di lantai, kepala tidak lagi lepas saat duduk.'],
  ['sparkle', 'Pengunjung kafe yang dilukis', 'Pengunjung kini dilukis dengan kuas yang sama seperti latar: bentuk tubuh alami, lipatan baju, rambut bertekstur, dan cahaya tepi dari jendela atau lampu. Gerakannya lebih nyata: lutut & siku menekuk saat berjalan, mulai dan berhenti perlahan, berbalik dengan luwes, duduk & berdiri dengan kaki menapak, menunjuk menu saat memesan, dan mengangkat cangkir ke mulut.'],
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
