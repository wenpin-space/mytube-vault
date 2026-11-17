// app-actions.js — bagian dari main.js (dipecah di v44). Lihat main.js untuk urutan setup.

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
import { $, healthCheckDialog, local, openSettings, player, sleepTimer, spotifyImportDialog, wrappedDialog } from './app-state.js';
import { askPosition, bar, canReorder, currentSort, density, metaQueue, offerUndo, openDupesDialog, rememberQueueSource, render, renderDockAll, renderMain, setDensity, visibleEntries, withUndo } from './app-library.js';
import { openAddSheet, toggleVideo } from './app-input.js';
import { findAudioVersion, miniPip, playVideoById, toggleMiniPip } from './app-events.js';

// ---------- aksi item ----------
// ---------- Wrapped & "Setahun lalu" (js/wrapped.js) ----------
export function openWrapped(year = new Date().getFullYear()) {
  wrappedDialog(store, {
    plays: playLog(), daily: dailyLog(), year,
    onPlayList: (name, ids) => {
      if (!ids.length) return;
      const pl = store.createPlaylist(store.data.playlists.some((p) => p.name === name) ? `${name} (${new Date().toLocaleDateString()})` : name);
      store.addVideos(ids, pl.id);
      store.setView(`pl:${pl.id}`);
      toast(`Playlist “${pl.name}” dibuat dari ${ids.length} lagu teratasmu.`, 'success');
    },
  });
}
/** Kartu "Setahun lalu" (atau "Sebulan lalu") di atas Mix untukmu & Riwayat. */
export function renderMemory() {
  const box = $('memory-strip');
  const view = store.ui.view;
  const mem = (view === 'mix' || view === 'history') && !local.query ? onThisDay(store.data, playLog()) : null;
  if (!mem || store.ui.memoryHidden === new Date().toDateString()) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<div class="mem-head">${icon('history')}<b>${escapeHtml(mem.label)}</b><span class="muted small">kamu sering memutar ini</span>
      <button type="button" class="link-btn small" data-action="memory-play" data-ids="${mem.ids.join(',')}">${icon('play')}Putar</button>
      <button type="button" class="icon-btn sm" data-action="memory-hide" aria-label="Sembunyikan hari ini">${icon('x')}</button></div>
    <div class="mem-row">${mem.ids.map((id) => { const v = store.data.videos[id]; return `<button type="button" class="mem-item" data-action="memory-one" data-id="${id}" title="${escapeHtml(v.title || '')}"><img src="${thumbUrl(id, 'mqdefault')}" alt="" loading="lazy"><span translate="no">${escapeHtml(titleOf(v) || id)}</span></button>`; }).join('')}</div>`;
}

/** Import dari Spotify (js/spotify.js): daftar lagu → versi YouTube → playlist baru. */
export async function importSpotify() {
  const res = await spotifyImportDialog();
  if (!res) return;
  const pl = store.createPlaylist(res.name);
  store.addVideos(res.ids, pl.id);
  for (const id of res.ids) {
    const v = store.data.videos[id]; const m = res.meta[id];
    if (v && m) { if (!v.title) v.title = m.title; if (!v.channel) v.channel = m.channel; if (!v.duration && m.duration) v.duration = m.duration; }
  }
  store.commit('spotify-import');
  store.setView(`pl:${pl.id}`);
  toast(`${res.ids.length} lagu dari Spotify disimpan di “${pl.name}”.`, 'success');
}

/** Import playlist YouTube (dengan API key, atau tanpa key lewat player YouTube). Judul dimuat sesudahnya. */
export function importYtPlaylist(opts = {}) {
  return ytPlaylistImportDialog(store, { ...opts, onAdded: (ids) => metaQueue.add(ids.filter((id) => store.data.videos[id] && !store.data.videos[id].title)) });
}

export async function resolvePick(id) {
  if (id !== '__new__') return id;
  const name = await promptDialog('Playlist baru', { label: 'Nama playlist', placeholder: 'mis. Musik fokus', ok: 'Buat' });
  if (!name) return null;
  return store.createPlaylist(name, { switchView: false }).id;
}

export async function addToOther(entry) {
  const target = await resolvePick(await pickPlaylistDialog(store.data.playlists, { title: 'Tambah ke playlist', excludeId: entry.playlistId }));
  if (!target) return;
  const r = store.addVideos([entry.youtubeId], target);
  const name = store.getPlaylist(target).name;
  toast(r.added ? `Ditambahkan ke “${name}”.` : `Sudah ada di “${name}”.`, r.added ? 'success' : 'info');
}

export async function moveToOther(entry) {
  const target = await resolvePick(await pickPlaylistDialog(store.data.playlists, { title: 'Pindahkan ke playlist', excludeId: entry.playlistId }));
  if (!target) return;
  const { result, undo } = withUndo(() => store.moveToPlaylist(entry.playlistId, entry.itemId, target));
  if (result) offerUndo(`Dipindahkan ke “${store.getPlaylist(target).name}”.`, undo, { type: 'success' });
}

export function removeEntry(entry) {
  const pl = store.getPlaylist(entry.playlistId);
  if (!pl) return;
  const item = pl.items[entry.index];
  animateOut([entry.key], () => store.removeItem(pl.id, entry.itemId));
  offerUndo(`Dihapus dari “${pl.name}”.`, () => store.restoreItem(pl.id, item, entry.index), { ms: 7000 });
}

/**
 * Menu ⋮ sebuah lagu (v41: dirampingkan). Empat aksi tersering jadi tombol besar di atas, aksi yang
 * jarang dipakai dikumpulkan di "Lainnya", dan semua soal urutan cukup satu: "Pindah ke nomor…".
 */
export function openItemMenu(anchor, entry) {
  const v = entry.video;
  const inPl = !!entry.playlistId;
  const reorder = canReorder();
  const pl = inPl ? store.getPlaylist(entry.playlistId) : null;
  const more = () => [
    { label: 'Pilih beberapa…', icon: 'checks', action: () => startSelect(entry.key) },
    { label: v.watched ? 'Tandai belum ditonton' : 'Tandai sudah ditonton', icon: 'checkCircle', action: () => store.toggleWatched(v.youtubeId) },
    {
      label: 'Ubah judul…', icon: 'edit',
      action: async () => {
        const t = await promptDialog('Ubah judul', { label: 'Judul', value: v.title || '', max: 300, hint: v.title && titleOf(v) !== v.title ? 'Di daftar, tempelan seperti “(Official Video)” disembunyikan otomatis.' : '' });
        if (t) store.updateVideo(v.youtubeId, { title: t });
      },
    },
    !v.title && { label: 'Ambil ulang judul', icon: 'refresh', action: () => { metaQueue.add([v.youtubeId]); renderMain(); } },
    { label: 'Cari lagu yang sama…', icon: 'merge', action: () => openDupesDialog({ ids: [v.youtubeId] }) },
    'sep',
    { label: 'Buka di YouTube', icon: 'external', action: () => window.open(watchUrl(v.youtubeId), '_blank', 'noopener') },
    { label: 'Salin link', icon: 'copy', action: async () => toast((await copyText(watchUrl(v.youtubeId))) ? 'Link disalin.' : 'Gagal menyalin.') },
    { label: 'Kirim ke antrean teman…', icon: 'share', action: () => sendQueueDialog(store, [v.youtubeId]) },
  ];
  openMenu(anchor, [
    {
      tiles: [
        { label: 'Berikutnya', icon: 'next', action: () => { player.playNext(entry); toast('Akan diputar berikutnya.'); } },
        { label: 'Antrean', icon: 'queue', action: () => { player.addToQueue(entry); toast('Ditambahkan ke antrean.'); } },
        { label: 'Playlist', icon: 'plus', action: () => addToOther(entry) },
        { label: 'Favorit', icon: 'heart', on: v.favorite, action: () => store.toggleFavorite(v.youtubeId) },
      ],
    },
    { label: v.tags.length ? `Atur tag (${v.tags.length})…` : 'Atur tag…', icon: 'tag', action: () => tagsDialog([v.youtubeId]) },
    inPl && { label: 'Pindahkan ke playlist…', icon: 'arrowRight', action: () => moveToOther(entry) },
    reorder && pl.items.length > 1 && { label: 'Pindah ke nomor…', icon: 'sort', hint: `#${entry.index + 1}`, action: () => askPosition([entry]) },
    { label: 'Lainnya', icon: 'more', sub: more },
    'sep',
    inPl
      ? { label: 'Hapus dari playlist', icon: 'trash', danger: true, action: () => removeEntry(entry) }
      : { label: 'Hapus dari library', icon: 'trash', danger: true, action: () => deleteFromLibrary(entry) },
  ]);
}

/** Export daftar lagu (Artis – Judul) untuk dipindahkan ke Spotify/Apple Music lewat TuneMyMusic/Soundiiz. */
export function exportForStreaming(name, entries) {
  const rows = entries.map((e) => {
    const v = e.video;
    const g = guessArtistTrack(v.title || '', v.channel || '');
    return { artist: g.artist, track: g.track || v.title || '', url: watchUrl(e.youtubeId) };
  }).filter((r) => r.track);
  const text = rows.map((r) => (r.artist ? `${r.artist} - ${r.track}` : r.track)).join('\n');
  const q = (x) => `"${String(x).replace(/"/g, '""')}"`;
  const csv = ['Track name,Artist name,YouTube URL', ...rows.map((r) => [q(r.track), q(r.artist), q(r.url)].join(','))].join('\n');
  const file = slugify(name) || 'playlist';
  modal({
    title: 'Export untuk Spotify / Apple Music',
    wide: true,
    body: `<p class="muted">${rows.length} lagu dari <b>${escapeHtml(name)}</b>. Judul video dibersihkan jadi <i>Artis - Judul</i> supaya mudah dicocokkan.</p>
      <ol class="steps">
        <li>Salin daftar di bawah, atau download sebagai CSV.</li>
        <li>Buka <a href="https://www.tunemymusic.com/transfer" target="_blank" rel="noopener">TuneMyMusic</a> atau <a href="https://soundiiz.com" target="_blank" rel="noopener">Soundiiz</a> (gratis untuk playlist kecil), pilih sumber <b>Teks / File</b>, lalu tempel atau unggah.</li>
        <li>Pilih tujuan Spotify / Apple Music / YouTube Music dan login di sana. Aplikasi ini tidak pernah melihat akunmu.</li>
      </ol>
      <textarea class="export-text" rows="10" readonly>${escapeHtml(text)}</textarea>`,
    actions: [
      { label: 'Download CSV', value: 'csv' },
      { label: 'Salin daftar', value: 'copy', variant: 'primary' },
    ],
  }).then(async (v) => {
    if (v === 'copy') toast((await copyText(text)) ? 'Daftar lagu disalin. Tempel di TuneMyMusic.' : 'Gagal menyalin.', 'success');
    if (v === 'csv') downloadText(`${file}-untuk-spotify.csv`, csv, 'text/csv');
  });
}

/** Periksa video rusak di view sekarang (playlist atau koleksi). */
export function checkHealth() {
  const pl = store.currentPlaylist();
  const entries = store.viewEntries();
  if (!entries.length) { toast('Tidak ada video untuk diperiksa.'); return; }
  healthCheckDialog(store, {
    title: pl ? pl.name : ui.viewTitle(store.ui.view) || 'library',
    ids: [...new Set(entries.map((e) => e.youtubeId))],
    apiKey: getApiKey(),
    onShow: () => { local.qf = ['unavail']; renderMain(); window.scrollTo({ top: 0 }); },
    onRemove: (gone) => {
      const set = new Set(gone);
      if (pl) {
        const removed = store.removeItems(pl.id, pl.items.filter((it) => set.has(it.youtubeId)).map((it) => it.itemId));
        return removed.length;
      }
      store.snapshot();
      store.deleteVideos(gone);
      return gone.length;
    },
  });
}

/** Hapus dari library & semua playlist — tanpa dialog konfirmasi; bisa diurungkan dari notifikasi. */
export function deleteFromLibrary(entry) {
  const v = entry.video;
  animateOut([entry.key], () => {
    const { undo } = withUndo(() => store.deleteVideo(v.youtubeId));
    offerUndo('Dihapus dari library dan semua playlist.', undo, { ms: 8000 });
  });
}

/** Serahkan daftar putar ke aplikasi YouTube (Premium: tetap jalan di latar belakang). */
export function playInYouTubeApp(ids) {
  if (!ids.length) { toast('Tidak ada video untuk diputar.'); return; }
  if (player.isPlaying) player.toggle(); // hindari dua suara sekaligus
  const url = youtubeAppUrl(ids);
  if (ids.length > 50) toast('YouTube hanya menerima 50 video pertama.', 'info', 5000);
  if (url.startsWith('intent:')) location.href = url;
  else window.open(url, '_blank', 'noopener');
}

export function currentQueueIds() {
  if (!player.current) return visibleEntries().map((e) => e.youtubeId);
  const ord = player.order.slice(player.pos).concat(player.repeat === 'all' ? player.order.slice(0, player.pos) : []);
  return ord.map((i) => player.queue[i].youtubeId);
}

export function addTarget() {
  const pl = store.currentPlaylist();
  return (pl && pl.id) || $('add-target').value;
}

/** Satu tombol "Tampilan": urutan + kepadatan daftar. */
export function openViewMenu(anchor) {
  const cur = currentSort();
  const d = density();
  openMenu(anchor, [
    { heading: 'Urutkan' },
    ...ui.sortModes(store).map(([k, l]) => ({ label: l, checked: k === cur, action: () => { store.ui.sort[store.ui.view] = k; store.saveUi(); } })),
    'sep',
    { heading: 'Tampilan' },
    ...ui.DENSITIES.map(([k, ic, l]) => ({ label: l.replace('Tampilan ', '').replace(/^./, (c) => c.toUpperCase()), icon: ic, checked: k === d, action: () => setDensity(k) })),
  ]);
}

export function openPlaylistMenu(anchor) {
  const pl = store.currentPlaylist();
  const viewIds = () => visibleEntries().map((e) => e.youtubeId);
  if (!pl) {
    openMenu(anchor, [
      { label: 'Putar di aplikasi YouTube', icon: 'external', disabled: !viewIds().length, action: () => playInYouTubeApp(viewIds()) },
      { label: 'Pilih beberapa…', icon: 'checks', disabled: !viewIds().length, action: () => startSelect() },
      store.ui.view.startsWith('tag:') && {
        label: 'Hapus tag ini dari semua video', icon: 'trash', danger: true,
        action: () => {
          const t = store.allTags().find((x) => x.key === store.ui.view.slice(4));
          if (!t) return;
          const { undo } = withUndo(() => store.deleteTag(t.name));
          offerUndo(`#${t.name} dilepas dari ${t.count} video.`, undo);
        },
      },
      store.ui.view === 'history' && { label: 'Statistik mendengarkan', icon: 'chart', action: () => openStatsDialog(store, { onPlay: playVideoById }) },
      store.ui.view === 'history' && {
        label: 'Hapus riwayat', icon: 'trash', danger: true, disabled: !viewIds().length,
        action: () => { const { undo } = withUndo(() => store.clearHistory()); offerUndo('Riwayat dikosongkan.', undo); },
      },
      { label: 'Cari lagu ganda…', icon: 'merge', disabled: Object.keys(store.data.videos).length < 2, action: () => openDupesDialog() },
      { label: 'Periksa video rusak…', icon: 'heartPulse', disabled: !viewIds().length, action: () => checkHealth() },
      { label: 'Export untuk Spotify / Apple Music…', icon: 'upload', disabled: !viewIds().length, action: () => exportForStreaming(ui.viewTitle(store.ui.view) || 'library', store.viewEntries()) },
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
    { label: 'Import playlist YouTube…', icon: 'download', action: () => importYtPlaylist({ targetId: pl.id }) },
    { label: 'Bagikan playlist (link)…', icon: 'share', disabled: !pl.items.length, action: () => sharePlaylist(pl) },
    'sep',
    { label: 'Putar di aplikasi YouTube', icon: 'external', disabled: !pl.items.length, action: () => playInYouTubeApp(viewIds()) },
    { label: 'Pilih beberapa…', icon: 'checks', disabled: !pl.items.length, action: () => startSelect() },
    { label: 'Periksa video rusak…', icon: 'heartPulse', disabled: !pl.items.length, action: () => checkHealth() },
    { label: 'Export untuk Spotify / Apple Music…', icon: 'upload', disabled: !pl.items.length, action: () => exportForStreaming(pl.name, store.viewEntries()) },
    'sep',
    { label: 'Cari lagu ganda…', icon: 'merge', disabled: pl.items.length < 2, action: () => openDupesDialog({ playlistId: pl.id }) },
    { label: 'Duplikat playlist', icon: 'copyPlus', action: () => { const c = store.duplicatePlaylist(pl.id); if (c) toast(`Dibuat “${c.name}”.`, 'success'); } },
    store.data.playlists.length > 1 && { label: 'Posisi di daftar playlist', icon: 'sort', hint: `${store.data.playlists.indexOf(pl) + 1}/${store.data.playlists.length}`, sub: () => playlistOrderItems(pl) },
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
      action: () => {
        const n = pl.items.length;
        const { undo } = withUndo(() => store.clearPlaylist(pl.id));
        offerUndo(`${n} video dikeluarkan dari “${pl.name}”. Video tetap ada di Semua video.`, undo);
      },
    },
    {
      label: 'Hapus playlist', icon: 'trash', danger: true,
      action: () => {
        const { undo } = withUndo(() => store.deletePlaylist(pl.id), { restoreView: true });
        offerUndo(`Playlist “${pl.name}” dihapus. Lagunya tetap ada di Semua video.`, undo);
      },
    },
  ]);
}

/** Submenu posisi playlist di sidebar (selain bisa ditarik langsung). */
export function playlistOrderItems(pl) {
  const arr = store.data.playlists;
  const i = arr.indexOf(pl);
  const go = (to) => () => {
    const before = store.movePlaylistTo(pl.id, to);
    if (before) offerUndo(`“${pl.name}” sekarang nomor ${arr.indexOf(pl) + 1} di daftar playlist.`, () => store.setPlaylistOrder(before), { type: 'success', ms: 5000 });
  };
  return [
    i > 0 && { label: 'Paling atas', icon: 'top', action: go(0) },
    i > 0 && { label: 'Naik satu', icon: 'up', action: go(i - 1) },
    i < arr.length - 1 && { label: 'Turun satu', icon: 'down', action: go(i + 1) },
    i < arr.length - 1 && { label: 'Paling bawah', icon: 'down', action: go(arr.length - 1) },
    { note: 'Bisa juga ditarik langsung di daftar playlist.', icon: 'grip' },
  ];
}

// ---------- bagikan playlist lewat link ----------
export async function sharePlaylist(pl) {
  if (!pl.items.length) { toast('Playlist masih kosong.'); return; }
  let url;
  try { url = shareUrl(await encodeShare(buildSharePayload(pl, store.data.videos))); } catch (e) { toast(`Gagal membuat link: ${e.message}`, 'error'); return; }
  const over = pl.items.length > 300;
  modal({
    title: `Bagikan “${pl.name}”`,
    body: `<p>Siapa pun yang membuka link ini bisa melihat dan menyimpan <b>${Math.min(pl.items.length, 300)} lagu</b> di playlist ini ke MyTube Vault mereka sendiri.${over ? ' (Hanya 300 lagu pertama yang ikut.)' : ''}</p>
      <label class="field"><span>Link</span><textarea class="share-link" rows="3" readonly>${escapeHtml(url)}</textarea></label>
      <p class="hint">Isi playlist tersimpan di dalam link itu sendiri, tidak dikirim ke server mana pun. Perubahan playlist setelah ini tidak ikut; buat link baru kalau perlu. Panjang link: ${url.length.toLocaleString('id')} karakter.</p>`,
    actions: [
      { label: 'Tutup', value: null },
      ...(navigator.share ? [{ label: 'Bagikan…', value: 'share' }] : []),
      { label: 'Salin link', variant: 'primary', value: 'copy' },
    ],
    onOpen: (b) => { const t = b.querySelector('.share-link'); t.addEventListener('focus', () => t.select()); },
  }).then(async (act) => {
    if (act === 'copy') toast((await copyText(url)) ? 'Link disalin.' : 'Gagal menyalin, salin manual dari kotak link.', 'success');
    if (act === 'share') navigator.share({ title: `Playlist ${pl.name} · MyTube Vault`, url }).catch(() => {});
  });
}

export async function receiveShare(code) {
  let data;
  try { data = await decodeShare(code); } catch (e) { toast(`Link playlist tidak bisa dibuka: ${e.message}`, 'error', 7000); return; }
  if (data.kind === 'queue') { receiveQueue(data); return; }
  const preview = data.videos.slice(0, 8).map((v) => `<li>${escapeHtml(v.title || v.id)}${v.channel ? ` <span class="muted small">· ${escapeHtml(v.channel)}</span>` : ''}</li>`).join('');
  const choice = await modal({
    title: 'Playlist dibagikan untukmu',
    body: `<h3 class="share-name">${icon('music')}${escapeHtml(data.name)}</h3>
      <p class="muted">${data.videos.length} lagu${data.truncated ? ` (dari ${data.truncated}; pengirim membagikan 300 pertama)` : ''}</p>
      <ol class="share-preview">${preview}${data.videos.length > 8 ? `<li class="muted">…dan ${data.videos.length - 8} lagu lainnya</li>` : ''}</ol>
      <p class="hint">Disimpan sebagai playlist baru di perangkat ini; playlist-mu yang lain tidak berubah.</p>`,
    actions: [{ label: 'Batal', value: null }, { label: 'Simpan', value: 'save' }, { label: 'Simpan & putar', variant: 'primary', value: 'play' }],
  });
  if (!choice) return;
  let name = data.name;
  if (store.data.playlists.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = `${name} (dibagikan)`;
  const pl = store.createPlaylist(name);
  store.addVideos(data.videos.map((v) => v.id), pl.id);
  for (const v of data.videos) {
    const cur = store.data.videos[v.id];
    if (cur && !cur.title && v.title) { cur.title = v.title; if (!cur.channel) cur.channel = v.channel; }
  }
  store.commit('share-import');
  metaQueue.add(data.videos.filter((v) => !v.title).map((v) => v.id));
  toast(`Playlist “${name}” disimpan.`, 'success');
  if (choice === 'play') { rememberQueueSource(); player.playList(visibleEntries(), 0); }
}

// ---------- antrean bareng teman (js/together.js) ----------
/** Lagu kiriman teman: disimpan di playlist "Dari teman", lalu masuk antrean. */
export async function receiveQueue(data) {
  const choice = await receiveQueueDialog(data);
  if (!choice) return;
  const NAME = tr('Dari teman');
  const pl = store.data.playlists.find((p) => p.name === NAME || p.name === 'Dari teman') || store.createPlaylist(NAME);
  const ids = data.videos.map((v) => v.id);
  store.addVideos(ids, pl.id);
  for (const v of data.videos) {
    const cur = store.data.videos[v.id];
    if (cur && !cur.title && v.title) { cur.title = v.title; if (!cur.channel) cur.channel = v.channel; }
  }
  store.commit('share-queue');
  metaQueue.add(data.videos.filter((v) => !v.title).map((v) => v.id));
  const fresh = store.getPlaylist(pl.id);
  const entries = ids.map((id) => store.viewEntries(`pl:${pl.id}`).find((e) => e.youtubeId === id)).filter(Boolean);
  if (choice === 'save' || !entries.length) { toast(`${ids.length} lagu disimpan di “${fresh.name}”.`, 'success'); return; }
  if (!player.current) { rememberQueueSource(false); player.playList(entries, 0); }
  else if (choice === 'next') [...entries].reverse().forEach((e) => player.playNext(e));
  else entries.forEach((e) => player.addToQueue(e));
  toast(choice === 'next' && player.current ? `${entries.length} lagu dari teman diputar berikutnya.` : `${entries.length} lagu dari teman masuk antrean.`, 'success');
}
/** Link undangan "#kirim": langsung buka dialog kirim lagu. */
export function takeInvite() {
  if (location.hash !== '#kirim') return false;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* abaikan */ }
  sendQueueDialog(store, []);
  return true;
}
export async function inviteFriends() {
  const url = inviteUrl();
  if (navigator.share) { try { await navigator.share({ title: 'Kirim lagu ke antreanku', url }); return; } catch { /* dibatalkan */ } }
  toast((await copyText(url)) ? 'Link undangan disalin. Teman yang membukanya bisa mengirim lagu ke antreanmu.' : 'Gagal menyalin.', 'success', 7000);
}

// ---------- tag ----------
/** Atur tag untuk satu video (ids.length === 1) atau tambah/hapus satu tag di banyak video. */
export function tagsDialog(ids) {
  const single = ids.length === 1;
  const v = single ? store.data.videos[ids[0]] : null;
  let tags = single ? [...v.tags] : [];
  const all = store.allTags();
  const chip = (t, act, extra = '') => `<button type="button" class="tag-chip ${extra}" data-t-act="${act}" data-t="${escapeHtml(t)}">#${escapeHtml(t)}${act === 'remove' ? ` ${icon('x')}` : ''}</button>`;
  const counts = () => {
    const m = new Map();
    for (const id of ids) {
      for (const t of store.data.videos[id].tags) {
        const k = t.toLocaleLowerCase('id');
        if (!m.has(k)) m.set(k, { name: t, n: 0 });
        m.get(k).n++;
      }
    }
    return [...m.values()];
  };
  const draw = (b) => {
    const lower = new Set(tags.map((t) => t.toLocaleLowerCase('id')));
    const sugg = all.filter((t) => !lower.has(t.key)).slice(0, 24);
    b.querySelector('.tag-current').innerHTML = single
      ? (tags.length ? tags.map((t) => chip(t, 'remove', 'on')).join('') : '<span class="muted small">Belum ada tag.</span>')
      : (counts().length ? counts().map((c) => `${chip(c.name, 'remove-all', 'on')}<span class="muted small">${c.n}/${ids.length}</span>`).join(' ') : '<span class="muted small">Video terpilih belum punya tag.</span>');
    b.querySelector('.tag-sugg').innerHTML = sugg.length ? sugg.map((t) => chip(t.name, 'add')).join('') : '';
    b.querySelector('.tag-sugg-wrap').hidden = !sugg.length;
  };
  return modal({
    title: single ? 'Atur tag' : `Tag untuk ${ids.length} video`,
    body: `
      ${single ? `<p class="muted small" translate="no">${escapeHtml(titleOf(v) || v.youtubeId)}</p>` : ''}
      <div class="tag-current tag-row"></div>
      <form class="row tag-form" autocomplete="off"><input type="text" class="tag-input" placeholder="Tag baru, mis. lofi, kerja, galau" maxlength="30" aria-label="Tag baru">
        <button type="submit" class="btn">${icon('plus')}Tambah</button></form>
      <div class="tag-sugg-wrap"><p class="hint">Tag yang sudah ada:</p><div class="tag-sugg tag-row"></div></div>
      <p class="hint">Tag muncul di sidebar sebagai filter. Di kolom cari, ketik <code>#namatag</code>.</p>`,
    actions: single ? [{ label: 'Batal', value: null }, {
      label: 'Simpan', variant: 'primary',
      value: (bodyEl) => {
        const pending = bodyEl.querySelector('.tag-input').value.split(',').map((t) => t.trim().replace(/^#+/, '')).filter(Boolean);
        return [...tags, ...pending];
      },
    }] : [{ label: 'Selesai', value: null }],
    onOpen: (b) => {
      draw(b);
      const input = b.querySelector('.tag-input');
      const add = (t) => {
        const clean = t.trim().replace(/^#+/, '');
        if (!clean) return;
        if (single) { if (!tags.some((x) => x.toLocaleLowerCase('id') === clean.toLocaleLowerCase('id'))) tags.push(clean); } else {
          const n = store.addTagMany(ids, clean);
          toast(`#${clean} ditambahkan ke ${n} video.`, 'success');
        }
        draw(b);
      };
      const commitInput = () => { input.value.split(',').forEach(add); input.value = ''; input.focus(); };
      b.querySelector('.tag-form').addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); commitInput(); });
      // Enter di kolom tag = tambah tag (jangan sampai memicu tombol Simpan dialog sebelum tag masuk).
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault(); e.stopPropagation();
        if (input.value.trim()) commitInput();
        else if (single) b.closest('dialog').querySelector('.modal-actions .btn-primary').click();
      });
      b.addEventListener('click', (e) => {
        const c = e.target.closest('[data-t-act]');
        if (!c) return;
        const t = c.dataset.t;
        if (c.dataset.tAct === 'add') add(t);
        else if (c.dataset.tAct === 'remove') { tags = tags.filter((x) => x !== t); draw(b); }
        else if (c.dataset.tAct === 'remove-all') { const n = store.removeTagMany(ids, t); toast(`#${t} dihapus dari ${n} video.`); draw(b); }
      });
      input.focus();
    },
  }).then((res) => { if (single && res) store.setTags(ids[0], res); });
}

/** Beri tag otomatis (live, cover, remix, …) ke semua lagu di library, dengan Urungkan. */
export function autoTagAll() {
  const r = applyAutoTags(store, Object.keys(store.data.videos));
  if (!r.videos) { toast('Tidak ada tag baru: semua lagu sudah bertag sesuai judulnya.', 'info'); return; }
  offerUndo(`${r.tags} tag ditambahkan ke ${r.videos} lagu.`, () => r.undo(), { type: 'success', done: 'Tag otomatis dibatalkan.' });
}

// ---------- pilih banyak video ----------
export function startSelect(firstKey) {
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
export function endSelect() {
  if (overlay.isOpen('select')) overlay.close('select');
  else { local.selecting = false; local.selected.clear(); renderMain(); renderSelectBar(); }
}
export function toggleSelected(key) {
  if (local.selected.has(key)) local.selected.delete(key); else local.selected.add(key);
  local.selAnchor = key;
  renderMain();
  renderSelectBar();
}
/** Ctrl/Shift+klik. Shift: pilih semua lagu di antara lagu terakhir yang diklik dan lagu ini. */
export function clickSelect(key, range) {
  if (!local.selecting) { startSelect(); local.selAnchor = null; }
  if (range && local.selAnchor) {
    const keys = visibleEntries().map((x) => x.key);
    const a = keys.indexOf(local.selAnchor); const b = keys.indexOf(key);
    if (a >= 0 && b >= 0) {
      for (const k of keys.slice(Math.min(a, b), Math.max(a, b) + 1)) local.selected.add(k);
      renderMain(); renderSelectBar();
      return;
    }
  }
  toggleSelected(key);
}
export function selectedEntries() {
  return visibleEntries().filter((e) => local.selected.has(e.key));
}

export function renderSelectBar() {
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
      ${inPl && canReorder() ? b('sel-order', 'sort', 'Urutan') : ''}
      ${inPl ? b('sel-move', 'arrowRight', 'Pindah') : ''}
      ${b('sel-fav', 'heart', allFav ? 'Batal favorit' : 'Favorit')}
      ${b('sel-watched', 'checkCircle', ents.length && ents.every((e) => e.video.watched) ? 'Belum ditonton' : 'Ditonton')}
      ${b('sel-tag', 'tag', 'Tag')}
      ${b('sel-send', 'share', 'Kirim')}
      ${b('sel-delete', 'trash', inPl ? 'Hapus' : 'Hapus', 'data-danger')}
    </div>`;
}

export async function selectionAction(act) {
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
      const { result: r, undo } = withUndo(() => store.addVideos(ids, target));
      const msg = `${r.added} ditambahkan ke “${store.getPlaylist(target).name}”${r.skipped ? ` · ${r.skipped} sudah ada` : ''}.`;
      if (r.added) offerUndo(msg, undo, { type: 'success' }); else toast(msg, 'info');
      break;
    }
    case 'sel-move': {
      if (!pl) return;
      const target = await resolvePick(await pickPlaylistDialog(store.data.playlists, { title: `Pindahkan ${ents.length} video`, excludeId: pl.id }));
      if (!target) return;
      const { result: n, undo } = withUndo(() => store.moveItemsToPlaylist(pl.id, ents.map((e) => e.itemId), target));
      offerUndo(`${n} video dipindahkan ke “${store.getPlaylist(target).name}”.`, undo, { type: 'success' });
      break;
    }
    case 'sel-tag': await tagsDialog(ids); break;
    case 'sel-send': sendQueueDialog(store, ids); break;
    case 'sel-fav': {
      const value = !ents.every((e) => e.video.favorite);
      const { undo } = withUndo(() => store.setFavoriteMany(ids, value));
      offerUndo(value ? `${ids.length} video ditandai favorit.` : `${ids.length} video dihapus dari favorit.`, undo, { type: 'success', ms: 5000 });
      break;
    }
    case 'sel-watched': {
      const value = !ents.every((e) => e.video.watched);
      const { undo } = withUndo(() => store.setWatchedMany(ids, value));
      offerUndo(value ? `${ids.length} video ditandai sudah ditonton.` : `${ids.length} video ditandai belum ditonton.`, undo, { type: 'success', ms: 5000 });
      break;
    }
    case 'sel-delete': {
      // tanpa dialog konfirmasi: hapus langsung, Urungkan tersedia di notifikasi (dan Ctrl+Z)
      animateOut(ents.map((e) => e.key), () => {
        if (pl) {
          const removed = store.removeItems(pl.id, ents.map((e) => e.itemId));
          offerUndo(`${removed.length} video dihapus dari “${pl.name}”.`, () => store.restoreItems(pl.id, removed));
        } else {
          const { undo } = withUndo(() => store.deleteVideos(ids));
          offerUndo(`${ids.length} video dihapus dari library dan semua playlist.`, undo, { ms: 10000 });
        }
      });
      break;
    }
    default: return;
  }
  endSelect();
}


// ---------- timer tidur & kecepatan ----------
/**
 * Menu ⋮ player (v41: sama di PC & HP). Hanya hal yang memang soal lagu yang sedang diputar; tombol yang
 * sudah ada di bilah (lirik, tambah ke playlist) tidak diulang, setelan permanen pindah ke Setelan → Umum.
 */
export function openPlayerMenu(anchor) {
  const cur = player.current;
  const endTrack = sleepTimer.endOfTrack;
  const timed = sleepTimer.active && !endTrack;
  openMenu(anchor, [
    { label: 'Kecepatan', icon: 'gauge', hint: `${player.rate}×`, sub: () => rateItems() },
    { label: 'Timer tidur', icon: 'moon', hint: timed ? sleepTimer.label().replace('⏾ ', '') : '', sub: () => sleepItems() },
    { label: 'Berhenti setelah lagu ini', icon: 'pause', checked: endTrack, action: () => sleepTimer.set(endTrack ? 0 : 'track') },
    'sep',
    cur && { label: store.getTrim(cur.youtubeId) ? 'Ubah potongan awal/akhir…' : 'Potong awal/akhir lagu…', icon: 'scissors', action: () => bar.editTrim() },
    cur && { label: 'Ganti ke versi audio (lirik pas)…', icon: 'music', action: () => findAudioVersion() },
    isPhone() && cur && { label: 'Video kecil saat diperkecil', icon: 'video', checked: store.ui.stageMin === false, action: () => toggleVideo() },
    'sep',
    cur && { label: 'Buka di YouTube', icon: 'external', action: () => window.open(watchUrl(cur.youtubeId), '_blank', 'noopener') },
    { label: 'Putar antrean di aplikasi YouTube', icon: 'external', action: () => playInYouTubeApp(currentQueueIds()) },
    { label: 'Undang teman mengisi antrean…', icon: 'share', action: () => inviteFriends() },
    pipSupported() && !isPhone() && { label: 'Mini player mengambang', icon: 'pip', checked: miniPip.isOpen(), action: () => toggleMiniPip() },
    { label: 'Setelan pemutar…', icon: 'settings', action: () => openSettings('general') },
  ]);
}
export function rateItems() {
  return [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => ({
    label: r === 1 ? '1× (normal)' : `${r}×`, icon: 'gauge', checked: player.rate === r,
    action: () => { player.setRate(r); store.ui.rate = r; store.saveUi(); },
  }));
}
export function sleepItems() {
  const on = sleepTimer.active;
  return [
    ...SLEEP_PRESETS.map((m) => ({ label: `${m} menit`, icon: 'moon', action: () => sleepTimer.set(m) })),
    { label: 'Akhir lagu ini', icon: 'pause', checked: sleepTimer.endOfTrack, action: () => sleepTimer.set('track') },
    on && 'sep',
    on && { label: 'Matikan timer', icon: 'x', action: () => sleepTimer.set(0) },
  ];
}
// label hitung mundur di player bawah: render ulang hanya saat teksnya berubah (±1× per menit)
export let lastSleepLabel = '';

// ---------- status sinkron (v41): satu klik di ikon awan → status lengkap + Sinkron sekarang ----------
export function syncSummary() {
  switch (sync.status) {
    case 'disabled': return { tone: 'muted', text: 'Data hanya tersimpan di browser ini. Aktifkan backup ke GitHub Gist supaya aman saat ganti perangkat.' };
    case 'saved': return { tone: 'ok', text: 'Semua perubahan sudah tersimpan di Gist.' };
    case 'pending': return { tone: 'warn', text: 'Ada perubahan yang belum terkirim; dikirim otomatis sebentar lagi.' };
    case 'saving': case 'checking': return { tone: 'info', text: 'Sedang sinkron…' };
    case 'offline': return { tone: 'warn', text: 'Offline. Perubahan disimpan di perangkat ini dan dikirim saat online.' };
    case 'conflict': return { tone: 'err', text: 'Data di cloud diubah dari perangkat lain. Pilih versi yang dipakai.' };
    case 'locked': return { tone: 'warn', text: 'Backup terenkripsi butuh passphrase untuk sinkron.' };
    case 'error': return { tone: 'err', text: `Sinkron gagal: ${sync.message || 'kesalahan tidak diketahui'}` };
    default: return { tone: 'muted', text: '' };
  }
}
export function openSyncMenu(anchor) {
  const sum = syncSummary();
  const [, label] = ui.syncLabel(sync.status);
  const on = sync.connected;
  const busy = sync.status === 'saving' || sync.status === 'checking';
  openMenu(anchor, [
    { heading: label },
    sum.text && { note: sum.text, tone: sum.tone },
    on && { note: store.cloud.lastSyncedAt ? `Sinkron terakhir ${timeAgo(store.cloud.lastSyncedAt)}` : 'Belum pernah sinkron', icon: 'clock', tone: 'muted' },
    on && { label: sync.status === 'conflict' ? 'Selesaikan konflik…' : sync.status === 'locked' ? 'Masukkan passphrase…' : 'Sinkron sekarang', icon: 'refresh', disabled: busy || navigator.onLine === false, action: () => sync.syncNow() },
    on && { label: 'Riwayat versi & pulihkan…', icon: 'history', action: () => openSettings('backup') },
    { label: on ? 'Setelan sinkron…' : 'Aktifkan backup ke GitHub Gist…', icon: 'cloud', action: () => openSettings('cloud') },
  ]);
}


/** Pasang event & buat objek bagian ini (dipanggil sekali dari main.js, urutannya penting). */
export function setupActions() {
  window.addEventListener('hashchange', () => { const c = takeShareFromUrl(); if (c) receiveShare(c); else takeInvite(); });
  window.addEventListener('mtv-autotag-all', autoTagAll);
  // Shift+klik tidak ikut menyorot teks di daftar
  $('video-list').addEventListener('mousedown', (e) => { if (e.shiftKey && e.target.closest('.vrow')) e.preventDefault(); });
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
  sleepTimer.onChange(() => {
    const l = sleepTimer.label();
    if (l !== lastSleepLabel) { lastSleepLabel = l; renderDockAll(); }
  });
  // "x menit lalu" di tooltip tetap segar
  setInterval(() => { if (document.visibilityState === 'visible') ui.renderSyncBadge(sync, store); }, 60000);
}
