// app-input.js — bagian dari main.js (dipecah di v44). Lihat main.js untuk urutan setup.

import { store, normalizeData } from './store.js';
import { sync } from './sync.js';
import { Player } from './player.js';
import { extractYouTubeId, parseMany, extractPlaylistId } from './parser.js';
import { createMetaQueue, watchUrl, installThumbFallback, thumbUrl, setLiteThumbs } from './metadata.js';
import { openEnvelope, summarize } from './envelope.js';
import {
  toast, modal, promptDialog, positionDialog, passphraseDialog, conflictDialog, pickPlaylistDialog, openMenu,
} from './dialogs.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { applyTint } from './tint.js';
import { enableRowDrag } from './rowdrag.js';
import { createPlayerBar } from './playerbar.js';
import { createLobbyHost, once } from './lobby-host.js';
import { snapshotSession, loadSession, saveSession } from './session.js';
import { createNowPanel } from './nowpanel.js';
import { createMediaSession } from './mediasession.js';
import { createMiniPip, pipSupported } from './minipip.js';
import { sendQueueDialog, receiveQueueDialog, inviteUrl } from './together.js';
import { makeAutoBackup, backupDue, downloadBackup } from './autobackup.js';
import { enableSwipe } from './swipe.js';
import { enableNavDrag } from './navdrag.js';
import { missingAutoTags, applyAutoTags } from './autotag.js';
import { titleOf, setCleanTitles } from './titles.js';
import { similarTo, songKey, artistKey } from './dupes.js';
import { classifyLinks, idsToAdd } from './addpreview.js';
import { enableStageFloat, trackStageSpace, enableQueueDrag } from './panels.js';
import { createSleepTimer, SLEEP_PRESETS } from './sleep.js';
import { renderQuickstart, toggleQuickstart, maybeShowWhatsNew, showWhatsNew } from './onboard.js';
import { sortEntries, filterEntries, quickFilter, toggleFilter, smartShuffle, QUICK_FILTERS, animateOut, copyText, downloadText, escapeHtml, slugify, formatDuration, timeAgo } from './utils.js';
import {
  isPhone, overlay, setupPwa, promptInstall, isStandalone, takeLaunchParams,
} from './mobile.js';
import { libraryPicker, ytSearchDialog, youtubeAppUrl, ytPlaylistImportDialog, audioVersionDialog, getApiKey } from './sources.js';
import { buildSharePayload, encodeShare, decodeShare, shareUrl, takeShareFromUrl } from './share.js';
import { logPlay, addListen, openStatsDialog, initStats, recentPlays, playLog, dailyLog } from './stats.js';
import { onThisDay } from './wrapped.js';
import { createLyricsPanel, guessArtistTrack, rememberLyrics } from './lyrics.js';
import { startTranslator, LANG, setLang, tr } from './i18n.js';
import { $, PAGE, local, openSettings, player } from './app-state.js';
import { addIds, bar, canReorder, density, editIndex, entryByKey, feedback, flashVideos, handleAdd, lastUndo, moveBlock, offerUndo, openOrderMenu, openTagFilterMenu, playFromEntry, playVisible, rememberQueueSource, renderAddPreview, renderAddTarget, renderBottomNav, renderDockAll, renderMain, renderQS, runUndo, schedulePreview, setDensity, setMulti } from './app-library.js';
import { addTarget, addToOther, clickSelect, currentQueueIds, deleteFromLibrary, endSelect, importSpotify, importYtPlaylist, openItemMenu, openPlayerMenu, openPlaylistMenu, openSyncMenu, openViewMenu, openWrapped, playInYouTubeApp, removeEntry, renderMemory, selectedEntries, selectionAction, toggleSelected } from './app-actions.js';
import { fire, hideResume, lobby, lyricsPanel, nowPanel, openCommandPalette, playVideoById, resumeOffer, resumeSession, toggleMiniPip } from './app-events.js';

// ---------- shortcut keyboard ----------
export function showShortcuts() {
  const k = (keys, desc) => `<tr><td>${keys.map((x) => `<kbd>${x}</kbd>`).join(' ')}</td><td>${desc}</td></tr>`;
  modal({
    title: 'Pintasan keyboard',
    body: `<table class="kbd-table"><tbody>
      ${k(['Spasi', 'K'], 'Putar / jeda')}
      ${k(['N'], 'Lagu berikutnya')}${k(['P'], 'Lagu sebelumnya')}
      ${k(['←', '→'], 'Mundur / maju 5 detik')}
      ${k(['↑', '↓'], 'Volume naik / turun')}
      ${k(['M'], 'Bisukan / bunyikan')}
      ${k(['S'], 'Acak aktif / mati')}${k(['R'], 'Ganti mode ulangi')}${k(['L'], 'Ulangi lagu ini (loop)')}
      ${k(['Y'], 'Tampilkan / tutup lirik')}
      ${k(['B'], 'Buka / tutup Lobby (suasana santai + suara alam)')}
      ${k(['V'], 'Tampilkan / sembunyikan video')}
      ${k(['I'], 'Tampilkan / sembunyikan panel Sedang diputar (PC layar lebar)')}
      ${k(['Q'], 'Buka / tutup antrean')}${k(['F'], 'Favoritkan lagu yang diputar')}
      ${k(['[', ']'], 'Geser waktu lirik −/+ 0,5 detik')}
      ${k(['/'], 'Cari di library')}
      ${k(['Ctrl', 'A'], 'Pilih semua (saat mode pilih)')}
      ${k(['Ctrl', 'klik'], 'Pilih / lepas satu lagu')}${k(['Shift', 'klik'], 'Pilih rentang lagu')}
      ${k(['Ctrl', 'Z'], 'Urungkan hapus / pindah terakhir')}
      ${k(['Esc'], 'Tutup panel / batal pilih')}
      ${k(['Ctrl', 'K'], 'Perintah cepat: lompat ke playlist, lagu, aksi')}
      ${k(['?'], 'Tampilkan daftar ini')}
    </tbody></table>`,
    actions: [{ label: 'Tutup', value: null }],
  });
}

// ---------- panel (sidebar, antrean, sheet tambah, player layar penuh) ----------
// Di HP setiap panel tercatat di riwayat, jadi tombol Back Android menutupnya.
export function setPanel(name, open, apply) {
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

export function openSidebar(open = true) {
  setPanel('sidebar', open, (on) => document.body.classList.toggle('sidebar-open', on));
}
export function closeSidebar() {
  if (document.body.classList.contains('sidebar-open')) openSidebar(false);
}

export function toggleQueue(force) {
  const panel = $('queue-panel');
  const open = force !== undefined ? force : panel.hidden;
  if (open === !panel.hidden) return;
  if (open && !$('lyrics-panel').hidden) toggleLyrics(false);
  setPanel('queue', open, (on) => {
    panel.hidden = !on;
    document.body.classList.toggle('queue-open', on);
    ui.renderQueue(player, store);
  });
}

/** Tampilkan / sembunyikan video. Bawaan: tersembunyi — cukup player di bawah, musik tetap jalan. */
export function toggleVideo(force) {
  const hidden = store.ui.stageMin !== false;
  const show = force !== undefined ? force : hidden;
  store.ui.stageMin = !show;
  store.saveUi();
}

export function applyLyrics(on) {
  $('lyrics-panel').hidden = !on;
  document.body.classList.toggle('lyrics-open', on);
  if (on) { lyricsPanel.load(); setTimeout(() => lyricsPanel.tick(player.time()), 60); }
  renderDockAll();
}
export function toggleLyrics(force) {
  const panel = $('lyrics-panel');
  const open = force !== undefined ? force : panel.hidden;
  if (open === !panel.hidden) return;
  if (open && !$('queue-panel').hidden) toggleQueue(false);
  setPanel('lyrics', open, applyLyrics);
}
/** Dari Lobby langsung ke lirik: entri riwayat Lobby ditukar dengan lirik (tombol Back tetap menutup lirik). */
export function lyricsFromLobby() {
  if (!$('lyrics-panel').hidden) { overlay.close('lobby'); return; }
  if (!$('queue-panel').hidden) toggleQueue(false);
  applyLyrics(true);
  overlay.swap('lobby', 'lyrics', () => { applyLyrics(false); renderBottomNav(); });
  renderBottomNav();
}

export function openAddSheet(open = true) {
  if (!isPhone()) {
    // PC: panel tambah muncul sebagai kartu melayang di bawah bar atas (tidak memakan tempat daftar lagu)
    if (open === document.body.classList.contains('add-open-d')) return;
    document.body.classList.toggle('add-open-d', open);
    placeAddPopover();
    if (open) { feedback(''); renderAddTarget(); $('add-target').value = addTarget(); setTimeout(() => (local.multi ? $('add-multi') : $('add-input')).focus(), 30); }
    return;
  }
  if (open === document.body.classList.contains('add-open')) return;
  setPanel('add', open, (on) => {
    document.body.classList.toggle('add-open', on);
    if (on) setTimeout(() => (local.multi ? $('add-multi') : $('add-input')).focus(), 60);
    else document.activeElement && document.activeElement.blur && document.activeElement.blur();
  });
}

export function openNowPlaying(open = true) {
  if (!isPhone() || (open && !player.current)) return;
  if (open === document.body.classList.contains('np-open')) return;
  setPanel('np', open, (on) => document.body.classList.toggle('np-open', on));
}

export async function pasteLink() {
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
export function fillAdd(text) {
  const r = parseMany(text);
  if (r.valid.length > 1) {
    setMulti(true);
    $('add-multi').value = text.trim();
    renderAddPreview();
  } else {
    if (local.multi) setMulti(false);
    const link = r.valid.length ? `https://youtu.be/${r.valid[0]}` : text.trim();
    $('add-input').value = link;
    feedback(r.valid.length ? 'Link siap — pilih playlist lalu tekan Tambah.' : 'Tidak ada link YouTube yang dikenali.', r.valid.length ? 'ok' : 'error');
  }
}



// ---------- tarik untuk mengubah urutan: satu lagu, atau semua yang dipilih sekaligus (js/rowdrag.js) ----------
/** Entri yang ikut digeser bila baris `en` digeser: semua yang dipilih (kalau `en` termasuk), atau `en` saja. */
export function dragGroup(en) {
  return local.selecting && local.selected.has(en.key) && local.selected.size > 1 ? selectedEntries() : [en];
}
/** Indeks jatuh (posisi di playlist) → posisi awal blok setelah blok dikeluarkan. */
export function dropTo(ents, dropIndex) {
  const keys = new Set(ents.map((e) => e.index));
  let to = dropIndex; for (const i of keys) if (i < dropIndex) to--;
  return to;
}
/** Gulir otomatis saat menggeser di dekat tepi atas/bawah (di bawah bar atas, di atas player/bar pilihan). */
export function edgeScroller() {
  let v = 0; let raf = 0;
  const loop = () => { if (!v) { raf = 0; return; } window.scrollBy(0, v); raf = requestAnimationFrame(loop); };
  return {
    update(y) {
      const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 70;
      const bars = ['select-bar', 'dock'].map((id) => $(id)).filter((n) => n && !n.hidden && n.offsetParent);
      const bottom = Math.min(window.innerHeight, ...bars.map((n) => n.getBoundingClientRect().top)) - 70;
      v = y < top ? -Math.min(28, 4 + (top - y) * 0.35) : y > bottom ? Math.min(28, 4 + (y - bottom) * 0.35) : 0;
      if (v && !raf) raf = requestAnimationFrame(loop);
    },
    stop() { v = 0; cancelAnimationFrame(raf); raf = 0; },
  };
}


// PC: panel Tambah melayang di bawah bar atas, selebar area daftar lagu.
export function placeAddPopover() {
  const panel = $('add-form');
  if (isPhone() || !document.body.classList.contains('add-open-d')) { panel.style.left = ''; panel.style.width = ''; return; }
  const main = $('main');
  const cs = getComputedStyle(main);
  const r = main.getBoundingClientRect();
  const w = Math.min(820, main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  panel.style.width = `${w}px`;
  panel.style.left = `${r.left + (main.clientWidth - w) / 2}px`;
}


// ---------- kolom serbaguna: ketik = cari, tempel link YouTube = langsung tambah ----------
export const hasLinks = (text) => /(youtu\.be\/|youtube\.com\/|music\.youtube)/i.test(text || '');
export function addFromSearch(text) {
  const r = parseMany(text);
  const target = addTarget();
  if (r.valid.length > 1) addIds(r.valid, target, { invalid: r.invalid.length, dup: r.duplicates });
  else {
    $('add-target').value = target;
    $('add-input').value = text.trim();
    handleAdd({ preventDefault() {} });
    if ($('add-input').value) { toast('Link tidak dikenali. Tempel link video atau playlist YouTube.', 'error'); $('add-input').value = ''; }
  }
  $('search').value = ''; $('search-clear').hidden = true; searchHint('');
  if (local.query) { local.query = ''; renderMain(); }
}
export function searchHint(msg) {
  let h = document.getElementById('search-hint');
  if (!h) { h = document.createElement('div'); h.id = 'search-hint'; h.className = 'search-hint'; $('search').closest('.search').appendChild(h); }
  h.textContent = msg; h.hidden = !msg;
}
export let searchTimer = null;



/** Pasang event & buat objek bagian ini (dipanggil sekali dari main.js, urutannya penting). */
export function setupInput() {
  document.addEventListener('click', async (e) => {
    // PC: Ctrl/⌘+klik = pilih/lepas satu lagu, Shift+klik = pilih rentang (langsung masuk mode pilih)
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && !e.target.closest('dialog, a, [data-action=item-menu], [data-action=fav], .tag-user')) {
      const r = e.target.closest('#video-list .vrow');
      if (r) { e.preventDefault(); clickSelect(r.dataset.key, e.shiftKey); return; }
    }
    if (local.selecting && !e.target.closest('dialog')) {
      const r = e.target.closest('.vrow');
      if (r && !e.target.closest('[data-action=item-menu], .grip')) { toggleSelected(r.dataset.key); return; }
    }
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('dialog')) return;
    const action = el.dataset.action;
    const rowEl = el.closest('.vrow');
    const entry = rowEl ? entryByKey(rowEl.dataset.key) : null;

    if (action === 'sel-order') { openOrderMenu(el); return; }
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
      case 'idx-edit': if (rowEl && entry && canReorder()) editIndex(rowEl, entry); break;
      case 'tag-open':
        store.setView(`tag:${el.dataset.tag.toLocaleLowerCase('id')}`);
        local.query = ''; $('search').value = '';
        window.scrollTo({ top: 0 });
        break;
      case 'player-menu': openPlayerMenu(el); break;
      case 'lyrics-toggle': toggleLyrics(); break;
      case 'density': setDensity(el.dataset.d); break;
      case 'lobby': lobby.toggle(); break;
      case 'lobby-mixer': lobby.openMixer(); break;
      case 'qs-toggle': toggleQuickstart(); renderQS(); break;
      case 'qs-dismiss':
        store.ui.qsDone = true; store.saveUi();
        toast('Panduan disembunyikan. Buka lagi lewat Ctrl+K → “Panduan mulai cepat”.', 'info', 6000);
        break;
      case 'whats-new': closeSidebar(); showWhatsNew(); break;
      case 'palette': openCommandPalette(); break;
      case 'qf':
        local.qf = el.dataset.qf ? toggleFilter(local.qf, el.dataset.qf) : [];
        local.limit = PAGE;
        renderMain();
        break;
      case 'qf-tags': openTagFilterMenu(el); break;
      case 'search-clear':
        $('search').value = ''; local.query = ''; renderMain(); $('search').focus();
        break;
      case 'yt-search': {
        const target = overlay.isOpen('add') || el.closest('#add-form') ? $('add-target').value : addTarget();
        ytSearchDialog(store, { targetId: target, query: el.dataset.q || '' });
        break;
      }
      case 'add-from-library': libraryPicker(store, $('add-target').value); break;
      case 'yt-import': importYtPlaylist({ targetId: $('add-target').value }); break;
      case 'spotify-import': importSpotify(); break;
      case 'open-wrapped': closeSidebar(); openWrapped(); break;
      case 'memory-hide': store.ui.memoryHidden = new Date().toDateString(); store.saveUiQuiet(); renderMemory(); break;
      case 'memory-play': case 'memory-one': {
        const ids = el.dataset.ids ? el.dataset.ids.split(',') : [el.dataset.id];
        const all = store.viewEntries('all');
        const ents = ids.map((id) => all.find((x) => x.youtubeId === id)).filter(Boolean);
        if (ents.length) { rememberQueueSource(false); player.playList(ents, 0); }
        break;
      }
      case 'open-stats': closeSidebar(); openStatsDialog(store, { onPlay: playVideoById }); break;
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
      case 'view-menu': openViewMenu(el); break;
      case 'more': local.limit += PAGE; renderMain(); break;
      case 'sort-manual': store.ui.sort[store.ui.view] = 'manual'; store.saveUi(); break;
      case 'toggle-multi': setMulti(!local.multi); break;
      case 'open-settings': openSettings(el.dataset.tab || 'cloud'); break;
      case 'sync-badge': openSyncMenu(el); break;
      case 'banner-settings': openSettings('cloud'); break;
      case 'banner-resolve': sync.syncNow(); break;
      case 'banner-dismiss': store.ui.bannerDismissed = true; store.saveUi(); break;
      case 'dock-play': player.toggle(); break;
      case 'dock-mute': if (player.current) { player.toggleMute(); bar.renderVol(); } break;
      case 'trim-edit': bar.editTrim(); break;
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
        // Saat video sedang diminimalkan, tombol perbesar langsung menampilkan video dalam ukuran besar.
        if (store.ui.stageMin !== false) { store.ui.stageMin = false; store.ui.stageLarge = true; } else store.ui.stageLarge = !store.ui.stageLarge;
        store.saveUi();
        break;
      case 'stage-close': openNowPlaying(false); player.stop(); toggleQueue(false); break;
      case 'stage-min': toggleVideo(); break;
      case 'resume-session': resumeSession(); break;
      case 'np-side-toggle': nowPanel.toggle(); break;
      case 'resume-dismiss': hideResume(); saveSession(null); break;
      case 'queue-toggle': toggleQueue(); break;
      case 'mini-pip': toggleMiniPip(); break;
      case 'queue-jump': player.jumpTo(Number(el.dataset.pos)); break;
      case 'queue-history': {
        // lagu yang tadi diputar: kalau masih di antrean ini, loncat ke sana; kalau tidak, putar sekarang
        const id = el.dataset.id;
        const at = player.order.findIndex((qi, k) => k < player.pos && player.queue[qi].youtubeId === id);
        if (at >= 0) { player.jumpTo(at); break; }
        const e = store.viewEntries('all').find((x) => x.youtubeId === id);
        if (e) { player.playNext(e); player.next(); } // antrean yang sekarang tetap utuh
        break;
      }
      case 'thumb-queue':
        if (entry) { player.addToQueue(entry); toast(`“${titleOf(entry.video) || 'Video'}” ditambahkan ke antrean.`, 'success'); }
        break;
      case 'thumb-remove':
        if (entry) { if (entry.playlistId) removeEntry(entry); else deleteFromLibrary(entry); }
        break;
      case 'queue-remove': player.removeAt(Number(el.dataset.pos)); break;
      case 'queue-clear': {
        const n = player.upcoming().length;
        const snap = player.queueSnapshot();
        player.clearUpcoming();
        offerUndo(`${n} lagu dikeluarkan dari antrean.`, () => player.restoreQueue(snap), { done: 'Antrean dikembalikan.' });
        break;
      }
      default: break;
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-action=sort]')) {
      store.ui.sort[store.ui.view] = e.target.value;
      store.saveUi();
    }
  });
  enableRowDrag($('video-list'), {
    canReorder,
    entryByKey,
    group: dragGroup,
    scroller: edgeScroller(),
    onState: (on) => { local.rowDrag = on; if (!on && local.renderLater) { local.renderLater = false; renderMain(); } },
    move: (ents, dropIndex) => {
      const to = dropTo(ents, dropIndex);
      if (ents.length > 1) moveBlock(ents, to, { scroll: false });
      else { flashVideos([ents[0].youtubeId], false); store.moveItem(ents[0].playlistId, ents[0].index, to); }
    },
  });
  // ---------- gestur v41: geser baris (HP), tarik urutan playlist ----------
  enableSwipe($('video-list'), {
    enabled: () => !local.selecting && density() !== 'grid' && !local.rowDrag,
    icon,
    actions: {
      right: { icon: 'next', label: 'Putar berikutnya', run: (row) => { const e = entryByKey(row.dataset.key); if (e) { const idle = !player.current; player.playNext(e); toast(idle ? 'Diputar sekarang.' : 'Akan diputar berikutnya.'); } } },
      left: { icon: 'plus', label: 'Tambah ke playlist', run: (row) => { const e = entryByKey(row.dataset.key); if (e) addToOther(e); } },
    },
  });
  enableNavDrag($('playlist-nav'), {
    move: (id, to) => {
      const pl = store.getPlaylist(id);
      const before = store.movePlaylistTo(id, to);
      if (before && pl) offerUndo(`“${pl.name}” dipindah ke nomor ${to + 1} di daftar playlist.`, () => store.setPlaylistOrder(before), { type: 'success', ms: 5000 });
    },
  });
  window.addEventListener('resize', () => { if (isPhone()) openAddSheet(false); placeAddPopover(); });
  $('add-form').addEventListener('keydown', (e) => { if (e.key === 'Escape' && !isPhone()) { e.preventDefault(); openAddSheet(false); } });
  // ---------- form tambah & pencarian ----------
  $('add-form').addEventListener('submit', handleAdd);
  $('add-input').addEventListener('paste', (e) => {
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    const r = parseMany(text);
    if (r.valid.length > 1) {
      // Banyak link sekaligus → langsung masuk ke playlist (bisa dibatalkan dari notifikasi).
      e.preventDefault();
      if (local.multi) setMulti(false);
      addIds(r.valid, $('add-target').value, { invalid: r.invalid.length, dup: r.duplicates });
      $('add-input').value = '';
    } else if (/\n/.test(text.trim()) && r.invalid.length) {
      e.preventDefault();
      setMulti(true);
      $('add-multi').value = text;
      renderAddPreview();
    }
  });
  $('add-input').addEventListener('input', () => feedback(''));
  $('add-multi').addEventListener('input', () => {
    feedback('');
    schedulePreview();
  });
  $('add-multi').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('add-form').requestSubmit(); }
  });
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    $('search-clear').hidden = !v;
    if (hasLinks(v)) {
      const n = parseMany(v).valid.length;
      const pl = store.getPlaylist(addTarget());
      searchHint(n ? `Enter: tambahkan ${n > 1 ? `${n} lagu` : 'lagu ini'} ke “${(pl || {}).name || 'playlist'}”` : 'Enter: tambahkan dari link ini');
      if (local.query) { local.query = ''; renderMain(); }
      return;
    }
    searchHint('');
    searchTimer = setTimeout(() => { local.query = v; local.limit = PAGE; renderMain(); }, 250);
  });
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && hasLinks(e.target.value)) { e.preventDefault(); addFromSearch(e.target.value); }
  });
  $('search').addEventListener('paste', (e) => {
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (!hasLinks(text) || $('search').value.trim()) return;
    e.preventDefault();
    addFromSearch(text);
  });
  $('search').addEventListener('blur', () => setTimeout(() => searchHint(''), 150));
  // Enter/Spasi pada elemen non-tombol yang berperan sebagai tombol (aksesibilitas keyboard)
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches || !e.target.matches('[role=button][data-action]:not(button)')) return;
    e.preventDefault();
    e.target.click();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey && !document.querySelector('dialog.palette[open]')) {
      e.preventDefault();
      if (!document.querySelector('dialog[open]')) openCommandPalette();
    }
  });
  // Ctrl+Z / ⌘Z: urungkan hapus/pindah terakhir (selama ±1 menit, di luar kolom teks)
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key !== 'z' && e.key !== 'Z')) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('dialog[open]') || !lastUndo || Date.now() - lastUndo.at > 60000) return;
    e.preventDefault();
    runUndo();
  });
  // Alt+↑/↓: geser lagu terpilih satu langkah; Alt+Shift+↑/↓: ke paling atas/bawah
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || !local.selecting || !canReorder() || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
    const ents = selectedEntries(); const pl = store.currentPlaylist();
    if (!ents.length || !pl) return;
    e.preventDefault();
    const up = e.key === 'ArrowUp';
    if (e.shiftKey) moveBlock(ents, up ? 0 : pl.items.length);
    else if (store.nudgeItems(pl.id, ents.map((x) => x.itemId), up ? -1 : 1)) {
      requestAnimationFrame(() => { const r = document.querySelector('.vrow.selected'); if (r) r.scrollIntoView({ block: 'nearest' }); });
    }
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
    if (lobby.isOpen() && lobby.key(e.key)) { e.preventDefault(); return; }
    switch (e.key) {
      case '?': e.preventDefault(); showShortcuts(); return;
      case 'a': case 'A': e.preventDefault(); openAddSheet(true); return;
      case 'ArrowLeft': if (player.current) { e.preventDefault(); player.seek(Math.max(0, player.time() - 5)); } return;
      case 'ArrowRight': if (player.current) { e.preventDefault(); player.seek(player.time() + 5); } return;
      case 'ArrowUp': if (player.current) { e.preventDefault(); toast(`Volume ${bar.setUserVolume(bar.userVolume() + 10)}%`); } return;
      case 'ArrowDown': if (player.current) { e.preventDefault(); toast(`Volume ${bar.setUserVolume(bar.userVolume() - 10)}%`); } return;
      case 'm': case 'M': if (player.current) { toast(player.toggleMute() ? 'Suara aktif' : 'Dibisukan'); bar.renderVol(); } return;
      case 'l': case 'L': {
        const next = store.data.settings.player.repeat === 'one' ? 'all' : 'one';
        store.setPlayerSetting('repeat', next);
        toast(next === 'one' ? 'Ulangi lagu ini' : 'Ulangi: semua');
        return;
      }
      case 'y': case 'Y': toggleLyrics(); return;
      case 'v': case 'V': if (player.current) toggleVideo(); return;
      case 'q': case 'Q': if (!lobby.isOpen()) toggleQueue(); return;
      case 'b': case 'B': lobby.toggle(); return;
      case 'f': case 'F': if (player.current) { store.toggleFavorite(player.current.youtubeId); toast(store.data.videos[player.current.youtubeId]?.favorite ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit'); } return;
      case '[': if (!$('lyrics-panel').hidden) { lyricsPanel.nudge(-0.5); } return;
      case ']': if (!$('lyrics-panel').hidden) { lyricsPanel.nudge(0.5); } return;
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
        if (player.current) { e.preventDefault(); player.toggle(); } else if (resumeOffer) { e.preventDefault(); resumeSession(); }
        break;
      case 'n': case 'N': player.next(); break;
      case 'i': case 'I': if (window.innerWidth >= 1280 && player.current) fire('np-side-toggle'); break;
      case 'p': case 'P': player.prev(); break;
      case '/': e.preventDefault(); $('search').focus(); break;
      case 'Escape':
        if (lobby.escape()) break;
        if (local.selecting) { endSelect(); break; }
        closeSidebar();
        if (!$('queue-panel').hidden) toggleQueue(false);
        if (!$('lyrics-panel').hidden) toggleLyrics(false);
        openAddSheet(false);
        openNowPlaying(false);
        break;
      default: break;
    }
  });
}
