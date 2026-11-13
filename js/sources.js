// Sumber lagu tambahan:
// - pilih dari library (video yang sudah pernah ditambahkan)
// - cari di YouTube (YouTube Data API v3 dengan API key milik pengguna sendiri)
// - putar daftar di aplikasi YouTube (Premium: bisa di latar belakang)

import { modal, toast } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, formatDuration, skeletonRows } from './utils.js';
import { thumbUrl } from './metadata.js';
import { titleOf } from './titles.js';
import { extractPlaylistId } from './parser.js';

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
          <span class="lib-text"><b>${escapeHtml(titleOf(v) || v.youtubeId)}</b><small class="muted">${escapeHtml(v.channel || '')}${v.duration ? ` · ${formatDuration(v.duration)}` : ''}</small></span>
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

// ---------- akses YouTube Data API + diagnosis error yang jelas ----------
/** Pola "Website restrictions" yang cocok untuk alamat aplikasi ini. */
export const siteReferrerPattern = () => (typeof location !== 'undefined' ? `${location.origin}/*` : 'https://namakamu.github.io/*');

/**
 * Terjemahkan error Google API jadi penyebab + cara memperbaiki. Murni (mudah diuji).
 * Hasil: { code, message }.
 */
export function explainYtError(status, json = {}) {
  const err = (json && json.error) || {};
  const reasons = [
    ...((err.errors || []).map((e) => e.reason)),
    ...((err.details || []).map((d) => d.reason)),
    err.status,
  ].filter(Boolean).map(String);
  const has = (...r) => r.some((x) => reasons.includes(x));
  const gmsg = String(err.message || '');
  const project = ((err.details || []).find((d) => d.metadata && (d.metadata.consumer || d.metadata.activationUrl)) || {}).metadata || {};
  if (has('quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'RATE_LIMIT_EXCEEDED')) {
    return { code: 'quota', message: 'Kuota YouTube API hari ini habis (±10.000 unit/hari; 1 pencarian = 100 unit). Coba lagi besok — kuota direset sekitar pukul 14.00–15.00 WIB.' };
  }
  if (has('accessNotConfigured', 'SERVICE_DISABLED') || /has not been used|is disabled/i.test(gmsg)) {
    const url = project.activationUrl || 'https://console.cloud.google.com/apis/library/youtube.googleapis.com';
    return { code: 'disabled', message: `YouTube Data API v3 belum diaktifkan di project Google Cloud tempat key ini dibuat. Buka ${url}, pastikan project yang dipilih sama dengan project key-nya, klik ENABLE, tunggu 1–5 menit, lalu coba lagi.` };
  }
  if (has('ipRefererBlocked', 'API_KEY_HTTP_REFERRER_BLOCKED') || /referer|referrer/i.test(gmsg)) {
    return { code: 'referrer', message: `Pembatasan website (Website restrictions) di key ini menolak aplikasi. Di Google Cloud → Credentials → key-mu → Website restrictions, tambahkan persis: ${siteReferrerPattern()} lalu Save (berlaku 1–5 menit).` };
  }
  if (has('API_KEY_SERVICE_BLOCKED') || /blocked/i.test(gmsg)) {
    return { code: 'restricted', message: 'Key ini dibatasi untuk API lain. Di Google Cloud → Credentials → key-mu → API restrictions, centang “YouTube Data API v3” (atau pilih “Don\'t restrict key”), lalu Save.' };
  }
  if (has('keyInvalid', 'API_KEY_INVALID') || (status === 400 && /api key/i.test(gmsg))) {
    return { code: 'invalid', message: 'API key tidak valid — mungkin salah salin, sudah dihapus, atau di-regenerate. Salin ulang dari Google Cloud → Credentials.' };
  }
  if (has('playlistNotFound') || status === 404) {
    return { code: 'notfound', message: 'Playlist tidak ditemukan atau privat. Mix/Radio otomatis YouTube (list=RD…) juga tidak bisa diambil.' };
  }
  return { code: 'other', message: `Permintaan ke YouTube gagal (${status})${gmsg ? `: ${gmsg}` : ''}.` };
}

/** fetch ke YouTube Data API. Mengirim alamat lengkap halaman sebagai referrer supaya pembatasan website berbasis path juga cocok. */
export async function ytFetch(path, params, key) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  u.search = new URLSearchParams({ ...params, key });
  let res;
  try {
    res = await fetch(u, { referrerPolicy: 'no-referrer-when-downgrade' });
  } catch {
    throw Object.assign(new Error(navigator.onLine === false ? 'Kamu sedang offline.' : 'Tidak bisa menghubungi YouTube API (jaringan/ekstensi pemblokir).'), { code: 'network' });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = explainYtError(res.status, json);
    throw Object.assign(new Error(e.message), { code: e.code });
  }
  return json;
}

/** Tes API key dengan permintaan termurah (1 unit). */
export async function testApiKey(key) {
  await ytFetch('videos', { part: 'id', id: 'dQw4w9WgXcQ' }, key);
  return true;
}

// ---------- cari di YouTube ----------
async function searchYouTube(q, key) {
  const json = await ytFetch('search', { part: 'snippet', type: 'video', maxResults: '20', q, videoEmbeddable: 'true' }, key);
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
        box.innerHTML = skeletonRows(5);
        try {
          render(await searchYouTube(qText, key));
        } catch (err) {
          box.innerHTML = `<p class="error-text pad">${escapeHtml(err.message || String(err))}</p>`;
          if (['invalid', 'disabled', 'referrer', 'restricted'].includes(err.code)) box.insertAdjacentHTML('beforeend', '<p class="hint pad">Perbaiki di Google Cloud, lalu tekan Cari lagi. Cek cepat: Setelan → Umum → <b>Tes key</b>.</p>');
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


// ---------- import playlist YouTube ----------
async function ytApi(path, params, key) {
  return ytFetch(path, params, key);
}

/** Ambil judul playlist + semua video (maks. 1000). onProgress(n) dipanggil tiap halaman. */
export async function fetchYouTubePlaylist(listId, key, onProgress = () => {}) {
  const meta = await ytApi('playlists', { part: 'snippet,contentDetails', id: listId }, key);
  const info = meta.items && meta.items[0];
  if (!info) throw new Error('Playlist tidak ditemukan atau privat. Mix/Radio otomatis YouTube (list=RD…) juga tidak bisa di-import.');
  const out = [];
  let pageToken = '';
  do {
    const page = await ytApi('playlistItems', { part: 'snippet,contentDetails', playlistId: listId, maxResults: '50', ...(pageToken ? { pageToken } : {}) }, key);
    for (const it of page.items || []) {
      const id = it.contentDetails && it.contentDetails.videoId;
      const title = decode(it.snippet && it.snippet.title);
      if (!id || title === 'Deleted video' || title === 'Private video') continue;
      out.push({ id, title, channel: decode((it.snippet && (it.snippet.videoOwnerChannelTitle || '')) || '').replace(/ - Topic$/, ' - Topic') });
    }
    onProgress(out.length, (info.contentDetails && info.contentDetails.itemCount) || 0);
    pageToken = page.nextPageToken || '';
  } while (pageToken && out.length < 1000);
  return { title: decode(info.snippet.title), channel: decode(info.snippet.channelTitle), count: (info.contentDetails && info.contentDetails.itemCount) || out.length, videos: out };
}

/** Dialog import: tempel link playlist → pilih tujuan → tarik semua video. */
export function ytPlaylistImportDialog(store, { url = '', targetId = null, onAdded = () => {} } = {}) {
  const cur = store.getPlaylist(targetId);
  return modal({
    title: 'Import playlist YouTube',
    body: `
      <form class="yt-form row" autocomplete="off">
        <input type="url" name="u" placeholder="https://www.youtube.com/playlist?list=PL…" value="${escapeHtml(url)}" aria-label="Link playlist YouTube">
        <button type="submit" class="btn btn-primary">${icon('download')}<span>Ambil</span></button>
      </form>
      <p class="hint">${getApiKey() ? 'Semua video di playlist publik/unlisted ikut di-import (maks. 1000), lengkap dengan judulnya.' : 'Tanpa API key: ±200 video pertama dari playlist publik/unlisted. Judulnya dimuat setelah di-import.'} Mix/Radio otomatis YouTube tidak didukung.</p>
      <div class="yt-results"></div>`,
    actions: [{ label: 'Tutup', value: null }],
    onOpen: (b, finish) => {
      const form = b.querySelector('.yt-form');
      const input = form.querySelector('input');
      const box = b.querySelector('.yt-results');
      let fetched = null;

      const needKey = () => {
        box.innerHTML = `<div class="card"><h3>${icon('lock')}Butuh YouTube API key (sekali saja)</h3>
          <p class="muted">Import playlist memakai YouTube Data API dengan key milikmu sendiri (sama dengan untuk Cari di YouTube).</p>${KEY_HELP}
          <div class="row"><input type="text" class="key-input" placeholder="AIza…" aria-label="YouTube API key"><button type="button" class="btn btn-primary" data-k="save">Simpan</button></div></div>`;
        box.querySelector('[data-k=save]').addEventListener('click', () => {
          const k = box.querySelector('.key-input').value.trim();
          if (!/^[\w-]{20,}$/.test(k)) { toast('Format API key tidak dikenali.', 'error'); return; }
          setApiKey(k);
          toast('API key disimpan di perangkat ini.', 'success');
          form.requestSubmit();
        });
      };

      const showResult = () => {
        const f = fetched;
        const existing = store.data.playlists.find((p) => p.name.toLowerCase() === f.title.toLowerCase());
        box.innerHTML = `<div class="card">
          <h3>${icon('music')}${escapeHtml(f.title)}</h3>
          <p class="muted">${f.channel ? `${escapeHtml(f.channel)} · ` : ''}${f.videos.length} video bisa di-import${f.count > f.videos.length ? ` (dari ${f.count}; sisanya dihapus/privat atau melebihi batas)` : ''}</p>
          ${f.noKey && f.videos.length >= 195 ? '<p class="hint">Tanpa API key hanya ±200 video pertama yang terbaca. Untuk playlist lebih besar, simpan YouTube API key di Setelan → Umum.</p>' : ''}
          <label class="field"><span>Masukkan ke</span>
            <select class="imp-target">
              <option value="__new__">Playlist baru: “${escapeHtml(f.title)}”</option>
              ${store.data.playlists.map((p) => `<option value="${escapeHtml(p.id)}"${(existing ? existing.id : (cur && cur.id)) === p.id && existing ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
            </select></label>
          <div class="row"><button type="button" class="btn btn-primary" data-k="import">${icon('plus')}Import ${f.videos.length} video</button></div></div>`;
        box.querySelector('[data-k=import]').addEventListener('click', () => {
          let target = box.querySelector('.imp-target').value;
          if (target === '__new__') target = store.createPlaylist(f.title).id;
          const ids = f.videos.map((v) => v.id);
          const r = store.addVideos(ids, target);
          for (const v of f.videos) {
            const cur2 = store.data.videos[v.id];
            if (cur2 && !cur2.title) { cur2.title = v.title; if (!cur2.channel && v.channel) cur2.channel = v.channel; }
          }
          store.commit('import-yt-playlist');
          onAdded(ids);
          finish({ target, added: r.added });
          toast(`${r.added} video di-import ke “${store.getPlaylist(target).name}”${r.skipped ? ` · ${r.skipped} sudah ada` : ''}.`, 'success', 6000);
        });
      };

      box.addEventListener('click', (e) => { if (e.target.closest('[data-k=want-key]')) needKey(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const listId = extractPlaylistId(input.value);
        if (!listId) { box.innerHTML = '<p class="error-text pad">Bukan link playlist YouTube. Contoh: https://www.youtube.com/playlist?list=PL…</p>'; return; }
        if (/^RD/.test(listId)) { box.innerHTML = '<p class="error-text pad">Ini Mix/Radio otomatis YouTube (list=RD…). YouTube tidak mengizinkan Mix diambil lewat API. Simpan dulu sebagai playlist di YouTube, lalu import link playlist-nya.</p>'; return; }
        const key = getApiKey();
        if (navigator.onLine === false) { box.innerHTML = '<p class="error-text pad">Kamu sedang offline.</p>'; return; }
        box.innerHTML = '<p class="muted pad"><span class="spinner"></span> Mengambil playlist…</p>';
        try {
          if (key) {
            fetched = await fetchYouTubePlaylist(listId, key, (n, total) => {
              box.innerHTML = `<p class="muted pad"><span class="spinner"></span> Mengambil video ${n}${total ? ` dari ${total}` : ''}…</p>`;
            });
          } else {
            // tanpa API key: baca daftar video lewat player YouTube tersembunyi (js/ytlist.js)
            const { playlistIdsViaPlayer, playlistTitle } = await import('./ytlist.js');
            const [ids, meta] = await Promise.all([playlistIdsViaPlayer(listId), playlistTitle(listId)]);
            fetched = { title: (meta && meta.title) || 'Playlist YouTube', channel: (meta && meta.channel) || '', count: ids.length, videos: ids.map((id) => ({ id, title: '', channel: '' })), noKey: true };
          }
          if (!fetched.videos.length) { box.innerHTML = '<p class="muted pad">Playlist ini kosong atau semua videonya privat/dihapus.</p>'; return; }
          showResult();
        } catch (err) {
          box.innerHTML = `<p class="error-text pad">${escapeHtml(err.message || String(err))}</p>`;
          if (!key) box.insertAdjacentHTML('beforeend', '<p class="pad"><button type="button" class="btn sm" data-k="want-key">Pakai API key…</button></p>');
        }
      });
      if (url && extractPlaylistId(url)) form.requestSubmit(); else input.focus();
    },
  });
}

// ---------- versi audio (untuk lirik yang pas) ----------
/** "PT3M5S" → 185 */
export function parseIsoDuration(iso = '') {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso));
  if (!m) return 0;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0);
}

const norm = (x) => String(x || '').toLocaleLowerCase('id').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const BAD = /\b(m\/?v|music video|official video|video oficial|performance|dance practice|live|concert|cover|remix|sped ?up|slowed|nightcore|karaoke|instrumental|8d|reverb|reaction|teaser|lyrics? ?(?:español|terjemahan|sub)|fancam|1 ?hour|loop)\b/i;

/**
 * Urutkan kandidat versi audio: durasi paling dekat dengan lirik, channel "- Topic", "Official Audio".
 * items: [{id, title, channel, duration}] → [{...item, score, diff, topic}] (terbaik dulu). Murni, mudah diuji.
 */
export function rankAudioCandidates(items, { lyricDuration = 0, track = '', excludeId = '' } = {}) {
  const words = norm(track).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  return items
    .filter((it) => it && it.id && it.id !== excludeId && it.duration > 30)
    .map((it) => {
      const title = norm(it.title);
      const topic = /\s-\s*topic$/i.test(it.channel || '');
      const diff = lyricDuration ? Math.abs(it.duration - lyricDuration) : null;
      let score = 0;
      if (diff != null) score += diff <= 2 ? 60 : diff <= 4 ? 45 : diff <= 8 ? 20 : -Math.min(60, diff);
      if (topic) score += 35;
      if (/official audio|audio oficial|\(audio\)|\[audio\]/i.test(it.title)) score += 25;
      else if (/lyric/i.test(it.title)) score += 12;
      if (BAD.test(it.title)) score -= 45;
      if (words.length) {
        const hit = words.filter((w) => title.includes(w)).length / words.length;
        score += hit >= 0.6 ? 10 : -35;
      }
      return { ...it, score, diff, topic };
    })
    .sort((a, b) => b.score - a.score);
}

/** Cari versi audio lewat YouTube Data API (1 pencarian + 1 permintaan durasi). */
export async function findAudioVersions({ artist = '', track = '', lyricDuration = 0, excludeId = '' }, key) {
  const q = `${artist} ${track} audio`.trim();
  const found = await ytApi('search', { part: 'snippet', type: 'video', maxResults: '15', q, videoEmbeddable: 'true' }, key);
  const ids = (found.items || []).map((it) => it.id && it.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const det = await ytApi('videos', { part: 'contentDetails,snippet', id: ids.join(',') }, key);
  const items = (det.items || []).map((v) => ({
    id: v.id,
    title: decode(v.snippet.title),
    channel: decode(v.snippet.channelTitle),
    duration: parseIsoDuration(v.contentDetails && v.contentDetails.duration),
  }));
  return rankAudioCandidates(items, { lyricDuration, track, excludeId });
}

/**
 * Dialog "Ganti ke versi audio". current = {youtubeId, title, channel, duration}; info = {artist, track, lyricDuration}.
 * Hasil: { id, mode: 'replace' | 'after' } atau null.
 */
export function audioVersionDialog(store, { current, info }) {
  const inPls = store.data.playlists.filter((p) => p.items.some((it) => it.youtubeId === current.youtubeId));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return modal({
    title: 'Ganti ke versi audio',
    wide: true,
    body: `
      <p class="muted">Versi audio (channel <b>“Artis - Topic”</b> atau <i>Official Audio</i>) memakai rekaman yang sama dengan lirik, jadi lirik langsung pas tanpa diatur.
        ${info.lyricDuration ? `Durasi lirik: <b>${fmt(Math.round(info.lyricDuration))}</b> · video sekarang: ${fmt(Math.round(current.duration || 0))}.` : ''}</p>
      <div class="yt-results av-results">${skeletonRows(4)}</div>
      <p class="hint">${inPls.length
        ? `<b>Ganti</b> menukar video ini di ${inPls.length === 1 ? `playlist “${escapeHtml(inPls[0].name)}”` : `${inPls.length} playlist`} (posisinya tetap). MV-nya tetap ada di <i>Semua video</i>.`
        : 'Video ini belum ada di playlist mana pun; versi audio akan ditambahkan ke playlist yang sedang dibuka.'}</p>`,
    actions: [{ label: 'Tutup', value: null }],
    onOpen: async (b, finish) => {
      const box = b.querySelector('.av-results');
      const key = getApiKey();
      if (!key) {
        box.innerHTML = `<div class="card"><h3>${icon('lock')}Butuh YouTube API key</h3>
          <p class="muted">Sama dengan yang dipakai <b>Cari di YouTube</b>. Atur di Setelan → Umum, atau cari manual:</p>
          <a class="btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${info.artist} ${info.track} topic audio`)}" target="_blank" rel="noopener">${icon('external')}Cari “${escapeHtml(info.track)}” di YouTube</a></div>`;
        return;
      }
      try {
        const list = await findAudioVersions({ ...info, excludeId: current.youtubeId }, key);
        const good = list.filter((x) => x.score > 0).slice(0, 6);
        const show = good.length ? good : list.slice(0, 4);
        if (!show.length) { box.innerHTML = '<p class="muted pad">Tidak ada versi audio yang ditemukan.</p>'; return; }
        box.innerHTML = `${good.length ? '' : '<p class="muted small pad">Tidak ada yang benar-benar cocok. Ini hasil terdekat:</p>'}<div class="list-box">${show.map((it, i) => `
          <div class="yt-item av-item${i === 0 && good.length ? ' best' : ''}">
            <img src="${thumbUrl(it.id, 'mqdefault')}" alt="" loading="lazy">
            <span class="lib-text"><b>${escapeHtml(it.title)}</b>
              <small class="muted">${escapeHtml(it.channel)} · ${fmt(it.duration)}</small>
              <span class="av-badges">${i === 0 && good.length ? '<span class="av-badge best">Paling cocok</span>' : ''}${it.topic ? '<span class="av-badge">Topic</span>' : ''}${it.diff != null ? `<span class="av-badge ${it.diff <= 4 ? 'ok' : 'warn'}">${it.diff <= 4 ? 'durasi pas' : `selisih ${Math.round(it.diff)} dtk`}</span>` : ''}</span></span>
            <span class="av-actions">
              <button type="button" class="btn btn-primary sm" data-av="replace" data-id="${escapeHtml(it.id)}">Ganti &amp; putar</button>
              ${inPls.length ? `<button type="button" class="btn sm" data-av="after" data-id="${escapeHtml(it.id)}" title="MV tetap ada, versi audio ditaruh tepat setelahnya">Tambah di sebelahnya</button>` : ''}
            </span>
          </div>`).join('')}</div>`;
        box.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-av]');
          if (!btn) return;
          const it = show.find((x) => x.id === btn.dataset.id);
          finish({ id: it.id, mode: btn.dataset.av, meta: { title: it.title, channel: it.channel, duration: it.duration } });
        });
      } catch (err) {
        box.innerHTML = `<p class="error-text pad">${escapeHtml(err.message || String(err))}</p>`;
      }
    },
  });
}
