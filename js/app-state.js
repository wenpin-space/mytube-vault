// app-state.js — bagian dari main.js (dipecah di v44). Lihat main.js untuk urutan setup.

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

// Dialog besar yang jarang dibuka dimuat saat pertama dipakai (bukan saat aplikasi dibuka).
export const later = (path, name) => {
  const load = once(() => import(path));
  const fn = (...a) => load().then((m) => m[name](...a));
  fn.warm = () => load().catch(() => {}); // siapkan lebih dulu saat aplikasi senggang
  return fn;
};
export const openSettings = later('./settings.js', 'openSettings');
export const openPalette = later('./palette.js', 'openPalette');
export const healthCheckDialog = later('./health.js', 'healthCheckDialog');
export const dupesDialog = later('./dupes-ui.js', 'dupesDialog');
export const spotifyImportDialog = later('./spotify.js', 'spotifyImportDialog');
export const wrappedDialog = later('./wrapped.js', 'wrappedDialog');

export const PAGE = 200;
export const $ = (id) => document.getElementById(id);
export const player = new Player('yt-player');
export const local = {
  query: '', qf: [], limit: PAGE, multi: false, lastView: null,
  selecting: false, selected: new Set(), // mode pilih banyak
  flash: new Set(),                      // video yang baru ditambahkan (disorot sebentar)
  playedTrack: null,                     // untuk mencatat riwayat sekali per lagu
};

// Timer tidur bersama (menu player & Lobby). Suara alam baru dimuat bersama Lobby, jadi timer memakai
// perantara yang tidak berbuat apa-apa selama modul suara belum ada.
export const ambLater = { mod: null, setMaster(...a) { if (this.mod) this.mod.setMaster(...a); }, stopAll() { if (this.mod) this.mod.stopAll(); } };
export const sleepTimer = createSleepTimer({ player, amb: ambLater, toast, getMaster: () => { const m = ((store.ui && store.ui.lobby) || {}).master; return m == null ? 0.8 : m; } });
