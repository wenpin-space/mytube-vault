// Cek kesehatan video: deteksi video yang sudah dihapus/privat ('gone') atau tidak boleh diputar
// di luar YouTube ('embed'). Dengan API key: YouTube Data API (cepat, 1 unit kuota per 50 video).
// Tanpa API key: oEmbed per video (lebih lambat, tetap akurat untuk video dihapus/privat).

import { modal, toast } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { watchUrl } from './metadata.js';

/** Hasil videos.list → map id → 'gone' | 'embed' | null. Murni (mudah diuji). */
export function classifyApiItems(ids, items) {
  const out = {};
  const byId = new Map((items || []).map((it) => [it.id, it]));
  for (const id of ids) {
    const it = byId.get(id);
    if (!it) { out[id] = 'gone'; continue; }
    const st = it.status || {};
    if (st.privacyStatus === 'private' || st.uploadStatus === 'rejected' || st.uploadStatus === 'deleted') out[id] = 'gone';
    else if (st.embeddable === false) out[id] = 'embed';
    else out[id] = null;
  }
  return out;
}

async function viaApi(ids, key, onProgress) {
  const result = {};
  const meta = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const u = new URL('https://www.googleapis.com/youtube/v3/videos');
    u.search = new URLSearchParams({ part: 'status,snippet,contentDetails', id: batch.join(','), maxResults: '50', key });
    const res = await fetch(u);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].reason;
      throw new Error(reason === 'quotaExceeded' ? 'Kuota YouTube API hari ini habis.' : `Permintaan ke YouTube gagal (${res.status}).`);
    }
    Object.assign(result, classifyApiItems(batch, json.items));
    for (const it of json.items || []) meta[it.id] = { title: it.snippet && it.snippet.title, channel: it.snippet && it.snippet.channelTitle };
    onProgress(Math.min(ids.length, i + 50), ids.length);
  }
  return { result, meta };
}

/** Status satu video lewat oEmbed: 'gone' | 'embed' | null | undefined (tidak bisa dipastikan). */
async function oembedStatus(id) {
  const w = encodeURIComponent(watchUrl(id));
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${w}`);
    if (res.ok) return null;
    if (res.status === 404 || res.status === 400) return 'gone';
    if (res.status === 401 || res.status === 403) return 'gone'; // privat (oEmbed tidak membedakan)
  } catch { /* CORS/jaringan → coba noembed */ }
  try {
    const res = await fetch(`https://noembed.com/embed?url=${w}`);
    const j = await res.json();
    if (j && j.title) return null;
    if (j && /404|not found/i.test(j.error || '')) return 'gone';
    if (j && /401|403|unauthori|forbidden/i.test(j.error || '')) return 'gone';
  } catch { /* abaikan */ }
  return undefined;
}

async function viaOembed(ids, onProgress, signal) {
  const result = {};
  let done = 0;
  let i = 0;
  const worker = async () => {
    while (i < ids.length && !signal.aborted) {
      const id = ids[i++];
      const st = await oembedStatus(id);
      if (st !== undefined) result[id] = st;
      onProgress(++done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { result, meta: {} };
}

/**
 * Dialog cek kesehatan untuk daftar video (mis. isi playlist).
 * opts: { title, ids, apiKey, onRemove(badIds) → number (opsional), onShow() }
 */
export function healthCheckDialog(store, { title, ids, apiKey, onRemove, onShow }) {
  const ctrl = new AbortController();
  return modal({
    title: 'Periksa video rusak',
    body: `<p class="muted">Memeriksa ${ids.length} video di <b>${escapeHtml(title)}</b> — apakah masih ada di YouTube dan boleh diputar di sini.
      ${apiKey ? '' : '<br><span class="small">Tanpa API key pemeriksaan lebih lambat (satu per satu). Dengan API key jauh lebih cepat.</span>'}</p>
      <div class="hc-progress"><div class="hc-bar"><i style="width:0%"></i></div><span class="hc-count small muted">0 / ${ids.length}</span></div>
      <div class="hc-result"></div>`,
    actions: [{ label: 'Tutup', value: null }],
    onOpen: async (b, finish) => {
      const bar = b.querySelector('.hc-bar i');
      const count = b.querySelector('.hc-count');
      const out = b.querySelector('.hc-result');
      const onProgress = (n, total) => { bar.style.width = `${Math.round((n / total) * 100)}%`; count.textContent = `${n} / ${total}`; };
      b.closest('dialog').addEventListener('close', () => ctrl.abort());
      let res;
      try {
        res = apiKey ? await viaApi(ids, apiKey, onProgress) : await viaOembed(ids, onProgress, ctrl.signal);
      } catch (e) {
        out.innerHTML = `<p class="error-text">${escapeHtml(e.message || String(e))}</p>`;
        return;
      }
      if (ctrl.signal.aborted) return;
      store.setAvailability(res.result);
      for (const [id, m] of Object.entries(res.meta)) {
        const v = store.data.videos[id];
        if (v && !v.title && m.title) store.updateVideo(id, { title: m.title, channel: v.channel || m.channel || '' });
      }
      const gone = ids.filter((id) => res.result[id] === 'gone');
      const embed = ids.filter((id) => res.result[id] === 'embed');
      const unknown = ids.length - Object.keys(res.result).length;
      if (!gone.length && !embed.length) {
        out.innerHTML = `<p class="hc-ok">${icon('checkCircle')}Semua video aman${unknown ? ` (${unknown} tidak bisa dipastikan — coba lagi nanti)` : ''}.</p>`;
        return;
      }
      const list = (arr) => arr.slice(0, 30).map((id) => {
        const v = store.data.videos[id] || {};
        return `<li>${escapeHtml(v.title || id)}</li>`;
      }).join('') + (arr.length > 30 ? `<li class="muted">… dan ${arr.length - 30} lagi</li>` : '');
      out.innerHTML = `
        ${gone.length ? `<h3 class="hc-h">${icon('alert')}${gone.length} video tidak tersedia <span class="muted small">(dihapus / privat)</span></h3><ul class="hc-list">${list(gone)}</ul>` : ''}
        ${embed.length ? `<h3 class="hc-h">${icon('external')}${embed.length} video hanya bisa diputar di YouTube</h3><p class="muted small">Pemiliknya melarang diputar di situs lain. Masih bisa dibuka lewat “Putar di aplikasi YouTube”.</p><ul class="hc-list">${list(embed)}</ul>` : ''}
        <div class="row hc-actions">
          ${onShow ? '<button type="button" class="btn" data-hc="show">Tampilkan di daftar</button>' : ''}
          ${onRemove && gone.length ? `<button type="button" class="btn btn-danger" data-hc="remove">${icon('trash')}<span>Hapus ${gone.length} video tidak tersedia</span></button>` : ''}
        </div>`;
      out.addEventListener('click', (e) => {
        const a = e.target.closest('[data-hc]');
        if (!a) return;
        if (a.dataset.hc === 'remove') { const n = onRemove(gone); toast(`${n} video tidak tersedia dihapus.`, 'success'); finish(null); }
        if (a.dataset.hc === 'show') { finish(null); onShow(); }
      });
    },
  });
}
