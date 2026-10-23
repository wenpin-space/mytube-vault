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
}

function navItem(view, label, ic, count, active) {
  return `<button type="button" class="nav-item${active ? ' active' : ''}" data-action="view" data-view="${escapeHtml(view)}"${active ? ' aria-current="page"' : ''}>
    ${icon(ic)}<span class="nav-label">${escapeHtml(label)}</span><span class="nav-count">${count}</span></button>`;
}

export function renderViewHead(store, info) {
  const pl = store.currentPlaylist();
  const title = pl ? pl.name : VIEW_TITLES[store.ui.view];
  const countText = info.query ? `${info.visible} dari ${info.total} video` : `${info.total} video`;
  const dur = formatTotal(info.duration);
  const options = SORT_MODES.map(([k, l]) => {
    const label = !pl && k === 'manual' ? (store.ui.view === 'history' ? 'Terakhir diputar' : 'Urutan ditambahkan') : l;
    return `<option value="${k}"${k === info.sort ? ' selected' : ''}>${label}</option>`;
  }).join('');
  $('view-head').innerHTML = `
    <div class="vh-text">
      <p class="eyebrow">${pl ? 'Playlist' : 'Koleksi otomatis'}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${countText}${dur ? ` · ±${dur}` : ''}</p>
    </div>
    <div class="vh-actions">
      <button type="button" class="btn btn-primary" data-action="play-all" ${info.visible ? '' : 'disabled'}>${icon('play', 'fill')}<span>Putar</span></button>
      <button type="button" class="btn" data-action="shuffle-all" ${info.visible ? '' : 'disabled'}>${icon('shuffle')}<span>Acak</span></button>
      ${pl ? `<button type="button" class="btn add-song" data-action="open-add" title="Tambah lagu">${icon('plus')}<span>Tambah lagu</span></button>` : ''}
      <label class="select-wrap" title="Urutkan">${icon('sort')}<select data-action="sort" aria-label="Urutkan">${options}</select></label>
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
  const ql = q.toLocaleLowerCase('id');
  const at = lower.indexOf(ql);
  if (at < 0) return safe;
  return `${escapeHtml(text.slice(0, at))}<mark>${escapeHtml(text.slice(at, at + q.length))}</mark>${escapeHtml(text.slice(at + q.length))}`;
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
  const sub = opt.view === 'history' && v.lastPlayedAt ? `diputar ${timeAgo(v.lastPlayedAt)}${v.playCount > 1 ? ` · ${v.playCount}×` : ''}` : timeAgo(e.addedAt);
  return `<li class="vrow${playing ? ' playing' : ''}${v.watched ? ' watched' : ''}${picked ? ' selected' : ''}${fresh ? ' flash' : ''}" data-key="${escapeHtml(e.key)}"${reorder ? ' draggable="true"' : ''}${sel ? ` aria-selected="${picked}"` : ''}>
    ${sel ? `<span class="pick" data-action="select-toggle" role="checkbox" aria-checked="${picked}" aria-label="Pilih">${icon(picked ? 'checkCircle' : 'circle')}</span>` : ''}
    ${reorder ? `<span class="grip" title="Geser untuk mengubah urutan">${icon('grip')}</span>` : ''}
    <span class="idx">${playing ? icon('volume') : i + 1}</span>
    <button type="button" class="thumb" data-action="play" aria-label="Putar ${escapeHtml(v.title || '')}">
      <img src="${thumbUrl(v.youtubeId)}" alt="" loading="lazy" decoding="async" draggable="false">
      ${v.duration ? `<span class="dur">${formatDuration(v.duration)}</span>` : ''}
      <span class="thumb-overlay">${icon(playing && opt.isPlaying ? 'pause' : 'play', 'fill')}</span>
    </button>
    <div class="meta" data-action="play">
      <div class="title${v.title ? '' : ' untitled'}" title="${escapeHtml(v.title || '')}">${highlight(title, opt.query)}</div>
      <div class="sub">${v.channel ? `<span>${highlight(v.channel, opt.query)}</span>` : ''}<span>${sub}</span>${v.watched ? '<span class="tag">ditonton</span>' : ''}</div>
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

function emptyState(opt) {
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
  return `<div class="empty-icon">${icon('link')}</div><h3>${opt.isPlaylist ? 'Playlist ini masih kosong' : 'Belum ada video'}</h3>
    <p>Tempel link YouTube, cari lagu di YouTube, atau pilih dari library lewat tombol <b>Tambah</b>.</p>
    ${opt.isPlaylist ? `<p><button type="button" class="btn btn-primary" data-action="open-add">${icon('plus')}<span>Tambah lagu</span></button></p>` : ''}
    <p class="muted small">Contoh: https://youtu.be/… · youtube.com/watch?v=… · /shorts/… · music.youtube.com/…</p>`;
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
  stage.classList.toggle('large', large);
  const sizeIcon = icon(large ? 'shrink' : 'expand');
  $('dock-stage').innerHTML = sizeIcon;
  $('stage-size').innerHTML = sizeIcon;
  $('dock-stage').title = large ? 'Perkecil video' : 'Perbesar video';

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
  const panel = $('queue-panel');
  if (panel.hidden) return;
  const box = $('queue-list');
  const cur = player.current;
  if (!cur) {
    box.innerHTML = '<p class="muted pad">Antrean kosong. Putar video atau playlist untuk mengisinya.</p>';
    return;
  }
  const qrow = (item, pos, now) => {
    const v = store.data.videos[item.youtubeId];
    return `<div class="q-row${now ? ' now' : ''}">
      <button type="button" class="q-main" data-action="queue-jump" data-pos="${pos}">
        <img src="${thumbUrl(item.youtubeId, 'default')}" alt="" loading="lazy">
        <span class="q-title">${escapeHtml((v && v.title) || 'Judul belum tersedia')}</span>
      </button>
      ${now ? '' : `<button type="button" class="icon-btn sm" data-action="queue-remove" data-pos="${pos}" aria-label="Hapus dari antrean">${icon('x')}</button>`}
    </div>`;
  };
  const upcoming = player.upcoming();
  box.innerHTML = `
    <p class="q-label">Sedang diputar</p>${qrow(cur, player.pos, true)}
    <p class="q-label">Berikutnya${upcoming.length ? ` · ${upcoming.length}` : ''}</p>
    ${upcoming.length
      ? upcoming.slice(0, 300).map((u) => qrow(u.item, u.pos, false)).join('')
      : `<p class="muted pad">${player.repeat === 'all' ? 'Antrean akan diulang dari awal.' : 'Tidak ada video berikutnya.'}</p>`}`;
}
