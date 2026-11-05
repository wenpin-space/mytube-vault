// "Mulai cepat": checklist langkah awal yang tercentang otomatis + "Apa yang baru" setelah update.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

export const APP_VERSION = 'v18';
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

export function renderQuickstart(host, state, { installable = false } = {}) {
  const steps = quickstartSteps(state).filter((s) => s.id !== 'install' || installable || s.done);
  const done = steps.filter((s) => s.done).length;
  const core = steps.filter((s) => !s.optional).every((s) => s.done);
  if (state.dismissed || done === steps.length || (core && state.videos >= 10)) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  const pct = Math.round((done / steps.length) * 100);
  host.innerHTML = `
    <div class="qs-head">
      <span class="qs-ic">${icon('sparkle')}</span>
      <div class="qs-title"><b>Mulai cepat</b><span class="muted small">${done} dari ${steps.length} langkah · tercentang otomatis</span></div>
      <div class="qs-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <button type="button" class="icon-btn sm" data-action="qs-dismiss" aria-label="Sembunyikan panduan" title="Sembunyikan (bisa dibuka lagi dari Ctrl+K atau Setelan)">${icon('x')}</button>
    </div>
    <ol class="qs-steps">${steps.map((s) => `
      <li class="${s.done ? 'done' : ''}">
        <span class="qs-check">${icon(s.done ? 'checkCircle' : 'circle')}</span>
        <span class="qs-text"><b>${escapeHtml(s.label)}</b><span class="muted small">${escapeHtml(s.hint)}</span></span>
        ${s.done ? '' : `<button type="button" class="btn sm${s.optional ? '' : ' btn-primary'}" data-action="${s.action}"${s.tab ? ` data-tab="${s.tab}"` : ''}>${escapeHtml(s.cta)}</button>`}
      </li>`).join('')}</ol>`;
}

const CHANGES = [
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
