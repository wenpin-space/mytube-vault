// "Mulai cepat": checklist langkah awal yang tercentang otomatis + "Apa yang baru" setelah update.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

export const APP_VERSION = 'v37';
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
  ['coffee', 'Kafe yang lebih hidup & rapi', 'Pengunjung di bangku bar kini benar-benar duduk (bangku setinggi bangku bar, siku di meja, baju berhenti di dudukan) dan pesanannya tampak di meja bar: kopi berasap & roti yang terangkat saat diminum/dimakan. Lonceng pintu berbunyi & bergoyang saat ada yang masuk atau keluar (bisa dimatikan di Setelan Lobby → Bunyi kafe). Kaki orang tertutup meja kita, tanaman di dekat pintu tidak terpotong lagi, dan kopi & roti di meja kita tetap terlihat di layar lebar dengan cahaya hangat saat malam.'],
  ['sort', 'Atur urutan playlist dengan mudah', 'Tarik lagu ke posisi baru (mouse: dari mana saja di baris; HP: dari pegangan ⋮⋮). Lagu terangkat mengikuti jari, lagu lain bergeser memberi ruang, dan layar bergulir sendiri di dekat tepi. Klik nomor urut lagu lalu ketik nomor baru untuk memindah jauh sekaligus. Pilih beberapa lagu lalu tarik salah satunya, atau ketuk Urutan: ke paling atas, ke nomor tertentu, ke paling bawah, kumpulkan, naik/turun satu (Alt+↑/↓). Semua bisa diurungkan.'],
  ['users', 'Barista yang hidup & proporsi yang pas', 'Barista kini dilukis dengan gaya yang sama seperti pengunjung, dengan ukuran yang sepadan. Ia punya ekspresi: tersenyum & mengobrol saat menerima pesanan, mengangguk saat mendengarkan, berkedip, serius saat mengelap konter sambil bersenandung, dan tersenyum lebar saat menyajikan. Kopi dibuat sesuai pesanan; pengunjung menunggu di konter sampai cangkirnya siap. Pengunjung yang duduk di bangku bar kini benar-benar duduk (kaki di pijakan bangku), dan gerakan berhenti, berbalik, serta duduk lebih halus.'],
  ['sparkle', 'Gerak pengunjung lebih alami', 'Kaki benar-benar menapak saat berjalan (tidak lagi meluncur), pinggul naik-turun & lengan berayun berlawanan dengan kaki. Saat minum, tangan meraih cangkir di meja, mengangkatnya melengkung ke mulut, memiringkannya, lalu meletakkannya kembali; sebagian pengunjung juga memesan roti dan memakannya gigitan demi gigitan. Bayangan kini lembut di lantai, kepala tidak lagi lepas saat duduk.'],
  ['sparkle', 'Pengunjung kafe yang dilukis', 'Pengunjung kini dilukis dengan kuas yang sama seperti latar: bentuk tubuh alami, lipatan baju, rambut bertekstur, dan cahaya tepi dari jendela atau lampu. Gerakannya lebih nyata: lutut & siku menekuk saat berjalan, mulai dan berhenti perlahan, berbalik dengan luwes, duduk & berdiri dengan kaki menapak, menunjuk menu saat memesan, dan mengangkat cangkir ke mulut.'],
  ['users', 'Kafe yang hidup', 'Pengunjung datang lewat pintu (lonceng berbunyi), antre & memesan di konter, membawa minumannya ke bangku bar atau berdua ke meja bundar untuk minum & mengobrol bergantian, lalu pulang. Ramai pagi sampai sore, sepi di malam hari; saat hujan mereka membawa payung.'],
  ['coffee', 'Tempat baru: Kafe', 'Lobby → Suasana → Tempat → Kafe. Kafe Jepang modern yang hangat: lampu kertas, barista yang membuat kopi, noren di pintu, jam dinding sungguhan, dan pemandangan & cuaca di jendela besar.'],
  ['sparkle', 'Kopi & roti di meja kita', 'Minuman berkurang seteguk demi seteguk dan roti tergigit pelan-pelan; setelah habis, pelayan mengantar pesanan baru (latte, matcha, kopi susu, ocha; croissant, melon pan, sando). Saat Fokus aktif, satu porsi habis tepat di akhir sesi dan pesanan baru datang saat istirahat.'],
  ['cloud', 'Cuaca & waktu nyata di Lobby', 'Suasana → Pemandangan → "Ikuti cuaca & waktu nyata". Pakai GPS atau cari kota: hujan, cerah, kabut, atau badai di luar jendela mengikuti cuaca di sana, dan pagi/senja mengikuti jam matahari terbit & terbenam. Diperbarui tiap ±30 menit.'],
  ['sparkle', 'Cuaca berganti tanpa melukis ulang', 'Berawan, hujan, badai, dan kabut memakai satu lukisan; bedanya digambar bergerak di atasnya. Lukisan untuk waktu berikutnya (mis. senja) disiapkan ±20 menit sebelumnya.'],
  ['bolt', 'Lobby jauh lebih mulus', 'Animasi Lobby di HP dua kali lebih lancar dan lukisan pertama selesai ±2× lebih cepat. Ganti suasana tidak lagi "melukis dari nol": lukisan lama tetap tampil lalu memudar ke yang baru, lampu menyala & padam perlahan.'],
  ['sliders', 'Panel suara lebih ringkas', 'Suara yang sedang berbunyi tampil di atas dengan slider; suara lain berupa ikon, ketuk untuk menyalakan. Simpan racikan, suara sendiri & matikan semua ada di menu Lainnya.'],
  ['moon', 'Satu timer tidur untuk semua', 'Timer tidur di player dan di Lobby kini sama: musik & suara alam memelan di menit terakhir, layar Lobby ikut meredup. Pilihan "Akhir lagu ini" ada di keduanya.'],
  ['sparkle', 'Lebih ringan & lebih bersih', 'Putar/jeda tidak lagi menggambar ulang seluruh daftar lagu. Tombol tema pindah ke Setelan → Umum (atau Ctrl+K); HP otomatis memakai mode hemat di Lobby.'],
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
