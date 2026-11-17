// app-events.js — bagian dari main.js (dipecah di v44). Lihat main.js untuk urutan setup.

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
import { $, ambLater, local, openPalette, openSettings, player, sleepTimer } from './app-state.js';
import { bar, density, openDupesDialog, playFromEntry, rememberQueueSource, render, renderDockAll, setDensity, syncQueueWithSource, visibleEntries } from './app-library.js';
import { addTarget, autoTagAll, checkHealth, importSpotify, inviteFriends, openWrapped } from './app-actions.js';
import { closeSidebar, lyricsFromLobby, openAddSheet, openNowPlaying, showShortcuts, toggleLyrics, toggleQueue } from './app-input.js';

export let media, miniPip, lyricsPanel, lobby;
export let nowPanel = null; // panel Sedang diputar (PC lebar), dibuat setelah panel lirik ada






export async function toggleMiniPip() {
  if (!pipSupported()) { toast('Mini player mengambang butuh Chrome atau Edge versi baru di PC.', 'info'); return; }
  try { const on = await miniPip.toggle(); $('dock-pip').classList.toggle('on', !!on); } catch (e) { toast(`Mini player tidak bisa dibuka: ${e.message}`, 'error'); }
}
export let tick = 0;
export let lastListenAt = Date.now();


// ---------- mode offline yang lebih jelas (v44) ----------
export function renderOffline() {
  const off = navigator.onLine === false;
  $('offline-pill').hidden = !off;
  document.body.classList.toggle('is-offline', off);
}

// ---------- latar belakang (HP): layar mati / pindah aplikasi ----------
// Sejak 2026 YouTube menghentikan pemutaran di browser HP begitu aplikasi ditinggal (kecuali Premium di
// aplikasi YouTube). Yang bisa kita lakukan: tahu bahwa lagunya berhenti (supaya tombol, notifikasi, waktu
// dengar, dan antrean tidak salah), lalu melanjutkannya begitu aplikasi dibuka lagi.
export let bgLastT = -1;
export let bgStill = 0;
export let bgToldOnce = false;

export let listenBuf = 0;
export function addListenBuffered(sec) {
  listenBuf += sec;
  if (listenBuf >= 15) { addListen(listenBuf); listenBuf = 0; } // tulis ke penyimpanan tiap ±15 detik
}
/** Jalankan aksi data-action yang sama seperti tombol di UI (dipakai command palette). */
export function fire(action, data = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.hidden = true;
  b.dataset.action = action;
  Object.assign(b.dataset, data);
  document.body.appendChild(b);
  b.click();
  b.remove();
}

export function openCommandPalette() {
  const go = (view) => () => { closeSidebar(); store.setView(view); local.query = ''; $('search').value = ''; window.scrollTo({ top: 0 }); };
  const views = [['all', 'Semua video', 'grid'], ['mix', 'Mix untukmu', 'sparkle'], ['favorites', 'Favorit', 'heart'], ['unwatched', 'Belum ditonton', 'checkCircle'], ['history', 'Riwayat', 'history']];
  const cur = store.ui.view;
  const items = [
    ...store.data.playlists.map((p) => ({ group: 'Playlist', label: p.name, hint: `${p.items.length} lagu${`pl:${p.id}` === cur ? ' · dibuka' : ''}`, icon: 'music', run: go(`pl:${p.id}`) })),
    ...views.map(([v, l, ic]) => ({ group: 'Koleksi', label: l, icon: ic, hint: v === cur ? 'dibuka' : '', run: go(v) })),
    ...store.allTags().map((t) => ({ group: 'Tag', label: `#${t.name}`, hint: `${t.count} lagu`, icon: 'tag', hideEmpty: store.allTags().length > 6, run: go(`tag:${t.key}`) })),
    { group: 'Aksi', label: LANG === 'en' ? 'Bahasa: Indonesia' : 'Language: English', icon: 'translate', keywords: 'bahasa language english indonesia inggris', run: () => setLang(LANG === 'en' ? 'id' : 'en') },
    { group: 'Lobby', label: 'Buka Lobby', icon: 'sofa', keywords: 'lobby santai lofi suasana ambient', run: () => lobby.open() },
    { group: 'Lobby', label: 'Suasana kamar (lokasi, cuaca, waktu)', icon: 'cloud', keywords: 'lobby suasana cuaca lokasi pemandangan', hideEmpty: true, run: () => lobby.openScene() },
    { group: 'Lobby', label: 'Fokus (Pomodoro)', icon: 'timer', keywords: 'lobby fokus pomodoro belajar kerja', hideEmpty: true, run: () => lobby.openFocus() },
    { group: 'Lobby', label: 'Timer tidur', icon: 'moon', keywords: 'lobby tidur sleep timer', hideEmpty: true, run: () => lobby.openSleep() },
    { group: 'Lobby', label: 'Suara alam (mixer)', icon: 'sliders', keywords: 'hujan rain ambient noise suara', run: () => lobby.openMixer() },
    { group: 'Aksi', label: 'Tag otomatis dari judul untuk semua lagu', icon: 'tag', keywords: 'tag otomatis live cover remix acoustic lyrics', hideEmpty: true, run: () => autoTagAll() },
    resumeOffer && { group: 'Aksi', label: 'Lanjutkan sesi terakhir', icon: 'play', keywords: 'resume lanjut terakhir sesi continue', run: () => resumeSession() },
    { group: 'Aksi', label: 'Tambah lagu (tempel link)', icon: 'link', keywords: 'add tambah video', run: () => openAddSheet(true) },
    { group: 'Aksi', label: 'Cari lagu di YouTube', icon: 'search', keywords: 'search youtube', run: () => fire('yt-search') },
    { group: 'Aksi', label: 'Import playlist YouTube', icon: 'download', keywords: 'import', run: () => fire('yt-import') },
    { group: 'Aksi', label: 'Playlist baru', icon: 'plus', keywords: 'buat new playlist', run: () => fire('new-playlist') },
    player.current && { group: 'Aksi', label: player.isPlaying ? 'Jeda' : 'Putar', icon: player.isPlaying ? 'pause' : 'play', keywords: 'play pause putar jeda', run: () => player.toggle() },
    player.current && { group: 'Aksi', label: 'Lagu berikutnya', icon: 'next', keywords: 'next skip', run: () => player.next() },
    player.current && { group: 'Aksi', label: 'Lirik', icon: 'mic', keywords: 'lyrics', run: () => toggleLyrics(true) },
    { group: 'Aksi', label: 'Antrean', icon: 'queue', keywords: 'queue', run: () => toggleQueue(true) },
    { group: 'Aksi', label: 'Statistik mendengarkan', icon: 'chart', keywords: 'stats', run: () => openStatsDialog(store, { onPlay: playVideoById }) },
    ...ui.DENSITIES.map(([k, ic, l]) => ({ group: 'Tampilan', label: l, icon: ic, hint: density() === k ? 'aktif' : '', keywords: 'view mode density', hideEmpty: true, run: () => setDensity(k) })),
    { group: 'Tampilan', label: `Tema: ${{ auto: 'otomatis', light: 'terang', dark: 'gelap' }[store.ui.theme] || 'otomatis'} → ganti`, icon: 'contrast', keywords: 'theme dark light gelap terang', hideEmpty: true,
      run: () => { const nx = { auto: 'dark', dark: 'light', light: 'auto' }; store.ui.theme = nx[store.ui.theme] || 'dark'; store.saveUi(); } },
    { group: 'Lainnya', label: 'Setelan', icon: 'settings', keywords: 'settings pengaturan', run: () => openSettings('general') },
    { group: 'Lainnya', label: 'Cloud Sync', icon: 'cloud', keywords: 'gist sync', hideEmpty: true, run: () => openSettings('cloud') },
    { group: 'Lainnya', label: 'Backup & export', icon: 'upload', keywords: 'backup export import', hideEmpty: true, run: () => openSettings('backup') },
    { group: 'Lainnya', label: 'Panduan mulai cepat', icon: 'sparkle', keywords: 'onboarding tutorial panduan', run: () => { store.ui.qsDone = false; store.saveUi(); window.scrollTo({ top: 0 }); } },
    { group: 'Lainnya', label: 'Apa yang baru', icon: 'gift', keywords: 'changelog update whats new', hideEmpty: true, run: () => showWhatsNew() },
    { group: 'Aksi', label: 'Periksa video rusak', icon: 'heartPulse', keywords: 'health dihapus privat broken', run: () => checkHealth() },
    { group: 'Aksi', label: `Wrapped ${new Date().getFullYear()}`, icon: 'gift', keywords: 'wrapped rekap tahunan recap tahun statistik', run: () => openWrapped() },
    { group: 'Aksi', label: 'Mode karaoke', icon: 'mic', keywords: 'karaoke lirik nyanyi sing', run: () => { if (!lyricsPanel.karaoke()) { if ($('lyrics-panel').hidden) fire('lyrics-toggle'); toast('Tunggu liriknya termuat, lalu tekan tombol Karaoke di panel lirik.', 'info'); } } },
    { group: 'Aksi', label: 'Kirim lagu ke antrean teman', icon: 'share', keywords: 'teman friend kirim share antrean bareng', run: () => sendQueueDialog(store, []) },
    { group: 'Aksi', label: 'Undang teman mengisi antrean', icon: 'share', keywords: 'teman undang invite antrean bareng party', run: () => inviteFriends() },
    pipSupported() && !isPhone() && { group: 'Aksi', label: 'Mini player mengambang', icon: 'pip', keywords: 'pip mini player floating jendela', run: () => toggleMiniPip() },
    { group: 'Aksi', label: 'Import dari Spotify', icon: 'music', keywords: 'spotify import csv exportify', run: () => importSpotify() },
    { group: 'Aksi', label: 'Cari lagu ganda', icon: 'merge', keywords: 'duplikat duplicate ganda dobel sama gabung merge', run: () => openDupesDialog() },
    player.current && { group: 'Aksi', label: sleepTimer.endOfTrack ? 'Batal berhenti setelah lagu ini' : 'Berhenti setelah lagu ini', icon: 'pause', keywords: 'stop sleep tidur akhir lagu', run: () => sleepTimer.set(sleepTimer.endOfTrack ? 0 : 'track') },
    sync.connected && { group: 'Aksi', label: 'Sinkron sekarang', icon: 'refresh', keywords: 'sync gist cloud backup', run: () => sync.syncNow() },
    { group: 'Tampilan', label: `Mode hemat: ${store.ui.lite === true ? 'aktif' : 'mati'} → ganti`, icon: 'leaf', keywords: 'hemat baterai lite ringan data kuota animasi', hideEmpty: true,
      run: () => { store.ui.lite = store.ui.lite !== true; store.saveUi(); toast(store.ui.lite ? 'Mode hemat aktif.' : 'Mode hemat mati.', 'info'); } },
    { group: 'Tampilan', label: `Bersihkan judul: ${store.ui.cleanTitles !== false ? 'aktif' : 'mati'} → ganti`, icon: 'type', keywords: 'judul official video bersih title clean', hideEmpty: true,
      run: () => { store.ui.cleanTitles = store.ui.cleanTitles === false; store.saveUi(); } },
    { group: 'Lainnya', label: 'Pintasan keyboard', icon: 'keyboard', keywords: 'shortcut', hideEmpty: true, run: () => showShortcuts() },
  ].filter(Boolean);
  const all = store.viewEntries('all');
  openPalette({
    items,
    songs: (q) => filterEntries(all, q).slice(0, 8).map((e) => ({
      group: 'Lagu', label: titleOf(e.video) || e.youtubeId, hint: e.video.channel || '', thumb: e.youtubeId, run: () => playVideoById(e.youtubeId),
    })),
  });
}

export function playVideoById(id) {
  const e = store.viewEntries('all').find((x) => x.youtubeId === id);
  if (e) { rememberQueueSource(false); player.playList([e], 0); }
}



/** Ganti lagu yang sedang diputar (biasanya MV) dengan versi audionya supaya lirik pas. */
export async function findAudioVersion(info = {}) {
  if (!player.current) return;
  const oldId = player.current.youtubeId;
  const v = store.data.videos[oldId] || {};
  const current = { youtubeId: oldId, title: v.title || '', channel: v.channel || '', duration: v.duration || Math.round(player.duration()) };
  if (!info.track) {
    const g = guessArtistTrack(current.title, current.channel);
    info = { ...g, lyricDuration: 0, ...info, track: info.track || g.track, artist: info.artist || g.artist };
  }
  const res = await audioVersionDialog(store, { current, info });
  if (!res) return;
  if (info.lyricId) rememberLyrics(res.id, info.lyricId);
  let n = store.replaceInPlaylists(oldId, res.id, res.meta, res.mode);
  if (!n) { store.addVideos([res.id], addTarget()); store.updateVideo(res.id, res.meta); n = 1; }
  // Putar versi audio dari posisi yang sama di daftar (antrean ikut playlist).
  const entry = visibleEntries().find((e) => e.youtubeId === res.id);
  if (entry) playFromEntry(entry); else playVideoById(res.id);
  toast(res.mode === 'after' ? 'Versi audio ditambahkan setelah MV dan sedang diputar.' : 'Diganti ke versi audio. MV tetap ada di Semua video.', 'success', 6000);
}
// ---------- Lobby (js/lobby-host.js: modulnya baru dimuat saat Lobby pertama dibuka) ----------
/** Baris lirik yang sedang dinyanyikan (dipakai Lobby). */
export function currentLyricLine() {
  if (!player.current) return '';
  lyricsPanel.load();
  lyricsPanel.tick(player.time());
  const p = $('lyrics-panel').querySelector('.lyrics-lines.synced p.now');
  if (!p) return '';
  const clone = p.cloneNode(true);
  clone.querySelectorAll('.lyr-tr').forEach((n) => n.remove());
  return clone.textContent.trim();
}


// ---------- lanjut dari posisi terakhir (video panjang saja, seperti YouTube) ----------
export const RESUME_MIN_DURATION = 8 * 60;
export function savePosition(id) {
  if (!id || !player.current || player.current.youtubeId !== id) return;
  const t = player.time();
  const d = player.duration();
  if (d < RESUME_MIN_DURATION) return;
  store.setPosition(id, t > 30 && t < d - 30 ? t : 0);
}

// ---------- lanjutkan sesi terakhir (js/session.js) ----------
export let resumeOffer = null;
export let sessionTimer = 0;
export function persistSession() {
  clearTimeout(sessionTimer);
  sessionTimer = 0;
  if (!player.current) return;
  const time = player.state === 'ended' ? 0 : player.time();
  saveSession(snapshotSession(player, { time, source: local.queueSource }));
}
export const persistSoon = () => { clearTimeout(sessionTimer); sessionTimer = setTimeout(persistSession, 1200); };

export function offerResume(s) {
  const id = s.queue[s.order[s.pos]].youtubeId;
  const v = store.data.videos[id] || {};
  const d = v.duration || 0;
  if (d && s.t >= d - 5) s.t = 0;     // sudah di ujung lagu → mulai lagi dari awal
  if (s.t < 5) s.t = 0;
  resumeOffer = s;
  $('resume-thumb').src = thumbUrl(id, 'mqdefault');
  $('resume-title').textContent = titleOf(v) || 'Memuat judul…';
  const left = s.order.length - s.pos - 1;
  const parts = [];
  if (s.t) parts.push(d ? `${formatDuration(s.t)} / ${formatDuration(d)}` : formatDuration(s.t));
  if (left > 0) parts.push(`${left} lagu berikutnya`);
  parts.push(timeAgo(new Date(s.at).toISOString()));
  $('resume-sub').textContent = parts.join(' · ');
  $('resume-fill').style.width = `${d && s.t ? Math.min(100, (s.t / d) * 100) : 0}%`;
  $('resume-card').hidden = false;
  document.body.classList.add('has-resume');
}
export function hideResume() {
  resumeOffer = null;
  $('resume-card').hidden = true;
  document.body.classList.remove('has-resume');
}
export function resumeSession() {
  const s = resumeOffer;
  hideResume();
  if (!s) return;
  const src = s.source;
  local.queueSource = src && typeof src.view === 'string' && (!src.view.startsWith('pl:') || store.getPlaylist(src.view.slice(3))) ? src : null;
  player.restore(s);
}

// ---------- error tak terduga, kapasitas penyimpanan ----------

export let lastErrorToast = 0;
export function reportUnexpected(err) {
  const msg = (err && (err.message || err.reason || String(err))) || '';
  if (!msg || /^Script error\.?$/i.test(msg) || /ResizeObserver/.test(msg)) return; // dari iframe pihak ketiga
  console.error(err);
  if (Date.now() - lastErrorToast < 10000) return;
  lastErrorToast = Date.now();
  toast(`Terjadi kesalahan: ${String(msg).slice(0, 120)}. Data kamu tetap aman; coba ulangi.`, 'error', 7000);
}

export let quotaWarned = false;
export function checkQuota() {
  if (quotaWarned || store.idbOk) return; // IndexedDB: jauh di atas 5 MB, tidak perlu diperingatkan
  const size = store.storageSize();
  if (size > 4 * 1024 * 1024) {
    quotaWarned = true;
    toast('Penyimpanan browser hampir penuh (>4 MB dari ±5 MB). Export backup atau aktifkan Cloud Sync.', 'error', 9000,
      { label: 'Backup', fn: () => openSettings('backup') });
  }
}




/** Pasang event & buat objek bagian ini (dipanggil sekali dari main.js, urutannya penting). */
export function setupEvents() {
  // ---------- event dari store / player / sync ----------
  store.on((type, detail) => {
    if (type === 'change' && detail && detail.reason === 'play' && !['history', 'mix'].includes(store.ui.view)) {
      ui.renderSidebar(store); // jumlah putar berubah: daftar lagu di view ini tidak perlu digambar ulang
      return;
    }
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
  player.on((type) => { try { lobby.update(type); } catch { /* Lobby belum siap */ } });
  // animasi ekualiser di baris lagu: bergerak hanya saat benar-benar diputar
  player.on(() => document.body.classList.toggle('is-playing', !!player.current && player.isPlaying));
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
      logPlay(data.youtubeId);
      if (player.startAt > 0) {
        const from = player.startAt;
        toast(`Melanjutkan dari ${formatDuration(from)}.`, 'info', 6000, { label: 'Dari awal', fn: () => player.seek(player.bounds().start) });
        player.startAt = 0;
      }
    }
    if (type === 'ended' && data) store.setPosition(data.youtubeId, 0);
    if (type === 'state' && player.state === 'paused') savePosition(player.current && player.current.youtubeId);
    if (type === 'sleep') sleepTimer.trackEnded();
    if (type === 'track' && !data) openNowPlaying(false);
    if (type === 'track') applyTint(player.current ? player.current.youtubeId : null, store.ui.tint !== false);
    if ((type === 'track' || type === 'playing') && !$('lyrics-panel').hidden) lyricsPanel.load();
    if (type === 'error' && data && data.id && (data.code === 100 || data.code === 101 || data.code === 150)) {
      store.setAvailability({ [data.id]: data.code === 100 ? 'gone' : 'embed' });
    }
    if (type === 'error' && navigator.onLine === false) toast('Offline: memutar video YouTube butuh internet. Daftar lagu, lirik yang pernah dibuka, dan setelan tetap bisa dipakai.', 'info', 7000);
    else if (type === 'error') toast(data && data.skipping ? `${player.error} Melewati ke video berikutnya…` : player.error, 'error', 5000);
    renderDockAll();
    ui.renderQueue(player, store);
    // cukup tandai baris yang diputar (daftar tidak dibangun ulang setiap play/jeda)
    if (type === 'track' || type === 'state' || type === 'playing') ui.updatePlaying(player.current ? player.current.youtubeId : null, player.isPlaying);
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
  // ---------- notifikasi, layar kunci & tombol media keyboard (js/mediasession.js) ----------
  media = createMediaSession({
    player,
    enabled: () => store.ui.mediaKeys !== false,
    getMeta: () => {
      const cur = player.current;
      const v = cur && store.data.videos[cur.youtubeId];
      if (!v) return null;
      const src = local.queueSource && local.queueSource.view;
      const album = src && src.startsWith('pl:') ? (store.getPlaylist(src.slice(3)) || {}).name : src ? ui.viewTitle(src) : '';
      return { title: titleOf(v) || 'Memuat judul…', artist: (v.channel || '').replace(/\s*-\s*Topic$/, ''), album: album || 'MyTube Vault', art: (q) => thumbUrl(cur.youtubeId, q) };
    },
  });
  store.on((type) => { if (type === 'change') media.update(); });
  // ---------- mini player mengambang (PC, js/minipip.js) ----------
  miniPip = createMiniPip({
    player, icon,
    getInfo: () => {
      const cur = player.current;
      const v = cur && store.data.videos[cur.youtubeId];
      if (!v) return null;
      return { title: titleOf(v) || 'Memuat judul…', artist: v.channel || '', art: thumbUrl(cur.youtubeId, 'mqdefault'), favorite: v.favorite, toggleFavorite: () => store.toggleFavorite(v.youtubeId) };
    },
    onClose: () => $('dock-pip').classList.remove('on'),
  });
  $('dock-pip').hidden = !pipSupported() || isPhone();
  store.on((type) => { if (type === 'change' && miniPip.isOpen()) miniPip.render(); });
  window.addEventListener('mtv-pref', (e) => {
    if (e.detail === 'tint') applyTint(player.current ? player.current.youtubeId : null, store.ui.tint !== false);
    if (e.detail === 'mediaKeys') media.configure();
  });
  setInterval(() => {
    // Waktu dengar: selisih waktu nyata (tetap akurat walau timer diperlambat browser saat tab di belakang).
    const nowMs = Date.now();
    if (player.isPlaying) addListenBuffered(Math.min(30, (nowMs - lastListenAt) / 1000));
    lastListenAt = nowMs;
    if (!player.current) return;
    if (document.visibilityState === 'visible') {
      bar.renderTime();
      if (!$('lyrics-panel').hidden) lyricsPanel.tick(player.time());
      if (nowPanel) nowPanel.tick();
    }
    tick++;
    if (tick % 20 === 0 && player.isPlaying) { savePosition(player.current.youtubeId); persistSession(); } // tiap ±10 detik
  }, 500);
  // ---------- acak yang lebih rapi (v44): artis tidak berurutan, lagu yang baru diputar di belakang ----------
  player.shuffleFn = (list) => {
    const n = Math.min(40, Math.floor(list.length / 3));
    const rank = new Map(recentPlays(n).map((id, i) => [id, i]));
    const vid = (i) => { const q = player.queue[i]; return q && store.data.videos[q.youtubeId]; };
    return smartShuffle(list, {
      group: (i) => { const v = vid(i); return v ? (songKey(v.title, v.channel).split('|')[0] || artistKey(v.channel)) : ''; },
      recent: (i) => { const q = player.queue[i]; return q && rank.has(q.youtubeId) ? rank.get(q.youtubeId) : -1; },
    });
  };
  window.addEventListener('online', () => { renderOffline(); ui.renderBanner(store, sync); toast('Kembali online.', 'success', 2500); });
  window.addEventListener('offline', () => { renderOffline(); ui.renderBanner(store, sync); toast('Offline. Daftar lagu tetap bisa dibuka; memutar video butuh internet.', 'info', 6000); });
  renderOffline();
  setInterval(() => {
    if (document.visibilityState !== 'hidden' || player.state !== 'playing') { bgLastT = -1; bgStill = 0; return; }
    const t = player.time();
    bgStill = Math.abs(t - bgLastT) < 0.05 ? bgStill + 1 : 0;
    bgLastT = t;
    // ±4 detik tidak bergerak padahal "playing": iframe sudah dihentikan tanpa sempat memberi kabar
    if (bgStill >= 2) { player.markStalled(); bgStill = 0; }
  }, 2000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !player.systemPaused) return;
    if (store.ui.autoResume === false) {
      toast('Musik dijeda saat aplikasi ditinggal.', 'info', 7000, { label: 'Lanjutkan', fn: () => player.resumeAfterBackground() });
      return;
    }
    setTimeout(() => {
      if (document.visibilityState !== 'visible' || !player.resumeAfterBackground()) return;
      if (!bgToldOnce) {
        bgToldOnce = true;
        toast('Dilanjutkan. YouTube menghentikan musik saat layar mati atau aplikasi ditinggal (kecuali YouTube Premium di aplikasinya).', 'info', 8000);
      }
    }, 300);
  });
  window.addEventListener('pagehide', () => { if (listenBuf > 0) { addListen(listenBuf); listenBuf = 0; } });
  lyricsPanel = createLyricsPanel($('lyrics-panel'), {
    getTrack: () => {
      if (!player.current) return null;
      const v = store.data.videos[player.current.youtubeId] || {};
      return { youtubeId: player.current.youtubeId, title: v.title || '', channel: v.channel || '', duration: v.duration || player.duration() };
    },
    seek: (t) => player.seek(Math.max(0, t)),
    getTime: () => player.time(),
    onFindAudio: (info) => findAudioVersion(info),
  });
  nowPanel = createNowPanel({ store, player, lyrics: lyricsPanel, upcoming: () => player.upcoming() });
  lobby = createLobbyHost({
    store, player, icon, toast, sleepTimer, isPhone,
    openLyrics: lyricsFromLobby,
    getLyric: currentLyricLine,
    playSomething: () => {
      if (visibleEntries().length) fire('play-all');
      else if (store.viewEntries('all').length) { store.setView('all'); setTimeout(() => fire('play-all'), 50); }
      else { lobby.close(); openAddSheet(true); toast('Tambahkan lagu dulu, lalu putar dari Lobby.', 'info'); }
    },
    onOpenChange: (open) => {
      if (open) overlay.open('lobby', () => lobby.close());
      else overlay.close('lobby');
    },
    onAmbient: (amb) => {
      ambLater.mod = amb;
      amb.onChange(() => document.body.classList.toggle('ambient-on', amb.isPlaying()));
    },
  });
  // Sorot lirik lebih rapat (±0,2 dtk) selama panel lirik terbuka dan lagu berjalan.
  setInterval(() => {
    if (player.isPlaying && !$('lyrics-panel').hidden && document.visibilityState === 'visible') lyricsPanel.tick(player.time());
  }, 200);
  player.resumeLookup = (id) => {
    const v = store.data.videos[id];
    const pos = store.getPosition(id);
    return v && v.duration >= RESUME_MIN_DURATION && pos >= 60 && pos < v.duration - 30 ? pos : 0;
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && player.current) savePosition(player.current.youtubeId); });
  window.addEventListener('pagehide', () => { if (player.current) savePosition(player.current.youtubeId); });
  player.on((type, data) => {
    if (type === 'track' && !data) { clearTimeout(sessionTimer); saveSession(null); return; } // player dihentikan
    if (type === 'track' || type === 'queue' || type === 'state') persistSoon();
    if (type === 'track' && resumeOffer) hideResume();
  });
  window.addEventListener('pagehide', persistSession);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistSession(); });
  window.addEventListener('error', (e) => reportUnexpected(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportUnexpected(e.reason));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set-lang]');
    if (b && b.dataset.setLang !== LANG) setLang(b.dataset.setLang);
  });
  // Lobby pernah dipakai → siapkan lukisannya di latar belakang supaya langsung tampil saat dibuka
  // Setelan & palet perintah disiapkan saat senggang: aplikasi tetap cepat dibuka, dan membuka Setelan
  // pertama kali tidak perlu menunggu unduhan modulnya.
  setTimeout(() => {
    const go = () => { openSettings.warm(); openPalette.warm(); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 5000 }); else go();
  }, 2500);
  setTimeout(() => {
    if (!store.ui.lobby || lobby.isOpen() || document.hidden || store.ui.lite === true) return; // mode hemat: tidak melukis di latar
    const go = () => { if (!lobby.isOpen() && !document.hidden) lobby.prewarm(); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 }); else go();
  }, 3500);
}
