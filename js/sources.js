// Sumber lagu tambahan:
// - pilih dari library (video yang sudah pernah ditambahkan)
// - cari di YouTube (YouTube Data API v3 dengan API key milik pengguna sendiri)
// - putar daftar di aplikasi YouTube (Premium: bisa di latar belakang)

import { modal, toast } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, formatDuration } from './utils.js';
import { thumbUrl } from './metadata.js';

const KEY_STORE = 'mytube_vault_yt_key';
export const getApiKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
export const setApiKey = (k) => { try { if (k) localStorage.setItem(KEY_STORE, k.trim()); else localStorage.removeItem(KEY_STORE); } catch { /* abaikan */ } };

const decode = (s) => {
  const t = document.createElement('textarea');
  t.innerHTML = s || '';
  return t.value;
};

// ---------- pilih dari library ----------
export function libraryPicker(store, targetId) {
  const pl = store.getPlaylist(targetId);
  if (!pl) return Promise.resolve(null);
  const inPl = new Set(pl.items.map((i) => i.youtubeId));
  const vids = Object.values(store.data.videos)
    .filter((v) => !inPl.has(v.youtubeId))
    .sort((a, b) => String(b.firstAddedAt || '').localeCompare(String(a.firstAddedAt || '')));

  const body = vids.length
    ? `<label class="search pick-search">${icon('search')}<input type="search" placeholder="Cari di library…" aria-label="Cari di library"></label>
       <div class="list-box pick-list lib-list">
        ${vids.map((v) => `<label class="lib-item" data-q="${escapeHtml(`${v.title || ''} ${v.channel || ''}`.toLowerCase())}">
          <input type="checkbox" value="${escapeHtml(v.youtubeId)}">
          <img src="${thumbUrl(v.youtubeId, 'default')}" alt="" loading="lazy">
          <span class="lib-text"><b>${escapeHtml(v.title || v.youtubeId)}</b><small class="muted">${escapeHtml(v.channel || '')}${v.duration ? ` · ${formatDuration(v.duration)}` : ''}</small></span>
        </label>`).join('')}
       </div>`
    : `<p class="muted">Semua video di library sudah ada di “${escapeHtml(pl.name)}”. Tambahkan lagu baru lewat link atau <b>Cari di YouTube</b>.</p>`;

  return modal({
    title: `Tambah ke “${pl.name}” dari library`,
    body,
    actions: vids.length
      ? [{ label: 'Batal', value: null }, { label: 'Tambahkan', variant: 'primary', value: (b) => [...b.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value) }]
      : [{ label: 'Tutup', value: null }],
    onOpen: (b, finish, dlg) => {
      const q = b.querySelector('input[type=search]');
      const okBtn = dlg.querySelector('.modal-actions .btn-primary');
      const refresh = () => {
        const n = b.querySelectorAll('input[type=checkbox]:checked').length;
        if (okBtn) { okBtn.textContent = n ? `Tambahkan (${n})` : 'Tambahkan'; okBtn.disabled = !n; }
      };
      refresh();
      b.addEventListener('change', refresh);
      if (q) {
        q.addEventListener('input', () => {
          const s = q.value.trim().toLowerCase();
          b.querySelectorAll('.lib-item').forEach((el) => { el.hidden = !!s && !el.dataset.q.includes(s); });
        });
      }
    },
  }).then((ids) => {
    if (!ids || !ids.length) return null;
    const r = store.addVideos(ids, targetId);
    toast(`${r.added} lagu ditambahkan ke “${pl.name}”.`, 'success');
    return r;
  });
}

// ---------- cari di YouTube ----------
async function searchYouTube(q, key) {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '20', q, key, videoEmbeddable: 'true' });
  const res = await fetch(u);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('Kuota pencarian YouTube hari ini habis (±100 pencarian/hari). Coba lagi besok.');
    if (res.status === 400 || reason === 'keyInvalid') throw new Error('API key tidak valid. Periksa lagi di Setelan → Umum.');
    if (res.status === 403) throw new Error('API key ditolak. Pastikan “YouTube Data API v3” sudah diaktifkan dan pembatasan referrer mengizinkan situs ini.');
    throw new Error(`Pencarian gagal (${res.status}).`);
  }
  return (json.items || [])
    .filter((it) => it.id && it.id.videoId)
    .map((it) => ({ id: it.id.videoId, title: decode(it.snippet.title), channel: decode(it.snippet.channelTitle) }));
}

const KEY_HELP = `
  <ol class="steps">
    <li>Buka <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud Console → YouTube Data API v3</a>, pilih/buat project, klik <b>Enable</b>.</li>
    <li>Buka <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials</a> → <b>Create credentials → API key</b>.</li>
    <li>Disarankan: <i>Edit API key</i> → <b>Website restrictions</b> → tambahkan alamat aplikasi ini, dan batasi ke YouTube Data API v3.</li>
    <li>Tempel key di bawah. Gratis, ±100 pencarian per hari. Key hanya disimpan di perangkat ini.</li>
  </ol>`;

/** Dialog pencarian. Tiap hasil punya tombol + untuk langsung menambahkan ke playlist tujuan. */
export function ytSearchDialog(store, { targetId, query = '' } = {}) {
  const pl = store.getPlaylist(targetId) || store.data.playlists[0];
  return modal({
    title: 'Cari di YouTube',
    wide: true,
    body: `
      <form class="yt-form row" autocomplete="off">
        <input type="search" name="q" placeholder="Judul lagu atau artis…" value="${escapeHtml(query)}" aria-label="Kata kunci" enterkeyhint="search">
        <button type="submit" class="btn btn-primary">${icon('search')}<span>Cari</span></button>
      </form>
      <p class="hint">Hasil ditambahkan ke <b>${escapeHtml(pl.name)}</b>.</p>
      <div class="yt-results"></div>`,
    actions: [{ label: 'Selesai', value: null }],
    onOpen: (b) => {
      const form = b.querySelector('.yt-form');
      const input = form.querySelector('input');
      const box = b.querySelector('.yt-results');

      const needKey = (qText) => {
        box.innerHTML = `
          <div class="card">
            <h3>${icon('lock')}Butuh YouTube API key (sekali saja)</h3>
            <p class="muted">Pencarian langsung dari aplikasi memakai YouTube Data API dengan key milikmu sendiri.</p>
            ${KEY_HELP}
            <div class="row"><input type="text" class="key-input" placeholder="AIza…" aria-label="YouTube API key">
              <button type="button" class="btn btn-primary" data-k="save">Simpan</button></div>
          </div>
          <div class="card">
            <h3>${icon('external')}Atau tanpa API key</h3>
            <p class="muted">Cari di YouTube, buka videonya, lalu <b>Bagikan → Salin link</b> dan tempel di kolom Tambah. Kalau aplikasi ini sudah dipasang, bisa langsung <b>Bagikan → MyTube Vault</b>.</p>
            <a class="btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(qText || '')}" target="_blank" rel="noopener">${icon('external')}Buka pencarian YouTube</a>
          </div>`;
        box.querySelector('[data-k=save]').addEventListener('click', () => {
          const k = box.querySelector('.key-input').value.trim();
          if (!/^[\w-]{20,}$/.test(k)) { toast('Format API key tidak dikenali.', 'error'); return; }
          setApiKey(k);
          toast('API key disimpan di perangkat ini.', 'success');
          if (input.value.trim()) form.requestSubmit(); else { box.innerHTML = ''; input.focus(); }
        });
      };

      const render = (items) => {
        if (!items.length) { box.innerHTML = '<p class="muted pad">Tidak ada hasil.</p>'; return; }
        const inPl = new Set(pl.items.map((i) => i.youtubeId));
        box.innerHTML = `<div class="list-box">${items.map((it) => `
          <div class="yt-item">
            <img src="${thumbUrl(it.id, 'mqdefault')}" alt="" loading="lazy">
            <span class="lib-text"><b>${escapeHtml(it.title)}</b><small class="muted">${escapeHtml(it.channel)}</small></span>
            <button type="button" class="icon-btn${inPl.has(it.id) ? ' on' : ''}" data-add="${escapeHtml(it.id)}" aria-label="Tambahkan">${icon(inPl.has(it.id) ? 'checkCircle' : 'plus')}</button>
          </div>`).join('')}</div>`;
        box.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', () => {
          const it = items.find((x) => x.id === btn.dataset.add);
          const r = store.addVideos([it.id], pl.id);
          const v = store.data.videos[it.id];
          if (v && !v.title) store.updateVideo(it.id, { title: it.title, channel: v.channel || it.channel });
          btn.classList.add('on');
          btn.innerHTML = icon('checkCircle');
          toast(r.added ? `Ditambahkan ke “${pl.name}”.` : `Sudah ada di “${pl.name}”.`, r.added ? 'success' : 'info');
        }));
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const qText = input.value.trim();
        const key = getApiKey();
        if (!key) { needKey(qText); return; }
        if (!qText) { input.focus(); return; }
        if (navigator.onLine === false) { box.innerHTML = '<p class="error-text pad">Kamu sedang offline. Pencarian YouTube butuh internet.</p>'; return; }
        input.blur(); // tutup keyboard HP supaya hasil terlihat
        box.innerHTML = '<p class="muted pad"><span class="spinner"></span> Mencari…</p>';
        try {
          render(await searchYouTube(qText, key));
        } catch (err) {
          box.innerHTML = `<p class="error-text pad">${escapeHtml(err.message || String(err))}</p>`;
          if (/API key/.test(err.message || '')) needKey(qText);
        }
      });

      if (query && getApiKey()) form.requestSubmit();
      else if (!getApiKey()) needKey(query);
      else input.focus();
    },
  });
}

// ---------- putar di aplikasi YouTube ----------
/** Daftar video sebagai playlist sementara di YouTube (maks. 50). Di Android, paksa buka aplikasi YouTube. */
export function youtubeAppUrl(ids) {
  const list = ids.slice(0, 50).join(',');
  const https = `https://www.youtube.com/watch_videos?video_ids=${list}`;
  if (/Android/i.test(navigator.userAgent)) {
    return `intent://www.youtube.com/watch_videos?video_ids=${list}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(https)};end`;
  }
  return https;
}
