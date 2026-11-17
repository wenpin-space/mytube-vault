// Titik masuk: menghubungkan store, sync, player, dan UI.

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
import { $, local, openSettings, player } from './app-state.js';
import { metaQueue, render, renderQS, setupLibrary } from './app-library.js';
import { receiveShare, setupActions, takeInvite } from './app-actions.js';
import { fillAdd, openAddSheet, setupInput } from './app-input.js';
import { lobby, media, offerResume, setupEvents } from './app-events.js';

await startTranslator(); // bahasa Inggris: tunggu kamusnya dulu supaya teks Indonesia tidak sempat tampil
installThumbFallback();

// Bagian aplikasi dipasang berurutan (dulu satu file main.js yang panjang).
setupLibrary();
setupActions();
setupInput();
setupEvents();

// ---------- start ----------
async function onboarding() {
  const choice = await modal({
    title: 'Selamat datang di MyTube Vault',
    body: `<p class="lang-switch" translate="no">${icon('translate')}<button type="button" class="link-btn" data-set-lang="id" ${LANG === 'id' ? 'aria-pressed="true"' : ''}>Bahasa Indonesia</button><span>·</span><button type="button" class="link-btn" data-set-lang="en" ${LANG === 'en' ? 'aria-pressed="true"' : ''}>English</button></p>
      <p>Playlist YouTube pribadi yang <b>tidak bergantung akun YouTube</b> — ganti akun sesering apa pun, playlist tetap ada.</p>
      <ul class="feature-list">
        <li>${icon('link')}<span>Tempel link YouTube (satu atau banyak sekaligus) untuk menambah video.</span></li>
        <li>${icon('music')}<span>Banyak playlist, urutan manual atau otomatis, player dengan shuffle, repeat, dan antrean.</span></li>
        <li>${icon('cloud')}<span>Opsional: backup otomatis ke GitHub Gist private milikmu, lengkap dengan riwayat versi dan enkripsi.</span></li>
      </ul>
      <p class="muted small">Ikuti kartu <b>Mulai cepat</b> di halaman utama. Langkahnya tercentang sendiri begitu selesai.</p>`,
    actions: [{ label: 'Mulai tanpa cloud', value: 'local' }, { label: 'Aktifkan cloud backup', value: 'cloud', variant: 'primary' }],
    dismissValue: 'local',
  });
  if (choice === 'cloud') openSettings('cloud');
  else openAddSheet(true);
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
await Promise.all([store.init(), initStats()]);
player.configure(store.data.settings.player);
if (store.ui.rate && store.ui.rate !== 1) player.rate = store.ui.rate;
sync.init();
render();
media.configure();
const missing = Object.values(store.data.videos).filter((v) => !v.title).map((v) => v.youtubeId).slice(0, 50);
if (missing.length) metaQueue.add(missing);
setupPwa((available) => {
  local.installable = !!available && !isStandalone();
  document.querySelectorAll('.install-btn').forEach((b) => { b.hidden = !available || isStandalone(); });
  renderQS();
}, () => toast('Versi baru MyTube Vault tersedia.', 'info', 15000, { label: 'Muat ulang', fn: () => location.reload() }));
document.body.classList.toggle('standalone', isStandalone());
const shareCode = takeShareFromUrl();
const launched = handleLaunch() || !!shareCode || takeInvite();
if (shareCode) receiveShare(shareCode);
if (store.isFresh && !launched) onboarding();
maybeShowWhatsNew({ fresh: store.isFresh || launched });
if (!store.isFresh && !launched && store.ui.lobby && store.ui.lobby.startup) setTimeout(() => lobby.open(), 300);
// ---------- backup otomatis (js/autobackup.js) ----------
if (!store.ui.firstSeenAt) { store.ui.firstSeenAt = new Date().toISOString(); store.saveUiQuiet(); }
setTimeout(async () => {
  await makeAutoBackup(store);
  if (!backupDue(store)) return;
  const days = Math.round((Date.now() - (Date.parse(store.ui.lastBackupFileAt || store.ui.firstSeenAt) || Date.now())) / 86400000);
  toast(store.ui.lastBackupFileAt ? `Sudah ${days} hari sejak file backup terakhir diunduh.` : 'Belum pernah mengunduh file backup. Simpan satu untuk berjaga-jaga.', 'info', 12000, {
    label: 'Unduh backup',
    fn: async () => { await downloadBackup(store); toast('File backup diunduh.', 'success'); },
  });
  store.ui.backupSnoozeUntil = new Date(Date.now() + 3 * 86400000).toISOString(); // jangan ingatkan lagi 3 hari ke depan
  store.saveUiQuiet();
}, 20000);

if (!store.isFresh && !launched && !player.current) {
  const last = loadSession({ exists: (id) => !!store.data.videos[id] });
  if (last) offerResume(last);
}
