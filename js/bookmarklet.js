// Tombol "Tambah ke Vault" untuk bilah bookmark browser (bookmarklet). Saat diklik di halaman video
// YouTube / YouTube Music, aplikasi terbuka di tab bernama "mytube-vault" (dipakai ulang tiap kali)
// dengan parameter ?share_url=…&quick=1 → video langsung ditambahkan ke playlist tujuan terakhir.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, copyText } from './utils.js';
import { tr } from './i18n.js';

/** Kode bookmarklet untuk alamat aplikasi tertentu (murni, mudah diuji). */
export function bookmarkletCode(appUrl, notYouTube = 'Buka video YouTube dulu, lalu klik tombol ini.') {
  const base = String(appUrl).split(/[?#]/)[0];
  const js = `(()=>{const u=location.href;if(!/(^|\\.)youtube\\.com$|(^|\\.)youtu\\.be$/.test(location.hostname)){alert(${JSON.stringify(notYouTube)});return}`
    + `window.open(${JSON.stringify(`${base}?quick=1&share_url=`)}+encodeURIComponent(u),'mytube-vault')})()`;
  return `javascript:${encodeURIComponent(js).replace(/%28/g, '(').replace(/%29/g, ')').replace(/%3D/g, '=').replace(/%3B/g, ';').replace(/%2C/g, ',')}`;
}

export const appUrl = () => location.origin + location.pathname;

export function bookmarkletDialog({ toast }) {
  const code = bookmarkletCode(appUrl(), tr('Buka video YouTube dulu, lalu klik tombol ini.'));
  return modal({
    title: 'Tombol “Tambah ke Vault”',
    body: `
      <p>Pasang tombol ini di bilah bookmark browser. Saat sedang membuka video di YouTube atau YouTube Music, klik tombolnya: videonya langsung masuk ke playlist tujuan terakhirmu.</p>
      <div class="bm-drag">
        <a class="bm-link" href="${escapeHtml(code)}" draggable="true" onclick="return false" title="Seret ke bilah bookmark">${icon('plus')}<span>Tambah ke Vault</span></a>
        <span class="muted small">← seret tombol ini ke bilah bookmark</span>
      </div>
      <ol class="bm-steps">
        <li>Tampilkan bilah bookmark: <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>B</kbd> (Mac: <kbd>⌘</kbd> <kbd>Shift</kbd> <kbd>B</kbd>).</li>
        <li>Seret tombol merah di atas ke bilah bookmark.</li>
        <li>Buka video YouTube, lalu klik tombol itu. MyTube Vault terbuka di satu tab yang sama setiap kali.</li>
      </ol>
      <p class="hint">Tidak bisa diseret (mis. di Zen/Firefox dengan bilah tersembunyi)? Salin kodenya, buat bookmark baru, lalu tempel sebagai alamat (URL).</p>`,
    actions: [
      { label: 'Salin kode', value: 'copy' },
      { label: 'Selesai', value: null, variant: 'primary' },
    ],
  }).then((v) => {
    if (v === 'copy') copyText(code).then(() => toast('Kode bookmark disalin. Tempel sebagai alamat bookmark baru.', 'success', 5000), () => toast('Gagal menyalin.', 'error'));
  });
}
