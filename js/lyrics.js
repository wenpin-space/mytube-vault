// Lirik dari LRCLIB (lrclib.net, gratis, tanpa API key). Lirik tersinkron (format LRC) disorot mengikuti posisi lagu.

import { escapeHtml, skeletonRows } from './utils.js';
import { icon } from './icons.js';
import { thumbUrl } from './metadata.js';

const API = 'https://lrclib.net/api';
const PICK_KEY = 'mytube_vault_lyrics_v1'; // videoId → id lirik LRCLIB yang dipilih (atau 0 = tidak ada)
const OFFSET_KEY = 'mytube_vault_lyrics_offset_v1'; // videoId → geser waktu lirik (detik)

/** Bersihkan judul video YouTube jadi kata kunci lagu: buang [..], (..), 【..】, "Official Video", "Lyrics", dsb. */
export function cleanTitle(title = '') {
  let t = String(title)
    .replace(/[【\[「『《(（][^】\]」』》)）]*[】\]」』》)）]/g, ' ')
    .replace(/\b(official|music|lyrics?|lyric video|mv|m\/v|video|audio|hd|4k|visualizer|live|cover|ver\.?|version)\b/gi, ' ')
    .replace(/動態歌詞|动态歌词|歌詞|歌词|完整版|高音質|官方|lyrics\s*video/gi, ' ')
    .replace(/[|｜]/g, ' ')
    .replace(/\s+[-–—]\s+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t || String(title).trim();
}

/** "Artis - Judul" → {artist, track}; kalau tidak ada pemisah, artist dari nama channel. */
export function guessArtistTrack(title, channel = '') {
  const clean = cleanTitle(title);
  const m = clean.split(/\s+[-–—]\s+/);
  if (m.length >= 2) return { artist: m[0].trim(), track: m.slice(1).join(' ').trim() };
  return { artist: String(channel).replace(/\s*-\s*Topic$/i, '').replace(/\s*(VEVO|Official)$/i, '').trim(), track: clean };
}

/** Parse LRC → [{t: detik, text}] terurut. */
export function parseLrc(lrc = '') {
  const out = [];
  for (const line of String(lrc).split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) {
      const frac = m[3] ? Number(m[3]) / (m[3].length === 3 ? 1000 : 100) : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Indeks baris yang sedang dinyanyikan pada detik `time` (-1 sebelum baris pertama). */
export function lineAt(lines, time) {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time + 0.25) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
export const searchLyrics = (q) => getJson(`${API}/search?${new URLSearchParams({ q })}`).then((r) => (Array.isArray(r) ? r : []));
export const getLyricsById = (id) => getJson(`${API}/get/${encodeURIComponent(id)}`);

function getPick(videoId) { try { return JSON.parse(localStorage.getItem(PICK_KEY) || '{}')[videoId]; } catch { return undefined; } }
/** Pakai lirik yang sama untuk video lain (mis. setelah MV diganti versi audionya). */
export function rememberLyrics(videoId, lyricId) { if (videoId && lyricId) setPick(videoId, lyricId); }
function setPick(videoId, id) {
  try {
    const m = JSON.parse(localStorage.getItem(PICK_KEY) || '{}');
    m[videoId] = id;
    const keys = Object.keys(m);
    if (keys.length > 500) delete m[keys[0]];
    localStorage.setItem(PICK_KEY, JSON.stringify(m));
  } catch { /* abaikan */ }
}

// Geser waktu: video MV sering punya intro/adegan tambahan, sedangkan LRC disinkronkan ke versi audio.
// offset > 0 → lirik muncul lebih lambat (video punya intro lebih panjang).
function offsets() { try { return JSON.parse(localStorage.getItem(OFFSET_KEY) || '{}') || {}; } catch { return {}; } }
function getOffset(videoId) { return Number(offsets()[videoId]) || 0; }
/** Sudah pernah disinkronkan/dikonfirmasi pengguna (termasuk "sudah pas" = 0)? */
function hasOffset(videoId) { return Object.prototype.hasOwnProperty.call(offsets(), videoId); }
function setOffset(videoId, sec) {
  try {
    const m = offsets();
    m[videoId] = Math.round(sec * 10) / 10;
    const keys = Object.keys(m);
    if (keys.length > 500) delete m[keys[0]];
    localStorage.setItem(OFFSET_KEY, JSON.stringify(m));
  } catch { /* abaikan */ }
}

/** Offset supaya baris `line` tepat sedang dinyanyikan pada detik video `videoTime`. */
export function offsetFromTap(videoTime, lineTime) {
  return Math.round((videoTime - lineTime) * 10) / 10;
}

const fmtOffset = (o) => `${o > 0 ? '+' : o < 0 ? '−' : '±'}${Math.abs(o).toFixed(1)} dtk`;
const recCache = new Map(); // videoId → { rec, results, query } — dipakai ulang saat panel dibuka lagi
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Pilih hasil terbaik: utamakan lirik tersinkron dan durasi yang paling dekat. */
export function bestMatch(results, duration = 0) {
  const usable = results.filter((r) => r && (r.syncedLyrics || r.plainLyrics || r.instrumental));
  if (!usable.length) return null;
  const score = (r) => (r.syncedLyrics ? 0 : 30) + (duration && r.duration ? Math.min(60, Math.abs(r.duration - duration)) : 15);
  return [...usable].sort((a, b) => score(a) - score(b))[0];
}

/**
 * Panel lirik. host = elemen panel; getTrack() → {youtubeId, title, channel, duration} lagu sekarang.
 */
export function createLyricsPanel(host, { getTrack, seek, getTime = () => 0, onFindAudio = null }) {
  const st = { videoId: null, lines: null, active: -1, results: [], loading: false, query: '', offset: 0, syncMode: false, rec: null };
  const body = host.querySelector('.lyrics-body');
  const form = host.querySelector('.lyrics-form');
  const input = form.querySelector('input');

  /** Artwork besar (thumbnail lagu) — dipakai saat lirik belum ada / tidak ditemukan. */
  const art = (inner) => {
    const tr = getTrack();
    return `<div class="lv-art">${tr ? `<img src="${thumbUrl(tr.youtubeId, 'hqdefault')}" alt="">` : `<div class="lv-art-ph">${icon('music')}</div>`}
      <div class="lv-art-text">${tr ? `<b>${escapeHtml(tr.title || '')}</b><span>${escapeHtml(tr.channel || '')}</span>` : ''}${inner}</div></div>`;
  };

  const renderLyrics = (rec, note = '') => {
    st.lines = null;
    st.active = -1;
    st.rec = rec || null;
    if (!rec) {
      body.innerHTML = art(`<p class="lv-msg">Lirik tidak ditemukan untuk “${escapeHtml(st.query)}”.</p>
        <p class="lv-sub">Ubah kata kunci di atas (mis. “Artis Judul”), lalu cari lagi.</p>
        <a class="btn sm" href="https://www.google.com/search?q=${encodeURIComponent(`${st.query} lirik`)}" target="_blank" rel="noopener">${icon('external')}Cari lirik di Google</a>`);
      return;
    }
    const head = `<div class="lyrics-meta"><b>${escapeHtml(rec.trackName || '')}</b><span class="small">${escapeHtml(rec.artistName || '')}${rec.albumName ? ` · ${escapeHtml(rec.albumName)}` : ''}</span>
      ${st.results.length > 1 ? '<button type="button" class="link-btn small" data-l-act="others">Bukan ini? Lihat hasil lain</button>' : ''}${note}</div>`;
    if (rec.instrumental && !rec.syncedLyrics && !rec.plainLyrics) { body.innerHTML = art('<p class="lv-msg">♪ Instrumental — tidak ada lirik.</p>'); return; }
    if (rec.syncedLyrics) {
      st.lines = parseLrc(rec.syncedLyrics);
      st.syncMode = needsSync();
      body.innerHTML = `${head}<div class="lyrics-sync" role="group" aria-label="Sinkronkan lirik"></div>
        <div class="lyrics-lines synced">${st.lines.map((l, i) => `<p data-i="${i}" data-t="${l.t}">${escapeHtml(l.text) || '♪'}</p>`).join('')}</div>
        <p class="hint">Ketuk baris lirik untuk melompat ke bagian itu.</p>`;
      renderSyncBar();
    } else {
      body.innerHTML = `${head}<div class="lyrics-lines plain">${String(rec.plainLyrics).split(/\r?\n/).map((l) => `<p>${escapeHtml(l) || '&nbsp;'}</p>`).join('')}</div>
        <p class="hint">Lirik ini tidak tersinkron dengan waktu lagu.</p>`;
    }
  };

  /** Durasi video jauh beda dari durasi lirik (versi audio) dan belum pernah disinkronkan → minta satu ketukan. */
  function durDiff() {
    const tr = getTrack();
    const vd = tr && tr.duration;
    const ld = st.rec && st.rec.duration;
    return { vd, ld, diff: vd && ld ? vd - ld : 0 };
  }
  function looksLikeMv() {
    const tr = getTrack();
    return !!tr && /\b(m\/?v|music video|official video|performance)\b/i.test(tr.title || '');
  }
  function needsSync() {
    return !!st.videoId && !hasOffset(st.videoId) && Math.abs(durDiff().diff) >= 4;
  }

  function renderSyncBar() {
    const bar = body.querySelector('.lyrics-sync');
    if (!bar) return;
    const { vd, ld } = durDiff();
    const auto = st.syncMode && needsSync();
    bar.classList.toggle('ask', auto);
    bar.innerHTML = `
      ${auto ? `<p class="ls-ask">${icon('mic')}<span><b>Lirik ini dari versi audio (${fmtTime(ld)}), videonya ${fmtTime(vd)}.</b> Ketuk baris yang <u>sedang kamu dengar</u> supaya lirik pas.</span></p>` : ''}
      <div class="ls-row">
        <button type="button" class="ls-btn" data-l-act="nudge" data-d="-0.5" aria-label="Lirik lebih awal 0,5 detik" title="Lirik lebih awal ( [ )">−0.5</button>
        <span class="ls-off${st.offset ? ' on' : ''}" title="Geser waktu lirik untuk video ini">${fmtOffset(st.offset)}</span>
        <button type="button" class="ls-btn" data-l-act="nudge" data-d="0.5" aria-label="Lirik lebih lambat 0,5 detik" title="Lirik lebih lambat ( ] )">+0.5</button>
        <button type="button" class="ls-btn ls-tap${st.syncMode ? ' on' : ''}" data-l-act="tapmode" aria-pressed="${st.syncMode}">${st.syncMode ? 'Ketuk baris yang sedang dinyanyikan…' : 'Sinkronkan'}</button>
        ${auto && durDiff().diff > 0 ? `<button type="button" class="ls-btn" data-l-act="guess" data-d="${Math.round(durDiff().diff * 10) / 10}" title="Anggap selisih durasi adalah intro video">Perkiraan: intro ${fmtOffset(Math.round(durDiff().diff * 10) / 10)}</button>` : ''}
        ${auto ? '<button type="button" class="ls-btn" data-l-act="ok">Sudah pas</button>' : ''}
        ${onFindAudio && (Math.abs(durDiff().diff) >= 4 || looksLikeMv()) ? `<button type="button" class="ls-btn ls-audio" data-l-act="audio" title="Cari versi audio yang liriknya pas">${icon('music')}Ganti ke versi audio</button>` : ''}
        ${st.offset ? '<button type="button" class="ls-btn" data-l-act="reset" title="Kembalikan ke 0">Reset</button>' : ''}
      </div>`;
    const lines = body.querySelector('.lyrics-lines.synced');
    if (lines) lines.classList.toggle('tapping', st.syncMode);
  }

  function applyOffset(o, { broadcast = true } = {}) {
    st.offset = Math.max(-600, Math.min(600, Math.round(o * 10) / 10));
    if (st.videoId) setOffset(st.videoId, st.offset);
    st.active = -2; // paksa sorot ulang
    st.syncMode = false;
    renderSyncBar();
    if (broadcast && st.videoId) window.dispatchEvent(new CustomEvent('lyrics-offset', { detail: { id: st.videoId, offset: st.offset, from: host } }));
  }
  window.addEventListener('lyrics-offset', (e) => {
    if (e.detail.from !== host && e.detail.id === st.videoId) { st.offset = e.detail.offset; st.active = -2; st.syncMode = false; renderSyncBar(); }
  });

  const renderResults = () => {
    body.innerHTML = `<p class="muted small pad">Pilih lirik yang cocok:</p><div class="list-box">${st.results.slice(0, 15).map((r, i) => `
      <button type="button" class="pick-item" data-l-pick="${i}">${icon(r.syncedLyrics ? 'mic' : 'music')}<span>${escapeHtml(r.trackName)} <span class="muted small">· ${escapeHtml(r.artistName || '')}</span></span>
        <span class="muted small">${r.syncedLyrics ? 'tersinkron' : r.instrumental ? 'instrumental' : 'teks'}</span></button>`).join('')}</div>`;
  };

  async function search(q, { auto = false } = {}) {
    const tr = getTrack();
    st.query = q;
    input.value = q;
    if (!q) { body.innerHTML = art('<p class="lv-msg">Judul lagu belum tersedia.</p><p class="lv-sub">Ketik artis + judul di kolom pencarian di atas.</p>'); return; }
    body.innerHTML = art(`<p class="lv-msg">Mencari lirik…</p>${skeletonRows(3, { thumb: false })}`);
    try {
      st.results = await searchLyrics(q);
      const now = getTrack();
      if (auto && (!now || !tr || now.youtubeId !== tr.youtubeId)) return; // lagu sudah berganti
      const best = bestMatch(st.results, tr && tr.duration);
      if (best && tr) setPick(tr.youtubeId, best.id);
      if (tr) recCache.set(tr.youtubeId, { rec: best, results: st.results, query: q });
      renderLyrics(best);
    } catch (e) {
      body.innerHTML = art(`<p class="lv-msg">Tidak bisa menghubungi layanan lirik (lrclib.net).</p>
        <p class="lv-sub">${navigator.onLine === false ? 'Kamu sedang offline.' : 'Mungkin diblokir jaringan/ekstensi, atau layanannya sedang gangguan.'}</p>
        <a class="btn sm" href="https://lrclib.net/search/${encodeURIComponent(q)}" target="_blank" rel="noopener">${icon('external')}Buka di lrclib.net</a>`);
    }
  }

  async function loadForCurrent(force = false) {
    const tr = getTrack();
    if (!tr) { body.innerHTML = art('<p class="lv-msg">Putar lagu untuk melihat liriknya.</p>'); st.videoId = null; return; }
    if (!force && st.videoId === tr.youtubeId) return;
    st.videoId = tr.youtubeId;
    st.offset = getOffset(tr.youtubeId);
    st.results = [];
    const { artist, track } = guessArtistTrack(tr.title || '', tr.channel || '');
    const q = `${artist ? `${artist} ` : ''}${track}`.trim();
    const cached = recCache.get(tr.youtubeId);
    if (cached) {
      st.query = cached.query; input.value = cached.query; st.results = cached.results || [];
      renderLyrics(cached.rec);
      return;
    }
    const picked = getPick(tr.youtubeId);
    if (picked) {
      st.query = q; input.value = q;
      body.innerHTML = art(`<p class="lv-msg">Memuat lirik…</p>${skeletonRows(3, { thumb: false })}`);
      try { const rec = await getLyricsById(picked); if (rec && st.videoId === tr.youtubeId) { recCache.set(tr.youtubeId, { rec, results: [], query: q }); renderLyrics(rec); return; } } catch { /* cari ulang */ }
    }
    search(q, { auto: true });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); search(input.value.trim()); });
  const userScroll = () => { st.userScrollAt = Date.now(); };
  body.addEventListener('wheel', userScroll, { passive: true });
  body.addEventListener('touchmove', userScroll, { passive: true });
  body.addEventListener('click', (e) => {
    const line = e.target.closest('.lyrics-lines.synced p');
    if (line) {
      if (st.syncMode) {
        st.syncMode = false;
        applyOffset(offsetFromTap(getTime(), Number(line.dataset.t)));
      } else seek(Number(line.dataset.t) + st.offset);
      return;
    }
    const act = e.target.closest('[data-l-act]');
    if (act && act.dataset.lAct === 'nudge') { applyOffset(st.offset + Number(act.dataset.d)); return; }
    if (act && (act.dataset.lAct === 'reset' || act.dataset.lAct === 'ok')) { applyOffset(0); return; }
    if (act && act.dataset.lAct === 'audio') {
      const tr = getTrack();
      const { artist, track } = guessArtistTrack(tr ? tr.title : '', tr ? tr.channel : '');
      onFindAudio({ artist: (st.rec && st.rec.artistName) || artist, track: (st.rec && st.rec.trackName) || track, lyricDuration: (st.rec && st.rec.duration) || 0, lyricId: st.rec && st.rec.id });
      return;
    }
    if (act && act.dataset.lAct === 'guess') { applyOffset(Number(act.dataset.d)); return; }
    if (act && act.dataset.lAct === 'tapmode') { st.syncMode = !st.syncMode; renderSyncBar(); return; }
    if (e.target.closest('[data-l-act=others]')) { renderResults(); return; }
    const pick = e.target.closest('[data-l-pick]');
    if (pick) {
      const rec = st.results[Number(pick.dataset.lPick)];
      const tr = getTrack();
      if (tr) { setPick(tr.youtubeId, rec.id); recCache.set(tr.youtubeId, { rec, results: st.results, query: st.query }); }
      renderLyrics(rec);
    }
  });

  return {
    load: loadForCurrent,
    /** Dipanggil berkala dengan posisi lagu → sorot & gulir ke baris aktif. */
    /** Geser waktu lirik (dipakai tombol keyboard [ dan ]). */
    nudge(d) { if (st.lines) applyOffset(st.offset + d); },
    tick(time) {
      if (!st.lines || !st.lines.length) return;
      const i = lineAt(st.lines, time - st.offset);
      if (i === st.active) return;
      const box = body.querySelector('.lyrics-lines');
      if (!box) return;
      const prev = box.querySelector('p.now');
      if (prev) prev.classList.remove('now');
      st.active = i;
      box.querySelectorAll('p[data-i]').forEach((p) => p.classList.toggle('past', Number(p.dataset.i) < i));
      const el = i >= 0 ? box.querySelector(`p[data-i="${i}"]`) : null;
      if (el) {
        el.classList.add('now');
        if (Date.now() - (st.userScrollAt || 0) < 4000) return; // pengguna sedang menggulir sendiri
        const top = el.offsetTop - body.clientHeight / 2 + el.clientHeight / 2;
        body.scrollTo({ top, behavior: 'smooth' });
      }
    },
  };
}
