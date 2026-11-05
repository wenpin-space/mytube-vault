// Fungsi render (DOM). Tidak menyimpan state sendiri — semua dibaca dari store/player/sync.

import { icon } from './icons.js';
import { escapeHtml, formatDuration, formatTotal, timeAgo } from './utils.js';
import { thumbUrl, watchUrl } from './metadata.js';
import { SORT_MODES } from './store.js';

const $ = (id) => document.getElementById(id);

const VIEW_TITLES = { all: 'Semua video', favorites: 'Favorit', unwatched: 'Belum ditonton', history: 'Riwayat' };
export const viewTitle = (v) => VIEW_TITLES[v] || '';

const SYNC_UI = {
  disabled: ['cloudOff', 'Lokal saja', 'muted'],
  pending: ['cloud', 'Menunggu sinkron', 'warn'],
  saving: ['refresh', 'Menyimpan…', 'info spin'],
  checking: ['refresh', 'Memeriksa…', 'info spin'],
  saved: ['cloud', 'Tersimpan', 'ok'],
  offline: ['cloudOff', 'Offline', 'warn'],
  error: ['alert', 'Gagal sinkron', 'err'],
  conflict: ['alert', 'Konflik data', 'err'],
  locked: ['lock', 'Butuh passphrase', 'warn'],
};

export function syncLabel(status) { return SYNC_UI[status] || SYNC_UI.disabled; }

export function renderSyncBadge(sync, store) {
  const [ic, label, cls] = syncLabel(sync.status);
  const b = $('sync-badge');
  b.className = `sync-badge ${cls}`;
  b.innerHTML = `${icon(ic)}<span class="sync-label">${label}</span>`;
  const last = store.cloud.lastSyncedAt ? `Sinkron terakhir ${timeAgo(store.cloud.lastSyncedAt)}` : '';
  b.title = sync.message || last || (sync.status === 'disabled' ? 'Klik untuk mengaktifkan backup ke GitHub Gist' : label);
}

export function renderSidebar(store) {
  const all = Object.values(store.data.videos);
  const counts = {
    all: all.length,
    favorites: all.filter((v) => v.favorite).length,
    unwatched: all.filter((v) => !v.watched).length,
    history: all.filter((v) => v.lastPlayedAt).length,
  };
  const v = store.ui.view;
  const smart = [['all', 'grid'], ['favorites', 'heart'], ['unwatched', 'clock'], ['history', 'history']];
  $('smart-nav').innerHTML = smart.map(([id, ic]) => navItem(id, VIEW_TITLES[id], ic, counts[id], v === id)).join('');
  $('playlist-nav').innerHTML = store.data.playlists
    .map((p) => navItem(`pl:${p.id}`, p.name, 'music', p.items.length, v === `pl:${p.id}`))
    .join('');
  const tags = store.allTags();
  $('tag-title').hidden = !tags.length;
  $('tag-nav').innerHTML = tags.map((t) => navItem(`tag:${t.key}`, `#${t.name}`, 'tag', t.count, v === `tag:${t.key}`)).join('');
}

function navItem(view, label, ic, count, active) {
  return `<button type="button" class="nav-item${active ? ' active' : ''}" data-action="view" data-view="${escapeHtml(view)}"${active ? ' aria-current="page"' : ''}>
    ${icon(ic)}<span class="nav-label">${escapeHtml(label)}</span><span class="nav-count">${count}</span></button>`;
}

export const DENSITIES = [['comfy', 'rows', 'Tampilan nyaman'], ['compact', 'list', 'Tampilan ringkas'], ['grid', 'grid', 'Tampilan kisi']];

export function renderViewHead(store, info) {
  const pl = store.currentPlaylist();
  const tagView = store.ui.view.startsWith('tag:') ? store.allTags().find((t) => t.key === store.ui.view.slice(4)) : null;
  const title = pl ? pl.name : tagView ? `#${tagView.name}` : VIEW_TITLES[store.ui.view];
  const countText = info.filtered ? `${info.visible} dari ${info.total} video` : `${info.total} video`;
  const dur = formatTotal(info.duration);
  const options = SORT_MODES.map(([k, l]) => {
    const label = !pl && k === 'manual' ? (store.ui.view === 'history' ? 'Terakhir diputar' : 'Urutan ditambahkan') : l;
    return `<option value="${k}"${k === info.sort ? ' selected' : ''}>${label}</option>`;
  }).join('');
  $('view-head').innerHTML = `
    <div class="vh-text">
      <p class="eyebrow">${pl ? 'Playlist' : tagView ? 'Tag' : 'Koleksi otomatis'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${countText}${dur ? ` · ±${dur}` : ''}</p>
    </div>
    <div class="vh-actions">
      <button type="button" class="btn btn-primary" data-action="play-all" ${info.visible ? '' : 'disabled'}>${icon('play', 'fill')}<span>Putar</span></button>
      <button type="button" class="btn" data-action="shuffle-all" ${info.visible ? '' : 'disabled'}>${icon('shuffle')}<span>Acak</span></button>
      ${pl ? `<button type="button" class="btn add-song" data-action="open-add" title="Tambah lagu">${icon('plus')}<span>Tambah lagu</span></button>` : ''}
      <label class="select-wrap" title="Urutkan">${icon('sort')}<select data-action="sort" aria-label="Urutkan">${options}</select></label>
      <div class="seg" role="group" aria-label="Tampilan daftar">${DENSITIES.map(([k, ic, l]) => `<button type="button" data-action="density" data-d="${k}" aria-pressed="${k === info.density}" aria-label="${l}" title="${l}">${icon(ic)}</button>`).join('')}</div>
      <button type="button" class="icon-btn" data-action="playlist-menu" aria-label="Opsi lainnya">${icon('more')}</button>
    </div>`;
}

export function renderList(entries, opt) {
  const list = $('video-list');
  const empty = $('list-empty');
  if (!entries.length) {
    list.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = emptyState(opt);
    $('list-more').innerHTML = '';
    return;
  }
  empty.hidden = true;
  const shown = entries.slice(0, opt.limit);
  list.classList.toggle('reorderable', opt.canReorder && !opt.selecting);
  list.classList.toggle('selecting', !!opt.selecting);
  list.dataset.density = opt.density || 'comfy';
  list.innerHTML = shown.map((e, i) => row(e, i, opt)).join('');
  const rest = entries.length - shown.length;
  $('list-more').innerHTML = rest > 0
    ? `<button type="button" class="btn" data-action="more">Tampilkan ${Math.min(rest, opt.page)} lagi · ${rest} tersisa</button>`
    : '';
}

/** Teks dengan bagian yang cocok dengan pencarian ditandai <mark>. */
function highlight(text, q) {
  const safe = escapeHtml(text);
  if (!q) return safe;
  const lower = text.toLocaleLowerCase('id');
  // Tandai setiap kata pencarian (tanpa "#"), gabungkan rentang yang tumpang tindih.
  const words = [...new Set(q.toLocaleLowerCase('id').split(/\s+/).map((w) => w.replace(/^#/, '')).filter(Boolean))];
  const ranges = [];
  for (const w of words) {
    let at = lower.indexOf(w);
    while (at >= 0) { ranges.push([at, at + w.length]); at = lower.indexOf(w, at + w.length); }
  }
  if (!ranges.length || lower.length !== text.length) return safe;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]);
  }
  let out = '';
  let i = 0;
  for (const [a, b] of merged) {
    out += `${escapeHtml(text.slice(i, a))}<mark>${escapeHtml(text.slice(a, b))}</mark>`;
    i = b;
  }
  return out + escapeHtml(text.slice(i));
}

function row(e, i, opt) {
  const v = e.video;
  const playing = opt.playingId === e.youtubeId;
  const loading = !v.title && opt.metaPending(v.youtubeId);
  const title = v.title || (loading ? 'Memuat judul…' : `Judul belum tersedia (${v.youtubeId})`);
  const sel = !!opt.selecting;
  const reorder = opt.canReorder && !sel;
  const picked = sel && opt.selected.has(e.key);
  const fresh = opt.flashKeys && opt.flashKeys.has(e.youtubeId);
  const part = opt.progress ? opt.progress(v.youtubeId, v.duration) : 0;
  const prog = v.watched ? 1 : part > 0.02 ? part : 0;
  const sub = opt.view === 'history' && v.lastPlayedAt ? `diputar ${timeAgo(v.lastPlayedAt)}${v.playCount > 1 ? ` · ${v.playCount}×` : ''}` : timeAgo(e.addedAt);
  return `<li class="vrow${playing ? ' playing' : ''}${v.watched ? ' watched' : ''}${picked ? ' selected' : ''}${fresh ? ' flash' : ''}" data-key="${escapeHtml(e.key)}"${reorder ? ' draggable="true"' : ''}${sel ? ` aria-selected="${picked}"` : ''}>
    ${sel ? `<span class="pick" data-action="select-toggle" role="checkbox" aria-checked="${picked}" aria-label="Pilih">${icon(picked ? 'checkCircle' : 'circle')}</span>` : ''}
    ${reorder ? `<span class="grip" title="Geser untuk mengubah urutan">${icon('grip')}</span>` : ''}
    <span class="idx">${playing ? icon('volume') : i + 1}</span>
    <div class="thumb" data-action="play">
      <img src="${thumbUrl(v.youtubeId)}" alt="" loading="lazy" decoding="async" draggable="false">
      ${v.duration ? `<span class="dur">${formatDuration(v.duration)}</span>` : ''}
      ${prog ? `<span class="thumb-progress${v.watched ? ' done' : ''}" title="${v.watched ? 'Sudah ditonton' : `Ditonton ${Math.round(prog * 100)}%`}"><i style="width:${Math.max(4, Math.round(prog * 100))}%"></i></span>` : ''}
      <span class="thumb-overlay">
        <button type="button" class="thumb-play" data-action="play" aria-label="${playing && opt.isPlaying ? 'Jeda' : 'Putar'} ${escapeHtml(v.title || '')}">${icon(playing && opt.isPlaying ? 'pause' : 'play', 'fill')}</button>
        <span class="thumb-actions">
          <button type="button" class="thumb-act" data-action="thumb-queue" aria-label="Tambah ke antrean" title="Tambah ke antrean">${icon('queue')}</button>
          <button type="button" class="thumb-act danger" data-action="thumb-remove" aria-label="${opt.isPlaylist ? 'Hapus dari playlist' : 'Hapus dari library'}" title="${opt.isPlaylist ? 'Hapus dari playlist' : 'Hapus dari library'}">${icon('trash')}</button>
        </span>
      </span>
    </div>
    <div class="meta" data-action="play">
      ${loading ? '<div class="title"><span class="sk sk-line" style="width:70%"></span></div>' : `<div class="title${v.title ? '' : ' untitled'}" title="${escapeHtml(v.title || '')}">${highlight(title, opt.query)}</div>`}
      <div class="sub">${v.channel ? `<span>${highlight(v.channel, opt.query)}</span>` : ''}<span class="when">${sub}</span>${v.duration ? `<span class="c-dur">${formatDuration(v.duration)}</span>` : ''}${v.watched ? '<span class="tag">ditonton</span>' : ''}${(v.tags || []).slice(0, 4).map((t) => `<button type="button" class="tag tag-user" data-action="tag-open" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join('')}</div>
    </div>
    <div class="row-actions">
      <button type="button" class="icon-btn fav${v.favorite ? ' on' : ''}" data-action="fav" aria-label="Favorit" aria-pressed="${v.favorite}" title="Favorit">${icon('heart', v.favorite ? 'fill' : '')}</button>
      <button type="button" class="icon-btn watch reveal hide-sm${v.watched ? ' on' : ''}" data-action="watched" aria-label="Tandai ditonton" aria-pressed="${v.watched}" title="${v.watched ? 'Tandai belum ditonton' : 'Tandai sudah ditonton'}">${icon('checkCircle')}</button>
      ${reorder ? `<button type="button" class="icon-btn reveal hide-sm" data-action="up" ${e.index === 0 ? 'disabled' : ''} aria-label="Naikkan" title="Naikkan">${icon('up')}</button>
      <button type="button" class="icon-btn reveal hide-sm" data-action="down" ${e.index === opt.lastIndex ? 'disabled' : ''} aria-label="Turunkan" title="Turunkan">${icon('down')}</button>` : ''}
      <button type="button" class="icon-btn" data-action="item-menu" aria-label="Opsi lainnya" title="Opsi lainnya">${icon('more')}</button>
    </div>
  </li>`;
}

// Ilustrasi sendiri (SVG inline) — mengikuti warna tema & aksen.
const EMPTY_ART = `<svg viewBox="0 0 240 170" width="240" height="170">
  <defs>
    <linearGradient id="ea-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:color-mix(in srgb, var(--accent) 55%, #7c5cff)"/></linearGradient>
  </defs>
  <ellipse cx="120" cy="156" rx="78" ry="8" style="fill:var(--panel-3)" class="ea-shadow"/>
  <g class="ea-float">
    <rect x="58" y="44" width="124" height="92" rx="16" style="fill:var(--panel-2);stroke:var(--border)" stroke-width="2"/>
    <rect x="70" y="56" width="100" height="56" rx="10" fill="url(#ea-g)"/>
    <path d="M113 72v24l19-12z" fill="#fff"/>
    <rect x="70" y="120" width="62" height="6" rx="3" style="fill:var(--panel-3)"/>
    <rect x="138" y="120" width="32" height="6" rx="3" style="fill:var(--panel-3)"/>
  </g>
  <g class="ea-note ea-n1"><circle cx="40" cy="62" r="7" style="fill:var(--accent)"/><path d="M46 62V36l14-4v10" style="stroke:var(--accent)" stroke-width="4" fill="none" stroke-linecap="round"/></g>
  <g class="ea-note ea-n2"><circle cx="196" cy="40" r="6" style="fill:color-mix(in srgb, var(--accent) 60%, #7c5cff)"/><path d="M201 40V20" style="stroke:color-mix(in srgb, var(--accent) 60%, #7c5cff)" stroke-width="3.5" stroke-linecap="round"/></g>
  <g class="ea-note ea-n3"><rect x="186" y="96" width="34" height="22" rx="6" style="fill:var(--panel-2);stroke:var(--border)" stroke-width="2"/><path d="M199 102v10l8-5z" style="fill:var(--muted)"/></g>
  <circle cx="30" cy="118" r="4" style="fill:var(--panel-3)" class="ea-note ea-n2"/>
  <circle cx="214" cy="70" r="3" style="fill:var(--panel-3)" class="ea-note ea-n1"/>
</svg>`;

function emptyState(opt) {
  if (opt.quick && !opt.query) {
    return `<div class="empty-icon">${icon('sort')}</div><h3>Tidak ada lagu untuk filter ini</h3><p>Coba filter lain atau tampilkan semua lagu.</p>
      <p><button type="button" class="btn" data-action="qf" data-qf="">${icon('x')}<span>Hapus filter</span></button></p>`;
  }
  if (opt.query) {
    return `<div class="empty-icon">${icon('search')}</div><h3>Tidak ada hasil</h3><p>Tidak ada video di library yang cocok dengan “${escapeHtml(opt.query)}”.</p>
      <p><button type="button" class="btn btn-primary" data-action="yt-search" data-q="${escapeHtml(opt.query)}">${icon('search')}<span>Cari “${escapeHtml(opt.query)}” di YouTube</span></button></p>`;
  }
  if (opt.view === 'favorites') {
    return `<div class="empty-icon">${icon('heart')}</div><h3>Belum ada favorit</h3><p>Klik ikon hati di sebuah video untuk menandainya.</p>`;
  }
  if (opt.view === 'unwatched') {
    return `<div class="empty-icon">${icon('checkCircle')}</div><h3>Semua sudah ditonton</h3><p>Video yang belum ditandai “ditonton” akan muncul di sini.</p>`;
  }
  if (opt.view === 'history') {
    return `<div class="empty-icon">${icon('history')}</div><h3>Belum ada riwayat</h3><p>Lagu yang kamu putar akan muncul di sini, terbaru di atas.</p>`;
  }
  return `<div class="empty-art" aria-hidden="true">${EMPTY_ART}</div>
    <h3>${opt.isPlaylist ? 'Playlist ini masih kosong' : 'Library-mu masih kosong'}</h3>
    <p>Mulai dengan menempelkan link YouTube, atau cari lagu langsung dari sini.</p>
    <div class="empty-ctas">
      <button type="button" class="btn btn-primary btn-lg" data-action="open-add">${icon('plus')}<span>Tambahkan lagu pertama</span></button>
      <button type="button" class="btn btn-lg" data-action="yt-search">${icon('search')}<span>Jelajahi YouTube</span></button>
      <button type="button" class="btn btn-lg" data-action="yt-import">${icon('download')}<span>Impor playlist dari URL</span></button>
    </div>
    <p class="muted small">Link yang dikenali: youtu.be/… · youtube.com/watch?v=… · /shorts/… · music.youtube.com/… · playlist?list=…</p>`;
}

export function renderBanner(store, sync) {
  const c = store.cloud;
  let html = '';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    html = banner('warn', 'cloudOff', 'Kamu sedang offline. Playlist tetap bisa dibuka dan diatur — perubahan disimpan di perangkat dan disinkronkan otomatis saat online. Memutar video & mencari di YouTube butuh internet.', 'banner-settings', 'Status sync');
  } else if (c.connected && sync.status === 'conflict') {
    html = banner('err', 'alert', 'Konflik data dengan cloud. Pilih versi yang mau dipakai.', 'banner-resolve', 'Selesaikan');
  } else if (c.connected && sync.status === 'locked') {
    html = banner('warn', 'lock', 'Backup terenkripsi butuh passphrase untuk sinkron.', 'banner-resolve', 'Masukkan passphrase');
  } else if (c.connected && sync.status === 'error') {
    html = banner('err', 'alert', `Sinkron gagal: ${sync.message}`, 'banner-settings', 'Lihat detail');
  } else if (!c.connected && !store.ui.bannerDismissed && Object.keys(store.data.videos).length > 0) {
    html = banner('info', 'cloud', 'Playlist-mu baru tersimpan di browser ini. Aktifkan backup otomatis ke GitHub Gist supaya tidak hilang saat cache dibersihkan atau ganti perangkat.', 'banner-settings', 'Aktifkan', true);
  }
  $('banner').innerHTML = html;
}

function banner(cls, ic, text, action, label, dismiss = false) {
  return `<div class="banner ${cls}">${icon(ic)}<p>${escapeHtml(text)}</p>
    <button type="button" class="btn sm" data-action="${action}">${label}</button>
    ${dismiss ? `<button type="button" class="icon-btn sm" data-action="banner-dismiss" aria-label="Tutup">${icon('x')}</button>` : ''}</div>`;
}

export function renderDock(player, store, opts = {}) {
  const cur = player.current;
  const dock = $('dock');
  const stage = $('stage');
  document.body.classList.toggle('has-player', !!cur);
  dock.hidden = !cur;
  stage.hidden = !cur;
  if (!cur) return;

  const v = store.data.videos[cur.youtubeId];
  const title = (v && v.title) || 'Memuat judul…';
  const thumb = $('dock-thumb');
  const src = thumbUrl(cur.youtubeId, 'mqdefault');
  if (thumb.getAttribute('src') !== src) thumb.src = src;
  $('dock-title').textContent = title;
  $('dock-title').title = title;
  $('stage-title').textContent = title;
  const sub = $('dock-sub');
  sub.textContent = player.error || (player.state === 'loading' ? 'Memuat…' : (v && v.channel) || '');
  sub.classList.toggle('error', !!player.error);

  const play = $('dock-play');
  play.innerHTML = icon(player.isPlaying ? 'pause' : 'play', 'fill');
  play.setAttribute('aria-label', player.isPlaying ? 'Jeda' : 'Putar');

  const sh = $('dock-shuffle');
  sh.innerHTML = icon('shuffle');
  sh.classList.toggle('on', player.shuffle);
  sh.setAttribute('aria-pressed', String(player.shuffle));
  sh.title = player.shuffle ? 'Acak: aktif' : 'Acak: mati';

  const rp = $('dock-repeat');
  rp.innerHTML = icon(player.repeat === 'one' ? 'repeatOne' : 'repeat');
  rp.classList.toggle('on', player.repeat !== 'off');
  rp.title = { off: 'Ulangi: mati', all: 'Ulangi: semua', one: 'Ulangi: satu video' }[player.repeat];

  const sleep = $('dock-sleep');
  const info = [];
  if (player.rate !== 1) info.push(`${player.rate}×`);
  if (opts && opts.sleepLabel) info.push(`${opts.sleepLabel}`);
  sleep.hidden = !info.length;
  sleep.textContent = info.join(' · ');

  const fav = $('dock-fav');
  fav.innerHTML = icon('heart', v && v.favorite ? 'fill' : '');
  fav.classList.toggle('on', !!(v && v.favorite));

  const large = !!store.ui.stageLarge;
  const min = !!store.ui.stageMin;
  stage.classList.toggle('large', large && !min);
  stage.classList.toggle('min', min);
  const corner = ['br', 'bl', 'tr', 'tl'].includes(store.ui.stageCorner) ? store.ui.stageCorner : 'br';
  stage.dataset.corner = corner;
  const minBtn = $('stage-min');
  minBtn.innerHTML = icon(min ? 'chevronUp' : 'minimize');
  minBtn.title = min ? 'Tampilkan video' : 'Minimize video (musik tetap jalan)';
  minBtn.setAttribute('aria-label', minBtn.title);
  minBtn.setAttribute('aria-expanded', String(!min));
  const vBtn = $('dock-video');
  if (vBtn) {
    vBtn.innerHTML = icon('video');
    vBtn.classList.toggle('on', !min);
    vBtn.title = min ? 'Tampilkan video' : 'Sembunyikan video (musik tetap jalan)';
    vBtn.setAttribute('aria-label', vBtn.title);
    vBtn.setAttribute('aria-pressed', String(!min));
  }
  const sizeIcon = icon(large ? 'shrink' : 'expand');
  $('stage-size').innerHTML = sizeIcon;
  $('stage-size').title = large ? 'Perkecil video' : 'Perbesar video';
  const lyricsOpen = !$('lyrics-panel').hidden;
  $('dock-lyrics').classList.toggle('on', lyricsOpen);
  $('dock-lyrics').setAttribute('aria-pressed', String(lyricsOpen));
  $('lv-title').textContent = title;
  $('lv-sub').textContent = (v && v.channel) || '';
  const lvThumb = $('lv-thumb');
  const lvSrc = thumbUrl(cur.youtubeId, 'mqdefault');
  if (lvThumb.getAttribute('src') !== lvSrc) lvThumb.src = lvSrc;

  const err = $('stage-error');
  if (player.error) {
    err.hidden = false;
    err.innerHTML = `${icon('alert')}<p>${escapeHtml(player.error)}</p>
      <a class="btn sm" href="${watchUrl(cur.youtubeId)}" target="_blank" rel="noopener">${icon('external')}Buka di YouTube</a>`;
  } else {
    err.hidden = true;
  }
}

export function renderProgress(time, duration) {
  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  $('dock-bar').style.width = `${pct}%`;
  $('dock-time').textContent = duration > 0 ? `${formatDuration(time) || '0:00'} / ${formatDuration(duration)}` : '';
}

export function renderQueue(player, store) {
  renderUpNext(player, store);
  const panel = $('queue-panel');
  if (panel.hidden) return;
  const box = $('queue-list');
  const cur = player.current;
  const upcoming = cur ? player.upcoming() : [];
  $('queue-clear').hidden = upcoming.length < 2;
  if (!cur) {
    box.innerHTML = '<p class="muted pad">Antrean kosong. Putar video atau playlist untuk mengisinya.</p>';
    return;
  }
  const qrow = (item, pos, now) => {
    const v = store.data.videos[item.youtubeId];
    return `<div class="q-row${now ? ' now' : ''}" data-pos="${pos}">
      ${now ? '' : `<span class="q-grip" title="Geser untuk mengubah urutan" aria-hidden="true">${icon('grip')}</span>`}
      <button type="button" class="q-main" data-action="queue-jump" data-pos="${pos}">
        <img src="${thumbUrl(item.youtubeId, 'default')}" alt="" loading="lazy">
        <span class="q-text"><span class="q-title">${escapeHtml((v && v.title) || 'Judul belum tersedia')}</span>${v && v.channel ? `<span class="q-sub">${escapeHtml(v.channel)}</span>` : ''}</span>
      </button>
      ${now ? '' : `<button type="button" class="icon-btn sm" data-action="queue-remove" data-pos="${pos}" aria-label="Hapus dari antrean">${icon('x')}</button>`}
    </div>`;
  };
  // Pertahankan posisi gulir saat antrean di-render ulang.
  const scroll = box.scrollTop;
  box.innerHTML = `
    <p class="q-label">Sedang diputar</p>${qrow(cur, player.pos, true)}
    <p class="q-label">Berikutnya${upcoming.length ? ` · ${upcoming.length}` : ''}</p>
    <div class="q-upcoming">${upcoming.length
      ? upcoming.slice(0, 300).map((u) => qrow(u.item, u.pos, false)).join('')
      : `<p class="muted pad">${player.repeat === 'all' ? 'Antrean akan diulang dari awal.' : 'Tidak ada video berikutnya.'}</p>`}</div>`;
  box.scrollTop = scroll;
}

/** "Berikutnya: …" di dock (desktop) + 3 lagu berikutnya di layar Sedang diputar (HP). */
export function renderUpNext(player, store) {
  const cur = player.current;
  const up = cur ? player.upcoming() : [];
  const title = (id) => { const v = store.data.videos[id]; return (v && v.title) || 'Judul belum tersedia'; };
  const nx = $('dock-next');
  if (nx) {
    nx.hidden = !up.length;
    if (up.length) {
      const t = title(up[0].item.youtubeId);
      nx.innerHTML = `<span class="muted">Berikutnya:</span> ${escapeHtml(t)}`;
      nx.title = `Berikutnya: ${t} — klik untuk melihat antrean`;
    }
  }
  const box = $('np-upnext');
  if (!box) return;
  if (!up.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="np-upnext-head"><b>Berikutnya</b><button type="button" class="link-btn small" data-action="queue-toggle">Lihat semua (${up.length})</button></div>
    ${up.slice(0, 3).map((u) => {
      const v = store.data.videos[u.item.youtubeId];
      return `<div class="q-row" data-pos="${u.pos}">
        <button type="button" class="q-main" data-action="queue-jump" data-pos="${u.pos}">
          <img src="${thumbUrl(u.item.youtubeId, 'default')}" alt="" loading="lazy">
          <span class="q-text"><span class="q-title">${escapeHtml(title(u.item.youtubeId))}</span>${v && v.channel ? `<span class="q-sub">${escapeHtml(v.channel)}</span>` : ''}</span>
        </button>
        <button type="button" class="icon-btn sm" data-action="queue-remove" data-pos="${u.pos}" aria-label="Hapus dari antrean">${icon('x')}</button>
      </div>`;
    }).join('')}`;
}

/** Baris chip filter cepat di atas daftar. */
export function renderQuickFilters(all, { active, view, filters, tags }) {
  const box = $('quick-filters');
  if (!box) return;
  if (all.length < 3) { box.hidden = true; box.innerHTML = ''; return; }
  const count = (test) => all.reduce((n, e) => n + (test(e.video) ? 1 : 0), 0);
  const chips = filters
    .filter((f) => !(f.hideOn || []).includes(view))
    .map((f) => ({ id: f.id, label: f.label, n: count(f.test) }))
    .filter((c) => c.n > 0 && c.n < all.length || c.id === active);
  const tagChips = tags.map((t) => ({ id: `tag:${t.key}`, label: `#${t.name}`, n: t.n }));
  if (!chips.length && !tagChips.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const chip = (c) => `<button type="button" class="chip" data-action="qf" data-qf="${escapeHtml(c.id)}" aria-pressed="${c.id === active}">${escapeHtml(c.label)} <span class="count">${c.n}</span></button>`;
  box.innerHTML = `<button type="button" class="chip" data-action="qf" data-qf="" aria-pressed="${!active}">Semua <span class="count">${all.length}</span></button>
    ${chips.map(chip).join('')}${tagChips.map(chip).join('')}`;
}
