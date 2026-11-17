// Antrean bareng teman (v44) — tanpa server. Teman memilih lagu (dari library-nya atau link YouTube),
// aplikasi membuat satu link; kamu buka link itu dan lagunya masuk ke antreanmu. Cocok dikirim lewat
// WhatsApp saat kumpul. (Antrean bersama yang benar-benar langsung butuh server, jadi sengaja tidak dipakai.)

import { modal, toast } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, copyText } from './utils.js';
import { parseMany } from './parser.js';
import { buildQueuePayload, encodeShare, shareUrl } from './share.js';

const NAME_KEY = 'mytube_vault_my_name';

/** Link undangan: teman yang membukanya langsung melihat dialog kirim lagu. */
export const inviteUrl = () => `${location.origin}${location.pathname}#kirim`;

/** Dialog kirim lagu ke antrean teman. ids = lagu terpilih dari library (boleh kosong). */
export function sendQueueDialog(store, ids = []) {
  let name = '';
  try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* abaikan */ }
  const picked = ids.map((id) => store.data.videos[id]).filter(Boolean);
  return modal({
    title: 'Kirim lagu ke antrean teman',
    body: `<p class="muted">Pilih lagu, lalu kirim link-nya (mis. lewat WhatsApp). Saat temanmu membuka link itu, lagunya masuk ke antrean dia.</p>
      ${picked.length ? `<p class="small"><b>${picked.length} lagu terpilih</b> dari library-mu ikut dikirim.</p>` : ''}
      <label class="field"><span>${picked.length ? 'Tambah link YouTube lain (opsional)' : 'Link YouTube (satu per baris)'}</span>
        <textarea rows="4" data-k="links" placeholder="https://youtu.be/…"></textarea></label>
      <label class="field"><span>Nama kamu (supaya temanmu tahu dari siapa)</span><input data-k="name" maxlength="40" value="${escapeHtml(name)}" placeholder="mis. Vinz"></label>
      <div class="send-out" hidden><label class="field"><span>Link untuk temanmu</span><input data-k="url" readonly></label>
        <div class="row"><button type="button" class="btn sm" data-k="copy">${icon('copy')}Salin</button>
        ${navigator.share ? `<button type="button" class="btn sm" data-k="share">${icon('share')}Bagikan…</button>` : ''}</div></div>
      <p class="hint" data-k="note"></p>`,
    actions: [{ label: 'Tutup', value: null }, { label: 'Buat link', variant: 'primary', value: null, validate: () => false }],
    onOpen: (b, finish, dlg) => {
      const btn = dlg.querySelector('.modal-actions .btn-primary');
      const note = b.querySelector('[data-k=note]');
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const typed = parseMany(b.querySelector('[data-k=links]').value).valid;
        const list = [...picked.map((v) => ({ id: v.youtubeId, title: v.title || '', channel: v.channel || '' })),
          ...typed.filter((id) => !picked.some((v) => v.youtubeId === id)).map((id) => ({ id, title: (store.data.videos[id] || {}).title || '', channel: (store.data.videos[id] || {}).channel || '' }))];
        if (!list.length) { note.textContent = 'Belum ada lagu. Pilih dari library atau tempel link YouTube.'; return; }
        const nm = b.querySelector('[data-k=name]').value.trim();
        try { localStorage.setItem(NAME_KEY, nm); } catch { /* abaikan */ }
        const url = shareUrl(await encodeShare(buildQueuePayload(list, nm)));
        b.querySelector('.send-out').hidden = false;
        b.querySelector('[data-k=url]').value = url;
        note.textContent = `${list.length} lagu siap dikirim.`;
        btn.textContent = 'Perbarui link';
      });
      b.addEventListener('click', async (e) => {
        const k = e.target.closest('[data-k]');
        if (!k) return;
        const url = b.querySelector('[data-k=url]').value;
        if (k.dataset.k === 'copy') toast((await copyText(url)) ? 'Link disalin.' : 'Gagal menyalin.');
        if (k.dataset.k === 'share') navigator.share({ title: 'Lagu untuk antreanmu', url }).catch(() => {});
      });
    },
  });
}

/** Dialog saat menerima kiriman: hasilnya 'next' | 'queue' | 'save' | null. */
export function receiveQueueDialog(data) {
  const list = data.videos.slice(0, 8).map((v) => `<li translate="no">${escapeHtml(v.title || v.id)}${v.channel ? ` <span class="muted small">· ${escapeHtml(v.channel)}</span>` : ''}</li>`).join('');
  return modal({
    title: data.from ? `Lagu dari ${data.from}` : 'Lagu dari teman',
    body: `<p class="muted">${data.videos.length} lagu dikirim untuk antreanmu.</p>
      <ol class="share-preview">${list}${data.videos.length > 8 ? `<li class="muted">…dan ${data.videos.length - 8} lagu lainnya</li>` : ''}</ol>
      <p class="hint">Lagunya juga disimpan di playlist “Dari teman”, jadi tidak hilang setelah diputar.</p>`,
    actions: [{ label: 'Batal', value: null }, { label: 'Simpan saja', value: 'save' }, { label: 'Ke akhir antrean', value: 'queue' }, { label: 'Putar berikutnya', variant: 'primary', value: 'next' }],
  });
}
