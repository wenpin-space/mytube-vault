// Titik masuk: menghubungkan store, sync, player, dan UI.

import { store, normalizeData } from './store.js';
import { sync } from './sync.js';
import { Player } from './player.js';
import { extractYouTubeId, parseMany } from './parser.js';
import { createMetaQueue, watchUrl } from './metadata.js';
import { openEnvelope, summarize } from './envelope.js';
import {
  toast, modal, confirmDialog, promptDialog, passphraseDialog, conflictDialog, pickPlaylistDialog, openMenu,
} from './dialogs.js';
import { openSettings } from './settings.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { sortEntries, filterEntries, copyText, downloadText, escapeHtml, slugify, formatDuration } from './utils.js';
import {
  isPhone, overlay, enableTouchReorder, setupPwa, promptInstall, isStandalone, takeLaunchParams,
} from './mobile.js';
import { libraryPicker, ytSearchDialog, youtubeAppUrl } from './sources.js';

const PAGE = 200;
const $ = (id) => document.getElementById(id);
const player = new Player('yt-player');
const local = {
  query: '', limit: PAGE, multi: false, lastView: null,
  selecting: false, selected: new Set(), // mode pilih banyak
  flash: new Set(),                      // video yang baru ditambahkan (disorot sebentar)
  sleep: { timer: null, endAt: 0, endOfTrack: false },
  playedTrack: null,                     // untuk mencatat riwayat sekali per lagu
};

const metaQueue = createMetaQueue((id, meta) => {
  const v = store.data.videos[id];
  if (!v) return;
  if (meta && !v.title) store.updateVideo(id, { title: meta.title, channel: v.channel || meta.channel });
  else renderMain();
});

// ---------- helper view ----------
function currentSort() {
  const v = store.ui.view;
  return store.ui.sort[v] || (v.startsWith('pl:') || v === 'history' ? 'manual' : 'addedNewest');
}
function canReorder() {
  return store.ui.view.startsWith('pl:') && currentSort() === 'manual' && !local.query.trim();
}
function visibleEntries() {
  return sortEntries(filterEntries(store.viewEntries(), local.query), currentSort());
}
function entryByKey(key) {
  return store.viewEntries().find((e) => e.key === key) || null;
}
function applyTheme() {
  const t = store.ui.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ---------- render ----------
function render() {
  applyTheme();
  if (store.ui.view !== local.lastView) local.limit = PAGE;
  ui.renderSidebar(store);
  renderAddTarget();
  renderMain();
  ui.renderBanner(store, sync);
  ui.renderSyncBadge(sync, store);
  ui.renderDock(player, store, dockOpts());
  ui.renderQueue(player, store);
  renderBottomNav();
  renderSelectBar();
  local.lastView = store.ui.view;
}

function dockOpts() {
  const s = local.sleep;
  let sleepLabel = '';
  if (s.endOfTrack) sleepLabel = '⏾ akhir lagu';
  else if (s.endAt) sleepLabel = `⏾ ${Math.max(1, Math.ceil((s.endAt - Date.now()) / 60000))} mnt`;
  return { sleepLabel };
}

function renderBottomNav() {
  const v = store.ui.view;
  const active = {
    library: !v.startsWith('pl:') && !overlay.isOpen('sidebar'),
    playlists: v.startsWith('pl:') || overlay.isOpen('sidebar'),
    queue: !$('queue-panel').hidden,
  };
  document.querySelectorAll('#bottom-nav [data-nav]').forEach((b) => {
    const on = !!active[b.dataset.nav];
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function renderMain() {
  const all = store.viewEntries();
  const sort = currentSort();
  const visible = sortEntries(filterEntries(all, local.query), sort);
  const duration = all.reduce((s, e) => s + (e.video.duration || 0), 0);
  const pl = store.currentPlaylist();
  ui.renderViewHead(store, { sort, total: all.length, visible: visible.length, query: local.query, duration });

  const hint = $('list-hint');
  if (pl && sort !== 'manual' && all.length > 1) {
    hint.hidden = false;
    hint.innerHTML = `${icon('sort')}<span>Urutan otomatis aktif (tampilan saja — urutan asli tidak berubah).</span>
      <button type="button" class="link-btn" data-action="sort-manual">Kembali ke urutan manual</button>`;
  } else {
    hint.hidden = true;
  }

  ui.renderList(visible, {
    canReorder: canReorder(),
    playingId: player.current ? player.current.youtubeId : null,
    isPlaying: player.isPlaying,
    limit: local.limit,
    page: PAGE,
    metaPending: (id) => metaQueue.has(id),
    lastIndex: pl ? pl.items.length - 1 : -1,
    query: local.query.trim(),
    view: store.ui.view,
    isPlaylist: !!pl,
    selecting: local.selecting,
    selected: local.selected,
    flashKeys: local.flash,
  });
  $('search-clear').hidden = !local.query;
  observeMore();
}

// ---------- muat otomatis saat menggulir (ganti tombol "Tampilkan lagi") ----------
let moreObserver = null;
function observeMore() {
  const btn = document.querySelector('#list-more [data-action=more]');
  if (!('IntersectionObserver' in window)) return;
  if (!moreObserver) {
    moreObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && document.querySelector('#list-more [data-action=more]')) {
        local.limit += PAGE;
        renderMain();
      }
    }, { rootMargin: '600px 0px' });
  }
  moreObserver.disconnect();
  if (btn) moreObserver.observe(btn);
}

function renderAddTarget() {
  const sel = $('add-target');
  const pls = store.data.playlists;
  const cur = store.currentPlaylist();
  let value = sel.value;
  if (store.ui.view !== local.lastView && cur) value = cur.id;
  if (!pls.some((p) => p.id === value)) value = cur ? cur.id : pls[0].id;
  sel.innerHTML = pls.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  sel.value = value;
}

// ---------- tambah video ----------
function feedback(msg, type = '') {
  const el = $('add-feedback');
  el.textContent = msg;
  el.className = `add-feedback ${type}`;
}

function setMulti(on) {
  local.multi = on;
  $('add-input').hidden = on;
  $('add-multi').hidden = !on;
  $('add-form').classList.toggle('multi', on);
  $('toggle-multi').textContent = on ? 'Tempel satu link' : 'Tempel banyak link sekaligus';
  feedback('');
  (on ? $('add-multi') : $('add-input')).focus();
}

function handleAdd(e) {
  e.preventDefault();
  const target = $('add-target').value;
  let ids = [];
  let invalid = 0;
  let dup = 0;
  if (local.multi) {
    const r = parseMany($('add-multi').value);
    ids = r.valid;
    invalid = r.invalid.length;
    dup = r.duplicates;
    if (!ids.length) {
      feedback(invalid ? `Tidak ada link valid (${invalid} link tidak valid).` : 'Belum ada link YouTube.', 'error');
      return;
    }
  } else {
    const raw = $('add-input').value.trim();
    if (!raw) { $('add-input').focus(); return; }
    const id = extractYouTubeId(raw, { allowBareId: true });
    if (!id) {
      feedback('Link tidak valid. Pastikan itu link video YouTube (bukan playlist/channel).', 'error');
      $('add-form').classList.remove('shake');
      void $('add-form').offsetWidth;
      $('add-form').classList.add('shake');
      return;
    }
    ids = [id];
  }

  const res = store.addVideos(ids, target);
  metaQueue.add(ids.filter((id) => store.data.videos[id] && !store.data.videos[id].title));
  if (res.added) flashVideos(ids);
  renderMain();

  const plName = (store.getPlaylist(target) || {}).name || '';
  const parts = [];
  if (res.added) parts.push(`${res.added} video ditambahkan ke “${plName}”`);
  if (res.skipped) parts.push(`${res.skipped} sudah ada`);
  if (invalid) parts.push(`${invalid} link tidak valid`);
  if (dup) parts.push(`${dup} duplikat dilewati`);
  const msg = parts.join(' · ') || 'Tidak ada yang ditambahkan.';
  feedback(msg, res.added ? 'ok' : '');
  if (res.added) toast(msg, 'success');
  if (res.added && overlay.isOpen('add')) overlay.close('add');

  if (local.multi) { $('add-multi').value = ''; if (res.added) setMulti(false); } else $('add-input').value = '';
}

/** Sorot video yang baru ditambahkan dan gulir ke sana (kalau tampil di view ini). */
function flashVideos(ids) {
  ids.forEach((id) => local.flash.add(id));
  setTimeout(() => {
    const keys = new Set(ids);
    const row = [...document.querySelectorAll('.vrow.flash')].find((r) => {
      const e = entryByKey(r.dataset.key);
      return e && keys.has(e.youtubeId);
    });
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
  setTimeout(() => { ids.forEach((id) => local.flash.delete(id)); }, 2500);
}

// ---------- pemutaran ----------
function playFromEntry(entry) {
  if (player.current && player.current.youtubeId === entry.youtubeId && player.state !== 'error') {
    player.toggle();
    return;
  }
  const entries = visibleEntries();
  const idx = entries.findIndex((e) => e.key === entry.key);
  rememberQueueSource(entries.length > 0);
  player.playList(entries.length ? entries : [entry], Math.max(0, idx));
}

/** Antrean dibuat dari view ini → saat isinya berubah (lagu baru ditambah/dihapus), antrean ikut disesuaikan. */
function rememberQueueSource(on = true) {
  local.queueSource = on ? { view: store.ui.view, sort: currentSort(), query: local.query } : null;
}
function syncQueueWithSource() {
  const src = local.queueSource;
  if (!src || !player.current) return;
  const view = src.view;
  if (view.startsWith('pl:') && !store.getPlaylist(view.slice(3))) { local.queueSource = null; return; }
  const entries = sortEntries(filterEntries(store.viewEntries(view), src.query), src.sort);
  player.syncQueue(entries);
}

function playVisible(shuffleAll) {
  const entries = visibleEntries();
  if (!entries.length) return;
  if (shuffleAll) store.setPlayerSetting('shuffle', true);
  const start = shuffleAll ? Math.floor(Math.random() * entries.length) : 0;
  rememberQueueSource();
  player.playList(entries, start);
}

// ---------- aksi item ----------
async function resolvePick(id) {
  if (id !== '__new__') return id;
  const name = await promptDialog('Playlist baru', { label: 'Nama playlist', placeholder: 'mis. Musik fokus', ok: 'Buat' });
  if (!name) return null;
  return store.createPlaylist(name, { switchView: false }).id;
}

async function addToOther(entry) {
  const target = await resolvePick(await pickPlaylistDialog(store.data.playlists, { title: 'Tambah ke playlist', excludeId: entry.playlistId }));
  if (!target) return;
  const r = store.addVideos([entry.youtubeId], target);
  const name = store.getPlaylist(target).name;
  toast(r.added ? `Ditambahkan ke “${name}”.` : `Sudah ada di “${name}”.`, r.added ? 'success' : 'info');
}

async function moveToOther(entry) {
  const target = await resolvePick(await pickPlaylistDialog(store.data.playlists, { title: 'Pindahkan ke playlist', excludeId: entry.playlistId }));
  if (!target) return;
  if (store.moveToPlaylist(entry.playlistId, entry.itemId, target)) {
    toast(`Dipindahkan ke “${store.getPlaylist(target).name}”.`, 'success');
  }
}

function removeEntry(entry) {
  const pl = store.getPlaylist(entry.playlistId);
  if (!pl) return;
  const item = pl.items[entry.index];
  store.removeItem(pl.id, entry.itemId);
  toast(`Dihapus dari “${pl.name}”.`, 'info', 6000, { label: 'Urungkan', fn: () => store.restoreItem(pl.id, item, entry.index) });
}

function openItemMenu(anchor, entry) {
  const v = entry.video;
  const inPl = !!entry.playlistId;
  const reorder = canReorder();
  const pl = inPl ? store.getPlaylist(entry.playlistId) : null;
  openMenu(anchor, [
    { label: 'Putar', icon: 'play', action: () => playFromEntry(entry) },
    { label: 'Pilih beberapa…', icon: 'checks', action: () => startSelect(entry.key) },
    { label: 'Putar berikutnya', icon: 'next', action: () => { player.playNext(entry); toast('Akan diputar berikutnya.'); } },
    { label: 'Tambah ke antrean', icon: 'queue', action: () => { player.addToQueue(entry); toast('Ditambahkan ke antrean.'); } },
    'sep',
    { label: v.favorite ? 'Hapus dari favorit' : 'Tambah ke favorit', icon: 'heart', action: () => store.toggleFavorite(v.youtubeId) },
    { label: v.watched ? 'Tandai belum ditonton' : 'Tandai sudah ditonton', icon: 'checkCircle', action: () => store.toggleWatched(v.youtubeId) },
    {
      label: 'Ubah judul', icon: 'edit',
      action: async () => {
        const t = await promptDialog('Ubah judul', { label: 'Judul', value: v.title || '' });
        if (t) store.updateVideo(v.youtubeId, { title: t });
      },
    },
    !v.title && { label: 'Ambil ulang judul', icon: 'refresh', action: () => { metaQueue.add([v.youtubeId]); renderMain(); } },
    'sep',
    { label: 'Tambah ke playlist lain…', icon: 'plus', action: () => addToOther(entry) },
    inPl && { label: 'Pindahkan ke playlist…', icon: 'arrowRight', action: () => moveToOther(entry) },
    reorder && entry.index > 0 && { label: 'Naikkan', icon: 'up', action: () => store.moveItem(pl.id, entry.index, entry.index - 1) },
    reorder && entry.index < pl.items.length - 1 && { label: 'Turunkan', icon: 'down', action: () => store.moveItem(pl.id, entry.index, entry.index + 1) },
    reorder && entry.index > 0 && { label: 'Pindah ke paling atas', icon: 'top', action: () => store.moveItem(pl.id, entry.index, 0) },
    'sep',
    { label: 'Buka di YouTube', icon: 'external', action: () => window.open(watchUrl(v.youtubeId), '_blank', 'noopener') },
    { label: 'Salin link', icon: 'copy', action: async () => toast((await copyText(watchUrl(v.youtubeId))) ? 'Link disalin.' : 'Gagal menyalin.') },
    'sep',
    inPl
      ? { label: 'Hapus dari playlist', icon: 'trash', danger: true, action: () => removeEntry(entry) }
      : {
        label: 'Hapus dari library', icon: 'trash', danger: true,
        action: async () => {
          if (await confirmDialog('Hapus dari library?', `“${v.title || v.youtubeId}” akan dihapus dari library dan dari semua playlist.`, { ok: 'Hapus', danger: true })) {
            store.deleteVideo(v.youtubeId);
          }
        },
      },
  ]);
}

/** Serahkan daftar putar ke aplikasi YouTube (Premium: tetap jalan di latar belakang). */
function playInYouTubeApp(ids) {
  if (!ids.length) { toast('Tidak ada video untuk diputar.'); return; }
  if (player.isPlaying) player.toggle(); // hindari dua suara sekaligus
  const url = youtubeAppUrl(ids);
  if (ids.length > 50) toast('YouTube hanya menerima 50 video pertama.', 'info', 5000);
  if (url.startsWith('intent:')) location.href = url;
  else window.open(url, '_blank', 'noopener');
}

function currentQueueIds() {
  if (!player.current) return visibleEntries().map((e) => e.youtubeId);
  const ord = player.order.slice(player.pos).concat(player.repeat === 'all' ? player.order.slice(0, player.pos) : []);
  return ord.map((i) => player.queue[i].youtubeId);
}

function addTarget() {
  const pl = store.currentPlaylist();
  return (pl && pl.id) || $('add-target').value;
}

function openPlaylistMenu(anchor) {
  const pl = store.currentPlaylist();
  const viewIds = () => visibleEntries().map((e) => e.youtubeId);
  if (!pl) {
    openMenu(anchor, [
      { label: 'Putar di aplikasi YouTube', icon: 'external', disabled: !viewIds().length, action: () => playInYouTubeApp(viewIds()) },
      { label: 'Pilih beberapa…', icon: 'checks', disabled: !viewIds().length, action: () => startSelect() },
      store.ui.view === 'history' && {
        label: 'Hapus riwayat', icon: 'trash', danger: true, disabled: !viewIds().length,
        action: async () => {
          if (await confirmDialog('Hapus riwayat?', 'Daftar lagu yang pernah diputar dan jumlah putarnya dikosongkan. Video tetap ada di library.', { ok: 'Hapus', danger: true })) store.clearHistory();
        },
      },
      {
        label: 'Salin semua link', icon: 'copy', disabled: !viewIds().length,
        action: async () => toast((await copyText(viewIds().map(watchUrl).join('\n'))) ? 'Link disalin.' : 'Gagal menyalin.'),
      },
    ]);
    return;
  }
  const links = () => pl.items.map((i) => watchUrl(i.youtubeId)).join('\n');
  openMenu(anchor, [
    { label: 'Tambah lagu (link)', icon: 'link', action: () => openAddSheet(true) },
    { label: 'Cari lagu di YouTube', icon: 'search', action: () => ytSearchDialog(store, { targetId: pl.id }) },
    { label: 'Tambah dari library', icon: 'grid', action: () => libraryPicker(store, pl.id) },
    'sep',
    { label: 'Putar di aplikasi YouTube', icon: 'external', disabled: !pl.items.length, action: () => playInYouTubeApp(viewIds()) },
    { label: 'Pilih beberapa…', icon: 'checks', disabled: !pl.items.length, action: () => startSelect() },
    'sep',
    { label: 'Duplikat playlist', icon: 'copyPlus', action: () => { const c = store.duplicatePlaylist(pl.id); if (c) toast(`Dibuat “${c.name}”.`, 'success'); } },
    store.data.playlists.indexOf(pl) > 0 && { label: 'Naikkan di daftar playlist', icon: 'up', action: () => store.movePlaylist(pl.id, -1) },
    store.data.playlists.indexOf(pl) < store.data.playlists.length - 1 && { label: 'Turunkan di daftar playlist', icon: 'down', action: () => store.movePlaylist(pl.id, 1) },
    'sep',
    {
      label: 'Ganti nama', icon: 'edit',
      action: async () => {
        const n = await promptDialog('Ganti nama playlist', { label: 'Nama', value: pl.name });
        if (n) store.renamePlaylist(pl.id, n);
      },
    },
    {
      label: 'Salin semua link', icon: 'copy', disabled: !pl.items.length,
      action: async () => {
        const ok = await copyText(links());
        toast(ok ? `${pl.items.length} link disalin — bisa ditempel ke tempat lain.` : 'Gagal menyalin.', ok ? 'success' : 'error');
      },
    },
    {
      label: 'Download daftar link (.txt)', icon: 'download', disabled: !pl.items.length,
      action: () => downloadText(`${slugify(pl.name)}.txt`, `${links()}\n`, 'text/plain'),
    },
    'sep',
    {
      label: 'Kosongkan playlist', icon: 'trash', danger: true, disabled: !pl.items.length,
      action: async () => {
        if (await confirmDialog('Kosongkan playlist?', `Semua ${pl.items.length} video dikeluarkan dari “${pl.name}”. Video tetap ada di “Semua video”.`, { ok: 'Kosongkan', danger: true })) {
          store.clearPlaylist(pl.id);
        }
      },
    },
    {
      label: 'Hapus playlist', icon: 'trash', danger: true,
      action: async () => {
        if (await confirmDialog('Hapus playlist?', `Playlist “${pl.name}” akan dihapus. Video di dalamnya tetap ada di “Semua video”.`, { ok: 'Hapus', danger: true })) {
          store.deletePlaylist(pl.id);
          toast('Playlist dihapus.');
        }
      },
    },
  ]);
}

// ---------- pilih banyak video ----------
function startSelect(firstKey) {
  if (!local.selecting) {
    local.selecting = true;
    local.selected.clear();
    overlay.open('select', () => { local.selecting = false; local.selected.clear(); renderMain(); renderSelectBar(); });
  }
  if (firstKey) local.selected.add(firstKey);
  if (navigator.vibrate) navigator.vibrate(15);
  renderMain();
  renderSelectBar();
}
function endSelect() {
  if (overlay.isOpen('select')) overlay.close('select');
  else { local.selecting = false; local.selected.clear(); renderMain(); renderSelectBar(); }
}
function toggleSelected(key) {
  if (local.selected.has(key)) local.selected.delete(key); else local.selected.add(key);
  renderMain();
  renderSelectBar();
}
function selectedEntries() {
  return visibleEntries().filter((e) => local.selected.has(e.key));
}

function renderSelectBar() {
  const bar = $('select-bar');
  document.body.classList.toggle('selecting', local.selecting);
  bar.hidden = !local.selecting;
  if (!local.selecting) return;
  const n = local.selected.size;
  const total = visibleEntries().length;
  const inPl = !!store.currentPlaylist();
  const ents = selectedEntries();
  const allFav = ents.length && ents.every((e) => e.video.favorite);
  const b = (act, ic, label, extra = '') => `<button type="button" class="sel-btn" data-action="${act}" ${n ? '' : 'disabled'} ${extra}>${icon(ic)}<span>${label}</span></button>`;
  bar.innerHTML = `
    <div class="sel-head">
      <button type="button" class="icon-btn" data-action="sel-cancel" aria-label="Batal pilih">${icon('x')}</button>
      <b>${n} dipilih</b>
      <button type="button" class="link-btn" data-action="sel-all">${n === total && total ? 'Batal semua' : 'Pilih semua'}</button>
    </div>
    <div class="sel-actions">
      ${b('sel-play', 'play', 'Putar')}
      ${b('sel-queue', 'queue', 'Antrean')}
      ${b('sel-add', 'plus', 'Playlist')}
      ${inPl ? b('sel-move', 'arrowRight', 'Pindah') : ''}
      ${b('sel-fav', 'heart', allFav ? 'Batal favorit' : 'Favorit')}
      ${b('sel-delete', 'trash', inPl ? 'Hapus' : 'Hapus', 'data-danger')}
    </div>`;
}

async function selectionAction(act) {
  const ents = selectedEntries();
  const ids = [...new Set(ents.map((e) => e.youtubeId))];
  if (!ents.length && act !== 'sel-all') return;
  const pl = store.currentPlaylist();
  switch (act) {
    case 'sel-all': {
      const all = visibleEntries();
      if (local.selected.size === all.length) local.selected.clear(); else all.forEach((e) => local.selected.add(e.key));
      renderMain(); renderSelectBar();
      return;
    }
    case 'sel-play': rememberQueueSource(false); player.playList(ents, 0); break;
    case 'sel-queue': ents.forEach((e) => player.addToQueue(e)); toast(`${ents.length} video ditambahkan ke antrean.`, 'success'); break;
    case 'sel-add': {
      const target = await resolvePick(await pickPlaylistDialog(store.data.playlists, { title: `Tambah ${ids.length} video ke playlist` }));
      if (!target) return;
      const r = store.addVideos(ids, target);
      toast(`${r.added} ditambahkan ke “${store.getPlaylist(target).name}”${r.skipped ? ` · ${r.skipped} sudah ada` : ''}.`, 'success');
      break;
    }
    case 'sel-move': {
      if (!pl) return;
      const target = await resolvePick(await pickPlaylistDialog(store.data.playlists, { title: `Pindahkan ${ents.length} video`, excludeId: pl.id }));
      if (!target) return;
      const n = store.moveItemsToPlaylist(pl.id, ents.map((e) => e.itemId), target);
      toast(`${n} video dipindahkan ke “${store.getPlaylist(target).name}”.`, 'success');
      break;
    }
    case 'sel-fav': {
      const value = !ents.every((e) => e.video.favorite);
      store.setFavoriteMany(ids, value);
      toast(value ? `${ids.length} video ditandai favorit.` : `${ids.length} video dihapus dari favorit.`, 'success');
      break;
    }
    case 'sel-delete': {
      if (pl) {
        const removed = store.removeItems(pl.id, ents.map((e) => e.itemId));
        toast(`${removed.length} video dihapus dari “${pl.name}”.`, 'info', 7000, { label: 'Urungkan', fn: () => store.restoreItems(pl.id, removed) });
      } else if (await confirmDialog(`Hapus ${ids.length} video dari library?`, 'Video dihapus dari library dan dari semua playlist. Salinan data sebelum dihapus disimpan sebagai snapshot (Setelan → Backup).', { ok: 'Hapus', danger: true })) {
        store.snapshot();
        store.deleteVideos(ids);
      } else return;
      break;
    }
    default: return;
  }
  endSelect();
}

// Tekan lama sebuah video (HP) → masuk mode pilih.
(() => {
  const list = $('video-list');
  let t = null;
  let startXY = null;
  list.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || local.selecting || e.target.closest('.grip, .row-actions')) return;
    const row = e.target.closest('.vrow');
    if (!row) return;
    startXY = [e.clientX, e.clientY];
    t = setTimeout(() => { t = null; list.dataset.longpress = '1'; startSelect(row.dataset.key); }, 520);
  });
  const cancel = () => { clearTimeout(t); t = null; };
  list.addEventListener('pointermove', (e) => { if (t && startXY && Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 10) cancel(); });
  list.addEventListener('pointerup', cancel);
  list.addEventListener('pointercancel', cancel);
  list.addEventListener('contextmenu', (e) => { if (list.dataset.longpress) e.preventDefault(); });
  // Klik yang menyusul tekan-lama jangan sampai memutar video.
  list.addEventListener('click', (e) => {
    if (list.dataset.longpress) { delete list.dataset.longpress; e.stopPropagation(); e.preventDefault(); }
  }, true);
})();

// ---------- timer tidur & kecepatan ----------
function setSleep(minutes) {
  const s = local.sleep;
  clearTimeout(s.timer);
  s.timer = null; s.endAt = 0; s.endOfTrack = false;
  player.stopAfterCurrent = false;
  if (minutes === 'track') {
    s.endOfTrack = true;
    player.stopAfterCurrent = true;
    toast('Musik berhenti setelah lagu ini selesai.', 'success');
  } else if (minutes > 0) {
    s.endAt = Date.now() + minutes * 60000;
    s.timer = setTimeout(() => {
      s.timer = null; s.endAt = 0;
      player.pause();
      toast('Timer tidur: musik dijeda. Selamat istirahat 🌙', 'info', 6000);
      ui.renderDock(player, store, dockOpts());
    }, minutes * 60000);
    toast(`Musik dijeda dalam ${minutes} menit.`, 'success');
  } else {
    toast('Timer tidur dimatikan.');
  }
  ui.renderDock(player, store, dockOpts());
}

function openPlayerMenu(anchor) {
  const s = local.sleep;
  const sleepOn = s.endAt || s.endOfTrack;
  openMenu(anchor, [
    { label: `Kecepatan: ${player.rate}×`, icon: 'gauge', action: () => setTimeout(() => openRateMenu(anchor), 0) },
    { label: sleepOn ? `Timer tidur: ${dockOpts().sleepLabel.replace('⏾ ', '')}` : 'Timer tidur…', icon: 'moon', action: () => setTimeout(() => openSleepMenu(anchor), 0) },
    'sep',
    player.current && { label: 'Tambah ke playlist…', icon: 'plus', action: () => addToOther({ youtubeId: player.current.youtubeId, playlistId: null }) },
    { label: 'Putar di aplikasi YouTube', icon: 'external', action: () => playInYouTubeApp(currentQueueIds()) },
    player.current && { label: 'Buka video ini di YouTube', icon: 'external', action: () => window.open(watchUrl(player.current.youtubeId), '_blank', 'noopener') },
  ]);
}
function openRateMenu(anchor) {
  openMenu(anchor, [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => ({
    label: `${r}×${r === 1 ? ' (normal)' : ''}${player.rate === r ? '  ✓' : ''}`, icon: 'gauge',
    action: () => { player.setRate(r); store.ui.rate = r; store.saveUi(); },
  })));
}
function openSleepMenu(anchor) {
  const s = local.sleep;
  openMenu(anchor, [
    ...[15, 30, 45, 60, 90].map((m) => ({ label: `${m} menit`, icon: 'moon', action: () => setSleep(m) })),
    { label: 'Akhir lagu ini', icon: 'moon', action: () => setSleep('track') },
    (s.endAt || s.endOfTrack) && 'sep',
    (s.endAt || s.endOfTrack) && { label: 'Matikan timer', icon: 'x', action: () => setSleep(0) },
  ]);
}

// ---------- shortcut keyboard ----------
function showShortcuts() {
  const k = (keys, desc) => `<tr><td>${keys.map((x) => `<kbd>${x}</kbd>`).join(' ')}</td><td>${desc}</td></tr>`;
  modal({
    title: 'Pintasan keyboard',
    body: `<table class="kbd-table"><tbody>
      ${k(['Spasi', 'K'], 'Putar / jeda')}
      ${k(['N'], 'Lagu berikutnya')}${k(['P'], 'Lagu sebelumnya')}
      ${k(['←', '→'], 'Mundur / maju 5 detik')}
      ${k(['↑', '↓'], 'Volume naik / turun')}
      ${k(['M'], 'Bisukan / bunyikan')}
      ${k(['S'], 'Acak aktif / mati')}${k(['R'], 'Ganti mode ulangi')}
      ${k(['/'], 'Cari di library')}
      ${k(['Ctrl', 'A'], 'Pilih semua (saat mode pilih)')}
      ${k(['Esc'], 'Tutup panel / batal pilih')}
      ${k(['?'], 'Tampilkan daftar ini')}
    </tbody></table>`,
    actions: [{ label: 'Tutup', value: null }],
  });
}

// ---------- panel (sidebar, antrean, sheet tambah, player layar penuh) ----------
// Di HP setiap panel tercatat di riwayat, jadi tombol Back Android menutupnya.
function setPanel(name, open, apply) {
  if (open) {
    apply(true);
    overlay.open(name, () => { apply(false); renderBottomNav(); });
  } else if (overlay.isOpen(name)) {
    overlay.close(name);
  } else {
    apply(false);
  }
  renderBottomNav();
}

function openSidebar(open = true) {
  setPanel('sidebar', open, (on) => document.body.classList.toggle('sidebar-open', on));
}
function closeSidebar() {
  if (document.body.classList.contains('sidebar-open')) openSidebar(false);
}

function toggleQueue(force) {
  const panel = $('queue-panel');
  const open = force !== undefined ? force : panel.hidden;
  if (open === !panel.hidden) return;
  setPanel('queue', open, (on) => {
    panel.hidden = !on;
    document.body.classList.toggle('queue-open', on);
    ui.renderQueue(player, store);
  });
}

function openAddSheet(open = true) {
  if (!isPhone()) {
    if (open) { window.scrollTo({ top: 0, behavior: 'smooth' }); (local.multi ? $('add-multi') : $('add-input')).focus(); }
    return;
  }
  if (open === document.body.classList.contains('add-open')) return;
  setPanel('add', open, (on) => {
    document.body.classList.toggle('add-open', on);
    if (on) setTimeout(() => (local.multi ? $('add-multi') : $('add-input')).focus(), 60);
    else document.activeElement && document.activeElement.blur && document.activeElement.blur();
  });
}

function openNowPlaying(open = true) {
  if (!isPhone() || (open && !player.current)) return;
  if (open === document.body.classList.contains('np-open')) return;
  setPanel('np', open, (on) => document.body.classList.toggle('np-open', on));
}

async function pasteLink() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) { toast('Clipboard kosong.'); return; }
    fillAdd(text);
  } catch {
    toast('Tidak bisa membaca clipboard. Tekan lama kolom link lalu pilih Tempel.', 'info', 5000);
    $('add-input').focus();
  }
}

/** Isi form tambah dari teks bebas (clipboard / Bagikan dari aplikasi YouTube). */
function fillAdd(text) {
  const r = parseMany(text);
  if (r.valid.length > 1) {
    setMulti(true);
    $('add-multi').value = text.trim();
    feedback(`${r.valid.length} link valid terdeteksi — tekan Tambah.`, 'ok');
  } else {
    if (local.multi) setMulti(false);
    const link = r.valid.length ? `https://youtu.be/${r.valid[0]}` : text.trim();
    $('add-input').value = link;
    feedback(r.valid.length ? 'Link siap — pilih playlist lalu tekan Tambah.' : 'Tidak ada link YouTube yang dikenali.', r.valid.length ? 'ok' : 'error');
  }
}

document.addEventListener('click', async (e) => {
  if (local.selecting && !e.target.closest('dialog')) {
    const r = e.target.closest('.vrow');
    if (r && !e.target.closest('[data-action=item-menu]')) { toggleSelected(r.dataset.key); return; }
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('dialog')) return;
  const action = el.dataset.action;
  const rowEl = el.closest('.vrow');
  const entry = rowEl ? entryByKey(rowEl.dataset.key) : null;

  if (action.startsWith('sel-')) { selectionAction(action); return; }

  switch (action) {
    case 'view':
      store.setView(el.dataset.view);
      local.query = '';
      $('search').value = '';
      closeSidebar();
      window.scrollTo({ top: 0 });
      break;
    case 'toggle-sidebar': openSidebar(!document.body.classList.contains('sidebar-open')); break;
    case 'open-playlists': openSidebar(true); break;
    case 'close-sidebar': closeSidebar(); break;
    case 'open-add': openAddSheet(true); break;
    case 'close-add': openAddSheet(false); break;
    case 'paste-link': pasteLink(); break;
    case 'select-toggle': if (rowEl) toggleSelected(rowEl.dataset.key); break;
    case 'player-menu': openPlayerMenu(el); break;
    case 'search-clear':
      $('search').value = ''; local.query = ''; renderMain(); $('search').focus();
      break;
    case 'yt-search': {
      const target = overlay.isOpen('add') || el.closest('#add-form') ? $('add-target').value : addTarget();
      ytSearchDialog(store, { targetId: target, query: el.dataset.q || '' });
      break;
    }
    case 'add-from-library': libraryPicker(store, $('add-target').value); break;
    case 'play-in-yt': playInYouTubeApp(currentQueueIds()); break;
    case 'np-open': openNowPlaying(true); break;
    case 'np-close': openNowPlaying(false); break;
    case 'install-app': {
      const outcome = await promptInstall();
      if (outcome === 'accepted') toast('MyTube Vault dipasang. Buka dari layar utama HP-mu.', 'success');
      break;
    }
    case 'new-playlist': {
      closeSidebar();
      const name = await promptDialog('Playlist baru', { label: 'Nama playlist', placeholder: 'mis. Musik fokus', ok: 'Buat' });
      if (name) { store.createPlaylist(name); toast(`Playlist “${name}” dibuat.`, 'success'); }
      break;
    }
    case 'play': if (entry) playFromEntry(entry); break;
    case 'play-all': playVisible(false); break;
    case 'shuffle-all': playVisible(true); break;
    case 'fav': if (entry) store.toggleFavorite(entry.youtubeId); break;
    case 'watched': if (entry) store.toggleWatched(entry.youtubeId); break;
    case 'up': if (entry) store.moveItem(entry.playlistId, entry.index, entry.index - 1); break;
    case 'down': if (entry) store.moveItem(entry.playlistId, entry.index, entry.index + 1); break;
    case 'item-menu': if (entry) openItemMenu(el, entry); break;
    case 'playlist-menu': openPlaylistMenu(el); break;
    case 'more': local.limit += PAGE; renderMain(); break;
    case 'sort-manual': store.ui.sort[store.ui.view] = 'manual'; store.saveUi(); break;
    case 'toggle-multi': setMulti(!local.multi); break;
    case 'open-settings': openSettings(el.dataset.tab || 'cloud'); break;
    case 'sync-badge':
      if (sync.connected && ['conflict', 'locked', 'pending', 'offline'].includes(sync.status)) sync.syncNow();
      else openSettings('cloud');
      break;
    case 'banner-settings': openSettings('cloud'); break;
    case 'banner-resolve': sync.syncNow(); break;
    case 'banner-dismiss': store.ui.bannerDismissed = true; store.saveUi(); break;
    case 'dock-play': player.toggle(); break;
    case 'dock-next': player.next(); break;
    case 'dock-prev': player.prev(); break;
    case 'dock-shuffle': store.setPlayerSetting('shuffle', !store.data.settings.player.shuffle); break;
    case 'dock-repeat': {
      const order = { off: 'all', all: 'one', one: 'off' };
      store.setPlayerSetting('repeat', order[store.data.settings.player.repeat] || 'all');
      break;
    }
    case 'dock-fav': if (player.current) store.toggleFavorite(player.current.youtubeId); break;
    case 'dock-add':
      if (player.current) addToOther({ youtubeId: player.current.youtubeId, playlistId: null });
      break;
    case 'stage-toggle':
      if (isPhone()) { openNowPlaying(!document.body.classList.contains('np-open')); break; }
      store.ui.stageLarge = !store.ui.stageLarge; store.saveUi();
      break;
    case 'stage-close': openNowPlaying(false); player.stop(); toggleQueue(false); break;
    case 'stage-min': store.ui.stageMin = !store.ui.stageMin; store.saveUi(); break;
    case 'queue-toggle': toggleQueue(); break;
    case 'queue-jump': player.jumpTo(Number(el.dataset.pos)); break;
    case 'queue-remove': player.removeAt(Number(el.dataset.pos)); break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-action=sort]')) {
    store.ui.sort[store.ui.view] = e.target.value;
    store.saveUi();
  }
});

// ---------- drag & drop reorder ----------
(() => {
  const list = $('video-list');
  let fromIndex = null;
  const clearMarks = () => list.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  const isAfter = (row, y) => { const r = row.getBoundingClientRect(); return y > r.top + r.height / 2; };

  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.vrow');
    if (!row || !canReorder()) return;
    const en = entryByKey(row.dataset.key);
    if (!en) return;
    fromIndex = en.index;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.key);
  });
  list.addEventListener('dragover', (e) => {
    if (fromIndex == null) return;
    e.preventDefault();
    const row = e.target.closest('.vrow');
    clearMarks();
    if (row) row.classList.add(isAfter(row, e.clientY) ? 'drop-after' : 'drop-before');
  });
  list.addEventListener('drop', (e) => {
    if (fromIndex == null) return;
    e.preventDefault();
    const row = e.target.closest('.vrow');
    const target = row ? entryByKey(row.dataset.key) : null;
    if (target) {
      let to = target.index + (isAfter(row, e.clientY) ? 1 : 0);
      if (to > fromIndex) to--;
      store.moveItem(target.playlistId, fromIndex, to);
    }
    fromIndex = null;
    clearMarks();
  });
  list.addEventListener('dragend', () => {
    fromIndex = null;
    clearMarks();
    list.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  });
})();

enableTouchReorder($('video-list'), {
  canReorder,
  entryByKey,
  move: (plId, from, to) => store.moveItem(plId, from, to),
});

// ---------- player mengambang: geser ke pojok mana pun (desktop/tablet lebar) ----------
(() => {
  const stage = $('stage');
  const bar = stage.querySelector('.stage-bar');
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || window.innerWidth <= 860) return;
    const r = stage.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, x0: e.clientX, y0: e.clientY };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    drag.moved = true;
    stage.classList.add('dragging');
    const w = stage.offsetWidth;
    const h = stage.offsetHeight;
    const x = Math.max(0, Math.min(window.innerWidth - w, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(window.innerHeight - h, e.clientY - drag.dy));
    Object.assign(stage.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('dragging');
    stage.style.left = ''; stage.style.top = ''; stage.style.right = ''; stage.style.bottom = '';
    if (!d.moved) {
      if (store.ui.stageMin) { store.ui.stageMin = false; store.saveUi(); } // ketuk bilah saat diminimize = tampilkan lagi
      return;
    }
    // Tempel ke pojok terdekat.
    const cx = e.clientX < window.innerWidth / 2 ? 'l' : 'r';
    const cy = e.clientY < window.innerHeight / 2 ? 't' : 'b';
    store.ui.stageCorner = cy + cx;
    store.saveUi();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
})();

// Bayangan pada kolom tambah saat sudah menempel di atas (sticky).
(() => {
  const panel = $('add-form');
  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';
  panel.before(sentinel);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => panel.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < 100), { rootMargin: '-80px 0px 0px 0px' }).observe(sentinel);
  }
})();

// ---------- form tambah & pencarian ----------
$('add-form').addEventListener('submit', handleAdd);
$('add-input').addEventListener('paste', (e) => {
  const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
  const links = text.match(/https?:\/\/\S+/g) || [];
  if (links.length > 1 || /\n/.test(text.trim())) {
    e.preventDefault();
    setMulti(true);
    $('add-multi').value = text;
    const r = parseMany(text);
    feedback(`${r.valid.length} link valid terdeteksi — klik Tambah.`, 'ok');
  }
});
$('add-input').addEventListener('input', () => feedback(''));
$('add-multi').addEventListener('input', () => {
  const r = parseMany($('add-multi').value);
  feedback(r.valid.length || r.invalid.length
    ? `${r.valid.length} link valid${r.invalid.length ? ` · ${r.invalid.length} tidak valid` : ''}${r.duplicates ? ` · ${r.duplicates} duplikat` : ''}`
    : '');
});
$('add-multi').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('add-form').requestSubmit(); }
});

let searchTimer = null;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  $('search-clear').hidden = !e.target.value;
  searchTimer = setTimeout(() => { local.query = e.target.value; local.limit = PAGE; renderMain(); }, 250);
});

$('dock-progress').addEventListener('click', (e) => {
  const d = player.duration();
  if (!d) return;
  const r = e.currentTarget.getBoundingClientRect();
  player.seek(((e.clientX - r.left) / r.width) * d);
});

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest && t.closest('input, textarea, select, [contenteditable], dialog')) {
    if (e.key === 'Escape' && t.id === 'search') { t.value = ''; local.query = ''; renderMain(); t.blur(); }
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  if (e.key === ' ' && t.closest && t.closest('button, a')) return;
  if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && local.selecting) { e.preventDefault(); selectionAction('sel-all'); return; }
  switch (e.key) {
    case '?': e.preventDefault(); showShortcuts(); return;
    case 'ArrowLeft': if (player.current) { e.preventDefault(); player.seek(Math.max(0, player.time() - 5)); } return;
    case 'ArrowRight': if (player.current) { e.preventDefault(); player.seek(player.time() + 5); } return;
    case 'ArrowUp': if (player.current) { e.preventDefault(); const v = Math.min(100, player.volume() + 10); player.setVolume(v); toast(`Volume ${v}%`); } return;
    case 'ArrowDown': if (player.current) { e.preventDefault(); const v = Math.max(0, player.volume() - 10); player.setVolume(v); toast(`Volume ${v}%`); } return;
    case 'm': case 'M': if (player.current) toast(player.toggleMute() ? 'Suara aktif' : 'Dibisukan'); return;
    case 's': case 'S': store.setPlayerSetting('shuffle', !store.data.settings.player.shuffle); toast(store.data.settings.player.shuffle ? 'Acak aktif' : 'Acak mati'); return;
    case 'r': case 'R': {
      const order = { off: 'all', all: 'one', one: 'off' };
      const next = order[store.data.settings.player.repeat] || 'all';
      store.setPlayerSetting('repeat', next);
      toast({ off: 'Ulangi: mati', all: 'Ulangi: semua', one: 'Ulangi: satu video' }[next]);
      return;
    }
    default: break;
  }
  switch (e.key) {
    case ' ': case 'k': case 'K':
      if (player.current) { e.preventDefault(); player.toggle(); }
      break;
    case 'n': case 'N': player.next(); break;
    case 'p': case 'P': player.prev(); break;
    case '/': e.preventDefault(); $('search').focus(); break;
    case 'Escape':
      if (local.selecting) { endSelect(); break; }
      closeSidebar();
      if (!$('queue-panel').hidden) toggleQueue(false);
      openAddSheet(false);
      openNowPlaying(false);
      break;
    default: break;
  }
});

// ---------- event dari store / player / sync ----------
store.on((type) => {
  if (type === 'storage-error') {
    toast('Gagal menyimpan ke browser (penyimpanan penuh?). Segera export backup.', 'error', 8000, { label: 'Backup', fn: () => openSettings('backup') });
    return;
  }
  if (type === 'change') { checkQuota(); syncQueueWithSource(); }
  if (local.selecting) {
    // buang pilihan yang sudah tidak ada (mis. setelah dihapus)
    const keys = new Set(store.viewEntries().map((x) => x.key));
    for (const k of local.selected) if (!keys.has(k)) local.selected.delete(k);
  }
  player.configure(store.data.settings.player);
  render();
});

player.on((type, data) => {
  if (type === 'ended' && data && store.data.settings.player.autoMarkWatched) {
    const v = store.data.videos[data.youtubeId];
    if (v && !v.watched) store.updateVideo(data.youtubeId, { watched: true });
  }
  if (type === 'playing' && data) {
    // Cadangan metadata: durasi & judul langsung dari player.
    const v = store.data.videos[data.youtubeId];
    if (v) {
      const patch = {};
      const d = player.duration();
      if (!v.duration && d > 0) patch.duration = Math.round(d);
      const vd = player.videoData();
      if (vd && vd.video_id === data.youtubeId) {
        if (!v.title && vd.title) patch.title = vd.title;
        if (!v.channel && vd.author) patch.channel = vd.author;
      }
      if (Object.keys(patch).length) store.updateVideo(data.youtubeId, patch);
    }
  }
  if (type === 'end-of-queue') toast('Sudah di akhir antrean.');
  if (type === 'track') {
    savePosition(local.playedTrack);
    local.playedTrack = null;
  }
  if (type === 'playing' && data && local.playedTrack !== data.youtubeId) {
    local.playedTrack = data.youtubeId;
    store.recordPlay(data.youtubeId);
    if (player.startAt > 0) {
      const from = player.startAt;
      toast(`Melanjutkan dari ${formatDuration(from)}.`, 'info', 6000, { label: 'Dari awal', fn: () => player.seek(0) });
      player.startAt = 0;
    }
  }
  if (type === 'ended' && data) store.setPosition(data.youtubeId, 0);
  if (type === 'state' && player.state === 'paused') savePosition(player.current && player.current.youtubeId);
  if (type === 'sleep') {
    local.sleep.endOfTrack = false;
    toast('Timer tidur: musik berhenti setelah lagu selesai. 🌙', 'info', 6000);
  }
  if (type === 'track' && !data) openNowPlaying(false);
  if (type === 'error') toast(data && data.skipping ? `${player.error} Melewati ke video berikutnya…` : player.error, 'error', 5000);
  ui.renderDock(player, store);
  ui.renderQueue(player, store);
  if (type === 'track' || type === 'state' || type === 'playing') renderMain();
});

sync.on(() => {
  ui.renderSyncBadge(sync, store);
  ui.renderBanner(store, sync);
});

sync.requestPassphrase = (mode, retry) => passphraseDialog({ mode, retry });
sync.notify = (msg, type) => toast(msg, type);
sync.resolveConflict = async ({ remote }) => {
  let remoteSummary = null;
  try {
    let data = null;
    if (!remote.encrypted) data = remote.data;
    else if (sync.passphrase) data = await openEnvelope(remote, sync.passphrase).catch(() => null);
    if (data) remoteSummary = summarize(normalizeData(data));
  } catch { remoteSummary = null; }
  return conflictDialog({ local: summarize(store.data), remote: remoteSummary, remoteUpdatedAt: remote.updatedAt });
};

window.addEventListener('storage', (e) => {
  if (e.key === 'mytube_vault_state_v1') { store.load(); store.emit('external'); }
});

// Notifikasi & layar kunci memakai kontrol bawaan player YouTube (paling andal saat aplikasi ditinggal).
let tick = 0;
setInterval(() => {
  if (!player.current) return;
  if (document.visibilityState === 'visible') ui.renderProgress(player.time(), player.duration());
  tick++;
  if (tick % 20 === 0 && player.isPlaying) savePosition(player.current.youtubeId); // tiap ±10 detik
  if (tick % 60 === 0 && local.sleep.endAt) ui.renderDock(player, store, dockOpts()); // hitung mundur timer
}, 500);

// ---------- lanjut dari posisi terakhir (video panjang saja, seperti YouTube) ----------
const RESUME_MIN_DURATION = 8 * 60;
function savePosition(id) {
  if (!id || !player.current || player.current.youtubeId !== id) return;
  const t = player.time();
  const d = player.duration();
  if (d < RESUME_MIN_DURATION) return;
  store.setPosition(id, t > 30 && t < d - 30 ? t : 0);
}
player.resumeLookup = (id) => {
  const v = store.data.videos[id];
  const pos = store.getPosition(id);
  return v && v.duration >= RESUME_MIN_DURATION && pos >= 60 && pos < v.duration - 30 ? pos : 0;
};
document.addEventListener('visibilitychange', () => { if (document.hidden && player.current) savePosition(player.current.youtubeId); });
window.addEventListener('pagehide', () => { if (player.current) savePosition(player.current.youtubeId); });

// ---------- offline, error tak terduga, kapasitas penyimpanan ----------
window.addEventListener('online', () => { ui.renderBanner(store, sync); toast('Kembali online.', 'success'); });
window.addEventListener('offline', () => { ui.renderBanner(store, sync); toast('Offline — data tetap tersimpan di perangkat ini.', 'info', 5000); });

let lastErrorToast = 0;
function reportUnexpected(err) {
  const msg = (err && (err.message || err.reason || String(err))) || '';
  if (!msg || /^Script error\.?$/i.test(msg) || /ResizeObserver/.test(msg)) return; // dari iframe pihak ketiga
  console.error(err);
  if (Date.now() - lastErrorToast < 10000) return;
  lastErrorToast = Date.now();
  toast(`Terjadi kesalahan: ${String(msg).slice(0, 120)}. Data kamu tetap aman; coba ulangi.`, 'error', 7000);
}
window.addEventListener('error', (e) => reportUnexpected(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportUnexpected(e.reason));

let quotaWarned = false;
function checkQuota() {
  if (quotaWarned) return;
  const size = store.storageSize();
  if (size > 4 * 1024 * 1024) {
    quotaWarned = true;
    toast('Penyimpanan browser hampir penuh (>4 MB dari ±5 MB). Export backup atau aktifkan Cloud Sync.', 'error', 9000,
      { label: 'Backup', fn: () => openSettings('backup') });
  }
}

// ---------- start ----------
async function onboarding() {
  const choice = await modal({
    title: 'Selamat datang di MyTube Vault',
    body: `<p>Playlist YouTube pribadi yang <b>tidak bergantung akun YouTube</b> — ganti akun sesering apa pun, playlist tetap ada.</p>
      <ul class="feature-list">
        <li>${icon('link')}<span>Tempel link YouTube (satu atau banyak sekaligus) untuk menambah video.</span></li>
        <li>${icon('music')}<span>Banyak playlist, urutan manual atau otomatis, player dengan shuffle, repeat, dan antrean.</span></li>
        <li>${icon('cloud')}<span>Opsional: backup otomatis ke GitHub Gist private milikmu, lengkap dengan riwayat versi dan enkripsi.</span></li>
      </ul>`,
    actions: [{ label: 'Mulai tanpa cloud', value: 'local' }, { label: 'Aktifkan cloud backup', value: 'cloud', variant: 'primary' }],
    dismissValue: 'local',
  });
  if (choice === 'cloud') openSettings('cloud');
  else if (isPhone()) openAddSheet(true);
  else $('add-input').focus();
}

function handleLaunch() {
  const p = takeLaunchParams();
  if (p.view && ['all', 'favorites', 'unwatched'].includes(p.view)) store.setView(p.view);
  if (p.shared) {
    openAddSheet(true);
    fillAdd(p.shared);
    if (!isPhone()) window.scrollTo({ top: 0 });
    return true;
  }
  if (p.action === 'add') { openAddSheet(true); return true; }
  return false;
}

document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
store.load();
player.configure(store.data.settings.player);
if (store.ui.rate && store.ui.rate !== 1) player.rate = store.ui.rate;
sync.init();
render();
const missing = Object.values(store.data.videos).filter((v) => !v.title).map((v) => v.youtubeId).slice(0, 50);
if (missing.length) metaQueue.add(missing);
setupPwa((available) => {
  document.querySelectorAll('[data-action=install-app]').forEach((b) => { b.hidden = !available || isStandalone(); });
}, () => toast('Versi baru MyTube Vault tersedia.', 'info', 15000, { label: 'Muat ulang', fn: () => location.reload() }));
document.body.classList.toggle('standalone', isStandalone());
const launched = handleLaunch();
if (store.isFresh && !launched) onboarding();
