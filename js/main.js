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
import { sortEntries, filterEntries, copyText, downloadText, escapeHtml, slugify } from './utils.js';
import {
  isPhone, overlay, enableTouchReorder, setupMediaSession, setupBackgroundPlay, setupPwa, promptInstall, isStandalone, takeLaunchParams,
} from './mobile.js';

const PAGE = 200;
const $ = (id) => document.getElementById(id);
const player = new Player('yt-player');
const local = { query: '', limit: PAGE, multi: false, lastView: null };

const metaQueue = createMetaQueue((id, meta) => {
  const v = store.data.videos[id];
  if (!v) return;
  if (meta && !v.title) store.updateVideo(id, { title: meta.title, channel: v.channel || meta.channel });
  else renderMain();
});

// ---------- helper view ----------
function currentSort() {
  const v = store.ui.view;
  return store.ui.sort[v] || (v.startsWith('pl:') ? 'manual' : 'addedNewest');
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
  ui.renderDock(player, store);
  ui.renderQueue(player, store);
  renderBottomNav();
  local.lastView = store.ui.view;
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
  });
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

// ---------- pemutaran ----------
function playFromEntry(entry) {
  if (player.current && player.current.youtubeId === entry.youtubeId && player.state !== 'error') {
    player.toggle();
    return;
  }
  const entries = visibleEntries();
  const idx = entries.findIndex((e) => e.key === entry.key);
  player.playList(entries.length ? entries : [entry], Math.max(0, idx));
}

function playVisible(shuffleAll) {
  const entries = visibleEntries();
  if (!entries.length) return;
  if (shuffleAll) store.setPlayerSetting('shuffle', true);
  const start = shuffleAll ? Math.floor(Math.random() * entries.length) : 0;
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

function openPlaylistMenu(anchor) {
  const pl = store.currentPlaylist();
  if (!pl) return;
  const links = () => pl.items.map((i) => watchUrl(i.youtubeId)).join('\n');
  openMenu(anchor, [
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
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('dialog')) return;
  const action = el.dataset.action;
  const rowEl = el.closest('.vrow');
  const entry = rowEl ? entryByKey(rowEl.dataset.key) : null;

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
  searchTimer = setTimeout(() => { local.query = e.target.value; local.limit = PAGE; renderMain(); }, 120);
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
  switch (e.key) {
    case ' ': case 'k': case 'K':
      if (player.current) { e.preventDefault(); player.toggle(); }
      break;
    case 'n': case 'N': player.next(); break;
    case 'p': case 'P': player.prev(); break;
    case '/': e.preventDefault(); $('search').focus(); break;
    case 'Escape':
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
    toast('Gagal menyimpan ke browser (penyimpanan penuh?). Segera export backup.', 'error', 8000);
    return;
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
  updateMediaSession();
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

const updateMediaSession = setupMediaSession(player, store);
setupBackgroundPlay(player, () => store.data.settings.player.backgroundPlay !== false);
let tick = 0;
setInterval(() => {
  if (!player.current) return;
  if (document.visibilityState === 'visible') ui.renderProgress(player.time(), player.duration());
  if (++tick % 10 === 0) updateMediaSession(); // posisi di notifikasi, tiap ±5 detik
}, 500);

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
sync.init();
render();
const missing = Object.values(store.data.videos).filter((v) => !v.title).map((v) => v.youtubeId).slice(0, 50);
if (missing.length) metaQueue.add(missing);
setupPwa((available) => {
  document.querySelectorAll('[data-action=install-app]').forEach((b) => { b.hidden = !available || isStandalone(); });
});
document.body.classList.toggle('standalone', isStandalone());
const launched = handleLaunch();
if (store.isFresh && !launched) onboarding();
