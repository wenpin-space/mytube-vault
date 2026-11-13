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
import { enableVideoTaps } from './videotap.js';
import { enableSwipe } from './swipe.js';
import { enableNavDrag } from './navdrag.js';
import { missingAutoTags, applyAutoTags } from './autotag.js';
import { titleOf, setCleanTitles } from './titles.js';
import { similarTo } from './dupes.js';
import { classifyLinks, idsToAdd } from './addpreview.js';
import { enableStageFloat, trackStageSpace, enableQueueDrag } from './panels.js';
import { createSleepTimer, SLEEP_PRESETS } from './sleep.js';
import { renderQuickstart, toggleQuickstart, maybeShowWhatsNew, showWhatsNew } from './onboard.js';
import { sortEntries, filterEntries, quickFilter, toggleFilter, QUICK_FILTERS, animateOut, copyText, downloadText, escapeHtml, slugify, formatDuration, timeAgo } from './utils.js';
import {
  isPhone, overlay, setupPwa, promptInstall, isStandalone, takeLaunchParams,
} from './mobile.js';
import { libraryPicker, ytSearchDialog, youtubeAppUrl, ytPlaylistImportDialog, audioVersionDialog, getApiKey } from './sources.js';
import { buildSharePayload, encodeShare, decodeShare, shareUrl, takeShareFromUrl } from './share.js';
import { logPlay, addListen, openStatsDialog } from './stats.js';
import { createLyricsPanel, guessArtistTrack, rememberLyrics } from './lyrics.js';
import { startTranslator, LANG, setLang } from './i18n.js';

await startTranslator(); // bahasa Inggris: tunggu kamusnya dulu supaya teks Indonesia tidak sempat tampil
installThumbFallback();

// Dialog besar yang jarang dibuka dimuat saat pertama dipakai (bukan saat aplikasi dibuka).
const later = (path, name) => {
  const load = once(() => import(path));
  const fn = (...a) => load().then((m) => m[name](...a));
  fn.warm = () => load().catch(() => {}); // siapkan lebih dulu saat aplikasi senggang
  return fn;
};
const openSettings = later('./settings.js', 'openSettings');
const openPalette = later('./palette.js', 'openPalette');
const healthCheckDialog = later('./health.js', 'healthCheckDialog');
const dupesDialog = later('./dupes-ui.js', 'dupesDialog');

const PAGE = 200;
const $ = (id) => document.getElementById(id);
const player = new Player('yt-player');
const local = {
  query: '', qf: [], limit: PAGE, multi: false, lastView: null,
  selecting: false, selected: new Set(), // mode pilih banyak
  flash: new Set(),                      // video yang baru ditambahkan (disorot sebentar)
  playedTrack: null,                     // untuk mencatat riwayat sekali per lagu
};

// Timer tidur bersama (menu player & Lobby). Suara alam baru dimuat bersama Lobby, jadi timer memakai
// perantara yang tidak berbuat apa-apa selama modul suara belum ada.
const ambLater = { mod: null, setMaster(...a) { if (this.mod) this.mod.setMaster(...a); }, stopAll() { if (this.mod) this.mod.stopAll(); } };
const sleepTimer = createSleepTimer({ player, amb: ambLater, toast, getMaster: () => { const m = ((store.ui && store.ui.lobby) || {}).master; return m == null ? 0.8 : m; } });

// ---------- Urungkan (v41): satu pola untuk semua hapus/pindah, juga lewat Ctrl+Z ----------
let lastUndo = null;
/** Tampilkan toast dengan tombol Urungkan; Ctrl+Z menjalankan Urungkan terakhir (±1 menit). */
function offerUndo(msg, undoFn, { type = 'info', ms = 8000, label = 'Urungkan', done = 'Dibatalkan.' } = {}) {
  const u = { fn: undoFn, at: Date.now(), done };
  lastUndo = u;
  u.toast = toast(msg, type, ms, { label, fn: () => runUndo(u) });
}
function runUndo(u = lastUndo) {
  if (!u || u.used) return false;
  u.used = true;
  if (lastUndo === u) lastUndo = null;
  if (u.toast) u.toast.dismiss();
  u.fn();
  if (u.done) toast(u.done, 'info', 2200);
  return true;
}
/** Jalankan perubahan besar setelah menyimpan salinan data; hasil: fungsi untuk mengembalikannya. */
function withUndo(fn, opts) {
  const cp = store.checkpoint();
  const result = fn();
  return { result, undo: () => store.restoreCheckpoint(cp, opts) };
}

let nowPanel = null; // panel Sedang diputar (PC lebar), dibuat setelah panel lirik ada
/** Player bawah + panel Sedang diputar. */
function renderDockAll() {
  ui.renderDock(player, store, dockOpts());
  if (nowPanel) nowPanel.render();
}

// Bilah player bawah (js/playerbar.js) & panel yang bisa digeser (js/panels.js)
const bar = createPlayerBar({ player, store, ui, toast });
enableStageFloat({ store });
trackStageSpace();
enableQueueDrag({ player });

const metaQueue = createMetaQueue((id, meta) => {
  const v = store.data.videos[id];
  if (!v) return;
  if (meta && !v.title) {
    // tag otomatis dari judul (live, cover, remix, …) untuk lagu yang baru ditambahkan
    const auto = store.ui.autoTag !== false ? missingAutoTags({ title: meta.title, tags: v.tags }) : [];
    store.updateVideo(id, { title: meta.title, channel: v.channel || meta.channel, ...(auto.length ? { tags: [...v.tags, ...auto] } : {}) });
    noteSimilar(id);
  }
  else renderMain();
});

// ---------- lagu ganda (js/dupes.js) ----------
/** Lagu yang baru ditambahkan ternyata lagu yang sama dengan yang sudah ada → beri tahu (dikumpulkan dulu sebentar). */
const similarNew = new Set();
let similarTimer = 0;
function noteSimilar(id) {
  const v = store.data.videos[id];
  if (!v || Date.now() - Date.parse(v.firstAddedAt) > 10 * 60000) return; // hanya lagu yang baru saja ditambahkan
  if (!similarTo(store.data.videos, id).length) return;
  similarNew.add(id);
  clearTimeout(similarTimer);
  similarTimer = setTimeout(() => {
    const ids = [...similarNew].filter((x) => store.data.videos[x]);
    similarNew.clear();
    if (!ids.length) return;
    const one = ids.length === 1 ? store.data.videos[similarTo(store.data.videos, ids[0])[0]] : null;
    toast(one ? `Lagu ini sepertinya sudah ada: “${titleOf(one) || one.youtubeId}”.` : `${ids.length} lagu baru sepertinya sudah ada di library.`, 'info', 9000,
      { label: 'Periksa', fn: () => openDupesDialog({ ids }) });
  }, 1500);
}
async function openDupesDialog(opts = {}) {
  const res = await dupesDialog(store, opts);
  if (!res || !res.length) return;
  const { result: n, undo } = withUndo(() => res.reduce((sum, g) => sum + store.mergeVideos(g.keep, g.drops), 0));
  if (n) offerUndo(`${res.length === 1 ? 'Lagu ganda digabung' : `${res.length} lagu ganda digabung`} · ${n} video dihapus.`, undo, { type: 'success', ms: 9000 });
}

// ---------- helper view ----------
function currentSort() {
  const v = store.ui.view;
  return store.ui.sort[v] || (v.startsWith('pl:') || v === 'history' || v === 'mix' ? 'manual' : 'addedNewest');
}
function canReorder() {
  return store.ui.view.startsWith('pl:') && currentSort() === 'manual' && !local.query.trim() && !local.qf.length;
}
// ---------- ubah urutan: satu lagu atau banyak sekaligus ----------
/** Pindahkan entri (urutan di antara mereka tetap) supaya mulai di posisi `to` (0 = paling atas). */
function moveBlock(ents, to, { scroll = true } = {}) {
  const pl = store.currentPlaylist();
  if (!pl || !ents.length) return;
  const n = ents.length; const max = pl.items.length - n;
  const at = Math.max(0, Math.min(max, to));
  const before = store.moveItems(pl.id, ents.map((e) => e.itemId), at);
  if (!before) { toast(n > 1 ? 'Lagu-lagu ini sudah di posisi itu.' : 'Lagu ini sudah di posisi itu.'); return; }
  flashVideos(ents.map((e) => e.youtubeId), scroll);
  const msg = n > 1
    ? (at === 0 ? `${n} lagu dipindah ke paling atas.` : at === max ? `${n} lagu dipindah ke paling bawah.` : `${n} lagu dipindah ke nomor ${at + 1}–${at + n}.`)
    : (at === 0 ? 'Dipindah ke paling atas.' : at === max ? 'Dipindah ke paling bawah.' : `Dipindah ke nomor ${at + 1}.`);
  offerUndo(msg, () => store.setOrder(pl.id, before), { type: 'success', ms: 6000, done: 'Urutan dikembalikan.' });
}
/** Tanya nomor tujuan (1 = paling atas). */
async function askPosition(ents) {
  const pl = store.currentPlaylist();
  if (!pl) return;
  const n = ents.length; const max = pl.items.length - n + 1;
  const cur = Math.min(...ents.map((e) => e.index)) + 1;
  const v = await positionDialog(n > 1 ? `Pindahkan ${n} lagu ke nomor…` : 'Pindahkan ke nomor…', { max, value: cur, hint: n > 1 ? `Lagu terpilih dikumpulkan berurutan mulai nomor itu (1–${max}).` : `1 = paling atas, ${max} = paling bawah.` });
  if (v) moveBlock(ents, v - 1);
}
/** Klik nomor urut sebuah lagu → ketik nomor baru langsung di tempat. */
function editIndex(rowEl, entry) {
  const pl = store.currentPlaylist();
  const idx = rowEl.querySelector('.idx');
  if (!pl || !idx || idx.querySelector('input')) return;
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '1'; inp.max = String(pl.items.length); inp.value = String(entry.index + 1);
  inp.className = 'idx-input'; inp.setAttribute('aria-label', 'Nomor urutan baru'); inp.inputMode = 'numeric';
  idx.replaceChildren(inp); idx.classList.add('editing');
  inp.focus(); inp.select();
  let done = false;
  const finish = (ok) => {
    if (done) return; done = true;
    const v = Math.round(Number(inp.value));
    if (ok && v >= 1 && v - 1 !== entry.index) moveBlock([entry], v - 1); else renderMain();
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('click', (e) => e.stopPropagation());
}
/** Menu "Urutan" untuk lagu-lagu terpilih. */
function openOrderMenu(anchor) {
  const ents = selectedEntries();
  const pl = store.currentPlaylist();
  if (!ents.length || !pl) return;
  const first = Math.min(...ents.map((e) => e.index));
  const spread = Math.max(...ents.map((e) => e.index)) - first + 1 > ents.length;
  openMenu(anchor, [
    { label: 'Ke paling atas', icon: 'top', action: () => moveBlock(ents, 0) },
    { label: 'Ke nomor…', icon: 'sort', action: () => askPosition(ents) },
    { label: 'Ke paling bawah', icon: 'down', action: () => moveBlock(ents, pl.items.length) },
    spread && { label: `Kumpulkan di nomor ${first + 1}`, icon: 'rows', action: () => moveBlock(ents, first) },
    'sep',
    { label: 'Naik satu (Alt+↑)', icon: 'up', action: () => store.nudgeItems(pl.id, ents.map((e) => e.itemId), -1) },
    { label: 'Turun satu (Alt+↓)', icon: 'down', action: () => store.nudgeItems(pl.id, ents.map((e) => e.itemId), 1) },
  ]);
}

function visibleEntries() {
  return sortEntries(quickFilter(filterEntries(store.viewEntries(), local.query), local.qf), currentSort());
}
function density() {
  const d = store.ui.density;
  return d === 'compact' || d === 'grid' ? d : 'comfy';
}
function setDensity(d) {
  store.ui.density = d;
  store.saveUi();
}
/** Tag paling sering di view ini (untuk chip filter cepat). */
function topTagsOf(entries, n = 4, keep = new Set()) {
  const m = new Map();
  for (const { video: v } of entries) for (const t of v.tags || []) {
    const k = t.toLocaleLowerCase('id');
    const cur = m.get(k) || { key: k, name: t, n: 0 };
    cur.n++;
    m.set(k, cur);
  }
  // tag yang sedang dipakai sebagai filter selalu ikut (walau semua lagu di hasil memilikinya)
  for (const k of keep) if (!m.has(k)) m.set(k, { key: k, name: (store.allTags().find((t) => t.key === k) || { name: k }).name, n: 0 });
  const list = [...m.values()].filter((t) => keep.has(t.key) || t.n < entries.length).sort((a, b) => Number(keep.has(b.key)) - Number(keep.has(a.key)) || b.n - a.n);
  return list.slice(0, Math.max(n, keep.size));
}
/** Semua tag di hasil sekarang, untuk digabung dengan filter lain (chip "Tag lain"). */
function openTagFilterMenu(anchor) {
  const searched = filterEntries(store.viewEntries(), local.query);
  const base = quickFilter(searched, local.qf);
  const active = new Set(local.qf);
  const tags = topTagsOf(base, 999, new Set([...active].filter((x) => x.startsWith('tag:')).map((x) => x.slice(4))));
  openMenu(anchor, [
    { heading: 'Gabungkan dengan tag' },
    ...tags.map((t) => ({
      label: `#${t.name}`, keep: true, userText: true, checked: active.has(`tag:${t.key}`), hint: active.has(`tag:${t.key}`) ? '' : String(quickFilter(searched, toggleFilter(local.qf, `tag:${t.key}`)).length),
      action: () => { local.qf = toggleFilter(local.qf, `tag:${t.key}`); local.limit = PAGE; renderMain(); },
    })),
  ]);
}
function entryByKey(key) {
  return store.viewEntries().find((e) => e.key === key) || null;
}
/** Setelan tampilan v41: judul bersih & mode hemat. */
function applyPrefs() {
  setCleanTitles(store.ui.cleanTitles !== false);
  const lite = store.ui.lite === true;
  setLiteThumbs(lite);
  document.body.classList.toggle('lite', lite);
}
function applyTheme() {
  const t = store.ui.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ---------- render ----------
function render() {
  applyTheme();
  applyPrefs();
  if (store.ui.view !== local.lastView) {
    local.limit = PAGE; local.qf = [];
    if (local.lastView !== null) {
      const m = $('main');
      m.classList.remove('view-enter'); void m.offsetWidth; m.classList.add('view-enter');
    }
  }
  ui.renderSidebar(store);
  renderAddTarget();
  renderMain();
  renderQS();
  ui.renderBanner(store, sync);
  ui.renderSyncBadge(sync, store);
  renderDockAll();
  ui.renderQueue(player, store);
  renderBottomNav();
  renderSelectBar();
  local.lastView = store.ui.view;
}

function renderQS() {
  const vids = Object.values(store.data.videos);
  renderQuickstart($('quickstart'), {
    videos: vids.length,
    played: vids.some((v) => v.lastPlayedAt),
    apiKey: !!getApiKey(),
    cloud: !!store.cloud.connected,
    standalone: isStandalone(),
    dismissed: !!store.ui.qsDone,
  }, { installable: local.installable });
}

function dockOpts() {
  return { sleepLabel: sleepTimer.label() };
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
  if (local.rowDrag) { local.renderLater = true; return; } // jangan ganti baris saat sedang ditarik
  const all = store.viewEntries();
  const sort = currentSort();
  const view = store.ui.view;
  const searched = filterEntries(all, local.query);
  const visible = sortEntries(quickFilter(searched, local.qf), sort);
  const duration = all.reduce((s, e) => s + (e.video.duration || 0), 0);
  const pl = store.currentPlaylist();
  ui.renderViewHead(store, { sort, total: all.length, visible: visible.length, query: local.query, filtered: !!(local.query.trim() || local.qf.length), duration, density: density(), coverIds: all.slice(0, 4).map((e) => e.youtubeId) });
  // filter gabungan: tag teratas dari hasil saat ini + tag yang sedang aktif
  const tagKeys = new Set(local.qf.filter((x) => x.startsWith('tag:')).map((x) => x.slice(4)));
  const top = view.startsWith('tag:') ? [] : topTagsOf(visible, 4, tagKeys);
  const allTagsHere = view.startsWith('tag:') ? [] : topTagsOf(visible, 999, tagKeys);
  ui.renderQuickFilters(searched, {
    active: local.qf, view, filters: QUICK_FILTERS, tags: top, shown: visible.length,
    countWith: (id) => quickFilter(searched, toggleFilter(local.qf, id)).length,
    moreTags: Math.max(0, allTagsHere.length - top.length),
  });

  const hint = $('list-hint');
  if (pl && sort !== 'manual' && all.length > 1) {
    hint.hidden = false;
    hint.innerHTML = `${icon('sort')}<span>Urutan otomatis aktif (tampilan saja — urutan asli tidak berubah).</span>
      <button type="button" class="link-btn" data-action="sort-manual">Kembali ke urutan manual</button>`;
  } else if (view === 'mix' && all.length) {
    hint.hidden = false;
    hint.innerHTML = `${icon('sparkle')}<span>Dipilih dari library-mu berdasarkan lagu, channel, dan tag yang sering kamu putar. Berganti tiap hari.</span>
      <button type="button" class="link-btn" data-action="play-all">Putar mix</button>`;
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
    quick: local.qf.length > 0,
    density: density(),
    view: store.ui.view,
    isPlaylist: !!pl,
    selecting: local.selecting,
    selected: local.selected,
    flashKeys: local.flash,
    progress: (id, duration) => {
      const t = store.getPosition(id);
      return t > 0 && duration > 0 ? Math.min(1, t / duration) : 0;
    },
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
  $('toggle-multi').querySelector('span').textContent = on ? 'Satu link' : 'Banyak link';
  $('toggle-multi').classList.toggle('on', on);
  feedback('');
  renderAddPreview();
  (on ? $('add-multi') : $('add-input')).focus();
}

// ---------- Banyak link: pratinjau sebelum disimpan (js/addpreview.js) ----------
function addPreviewData() {
  const pl = store.getPlaylist($('add-target').value);
  return classifyLinks($('add-multi').value, { videos: store.data.videos, inTarget: new Set(pl ? pl.items.map((i) => i.youtubeId) : []) });
}
function renderAddPreview() {
  const box = $('add-preview');
  const text = local.multi ? $('add-multi').value.trim() : '';
  if (!text) { box.hidden = true; box.innerHTML = ''; return; }
  const res = addPreviewData();
  const n = (st) => res.rows.filter((r) => r.status === st).length;
  const skip = !!local.skipLibrary;
  const willAdd = idsToAdd(res, { skipLibrary: skip }).length;
  const where = (id) => store.data.playlists.filter((p) => p.items.some((i) => i.youtubeId === id)).map((p) => p.name);
  const badge = { new: ['baru', 'ok'], lib: ['sudah di library', 'warn'], here: ['sudah di playlist ini', 'muted'] };
  const parts = [`<b>${willAdd} akan ditambahkan</b>`];
  if (n('lib')) parts.push(`${n('lib')} sudah di library`);
  if (n('here')) parts.push(`${n('here')} sudah di playlist ini (dilewati)`);
  if (res.dup) parts.push(`${res.dup} dobel`);
  if (res.invalid.length) parts.push(`${res.invalid.length} tidak valid`);
  box.hidden = false;
  box.innerHTML = `<p class="ap-sum">${parts.map((x) => `<span>${x}</span>`).join(' · ')}</p>
    ${res.rows.length ? `<ul class="ap-list">${res.rows.slice(0, 60).map((r) => {
      const v = store.data.videos[r.id];
      const t = (v && titleOf(v)) || r.id;
      const [lbl, cls] = badge[r.status];
      const pls = r.status === 'lib' ? where(r.id) : [];
      return `<li class="ap-row ${r.status}${r.status === 'lib' && skip ? ' skip' : ''}"><img src="${thumbUrl(r.id, 'default')}" alt="" loading="lazy" decoding="async">
        <span class="ap-t"${v && v.title ? ' translate="no"' : ''}>${escapeHtml(t)}</span>
        <span class="ap-b ${cls}"${pls.length ? ` title="${escapeHtml(pls.join(', '))}"` : ''}>${lbl}</span></li>`;
    }).join('')}${res.rows.length > 60 ? `<li class="ap-more muted small">…dan ${res.rows.length - 60} lainnya</li>` : ''}</ul>` : ''}
    ${n('lib') ? `<label class="check ap-skip"><input type="checkbox" data-ap="skip" ${skip ? 'checked' : ''}><span>Lewati lagu yang sudah ada di library (${n('lib')})</span></label>` : ''}
    ${res.lists.length ? `<div class="ap-lists">${res.lists.map((l) => `<button type="button" class="chip" data-ap-list="${escapeHtml(l)}">${icon('download')}<span>Import playlist YouTube</span></button>`).join('')}</div>` : ''}`;
}
let previewTimer = 0;
$('add-preview').addEventListener('change', (e) => { if (e.target.dataset.ap === 'skip') { local.skipLibrary = e.target.checked; renderAddPreview(); } });
$('add-preview').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ap-list]');
  if (b) importYtPlaylist({ url: `https://www.youtube.com/playlist?list=${b.dataset.apList}`, targetId: $('add-target').value });
});
$('add-target').addEventListener('change', () => { if (local.multi) renderAddPreview(); });

function handleAdd(e) {
  e.preventDefault();
  const target = $('add-target').value;
  if (local.multi) {
    const res = addPreviewData();
    const ids = idsToAdd(res, { skipLibrary: !!local.skipLibrary });
    if (!res.rows.length) {
      if (res.lists.length) { importYtPlaylist({ url: `https://www.youtube.com/playlist?list=${res.lists[0]}`, targetId: target }); return; }
      feedback(res.invalid.length ? `Tidak ada link valid (${res.invalid.length} link tidak valid).` : 'Belum ada link YouTube.', 'error');
      return;
    }
    if (!ids.length) { feedback('Semua lagu ini sudah ada — tidak ada yang ditambahkan.', 'error'); return; }
    const skipped = res.rows.length - ids.length;
    if (addIds(ids, target, { invalid: res.invalid.length, dup: res.dup, libSkipped: local.skipLibrary ? skipped - res.rows.filter((r) => r.status === 'here').length : 0 })) {
      $('add-multi').value = ''; setMulti(false);
    }
    return;
  }
  const raw = $('add-input').value.trim();
  if (!raw) { $('add-input').focus(); return; }
  // Beberapa link di satu kolom (diketik/ditempel berjajar) → tambahkan semuanya sekaligus.
  const many = parseMany(raw);
  if (many.valid.length > 1) {
    if (addIds(many.valid, target, { invalid: many.invalid.length, dup: many.duplicates })) $('add-input').value = '';
    return;
  }
  const id = extractYouTubeId(raw, { allowBareId: true });
  const listId = extractPlaylistId(raw);
  if (!id && listId) {
    // Link playlist YouTube → buka dialog import.
    $('add-input').value = '';
    feedback('');
    importYtPlaylist({ url: raw, targetId: target });
    return;
  }
  if (id && listId && !/^RD/.test(listId)) {
    setTimeout(() => toast('Link ini juga bagian dari sebuah playlist YouTube.', 'info', 8000,
      { label: 'Import seluruh playlist', fn: () => importYtPlaylist({ url: raw, targetId: target }) }), 400);
  }
  if (!id) {
    feedback('Link tidak valid. Tempel link video atau playlist YouTube (bukan channel).', 'error');
    $('add-form').classList.remove('shake');
    void $('add-form').offsetWidth;
    $('add-form').classList.add('shake');
    return;
  }
  if (addIds([id], target)) $('add-input').value = '';
}

/** Tambahkan video ke playlist + umpan balik. Banyak video sekaligus dapat tombol "Batalkan". */
function addIds(ids, target, { invalid = 0, dup = 0, libSkipped = 0 } = {}) {
  // lagu yang sudah ada di library (di playlist lain) ikut dihitung supaya tidak diam-diam jadi ganda
  const inLib = ids.filter((id) => store.data.videos[id]).length;
  const res = store.addVideos(ids, target);
  const pl = store.getPlaylist(target);
  const addedItemIds = res.added && pl ? pl.items.slice(-res.added).map((it) => it.itemId) : [];
  metaQueue.add(ids.filter((id) => store.data.videos[id] && !store.data.videos[id].title));
  if (res.added) flashVideos(ids);
  renderMain();

  const plName = (pl || {}).name || '';
  const parts = [];
  if (res.added) parts.push(`${res.added} video ditambahkan ke “${plName}”`);
  if (res.skipped) parts.push(`${res.skipped} sudah ada`);
  const otherPl = Math.max(0, inLib - res.skipped);
  if (res.added && otherPl) parts.push(res.added === 1 && ids.length === 1 ? 'lagu ini juga ada di playlist lain' : `${otherPl} juga ada di playlist lain`);
  if (libSkipped) parts.push(`${libSkipped} dilewati (sudah di library)`);
  if (invalid) parts.push(`${invalid} link tidak valid`);
  if (dup) parts.push(`${dup} duplikat dilewati`);
  const msg = parts.join(' · ') || 'Tidak ada yang ditambahkan.';
  feedback(msg, res.added ? 'ok' : '');
  if (res.added) {
    if (res.added > 1) {
      offerUndo(msg, () => {
        store.removeItems(target, addedItemIds);
        const orphan = res.newIds.filter((v) => !store.data.playlists.some((p) => p.items.some((i) => i.youtubeId === v)));
        if (orphan.length) store.deleteVideos(orphan);
        feedback('');
        render();
      }, { type: 'success', ms: 7000, label: 'Batalkan', done: `${res.added} video dibatalkan.` });
    } else toast(msg, 'success', 3500);
  }
  if (res.added && overlay.isOpen('add')) overlay.close('add');
  if ((res.added || res.skipped) && document.body.classList.contains('add-open-d')) setTimeout(() => openAddSheet(false), 900);
  return res.added > 0 || res.skipped > 0;
}

/** Sorot video yang baru ditambahkan dan gulir ke sana (kalau tampil di view ini). */
function flashVideos(ids, scroll = true) {
  ids.forEach((id) => local.flash.add(id));
  if (scroll) setTimeout(() => {
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
/** Import playlist YouTube (dengan API key, atau tanpa key lewat player YouTube). Judul dimuat sesudahnya. */
function importYtPlaylist(opts = {}) {
  return ytPlaylistImportDialog(store, { ...opts, onAdded: (ids) => metaQueue.add(ids.filter((id) => store.data.videos[id] && !store.data.videos[id].title)) });
}

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
  const { result, undo } = withUndo(() => store.moveToPlaylist(entry.playlistId, entry.itemId, target));
  if (result) offerUndo(`Dipindahkan ke “${store.getPlaylist(target).name}”.`, undo, { type: 'success' });
}

function removeEntry(entry) {
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
function openItemMenu(anchor, entry) {
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
function exportForStreaming(name, entries) {
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
function checkHealth() {
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
function deleteFromLibrary(entry) {
  const v = entry.video;
  animateOut([entry.key], () => {
    const { undo } = withUndo(() => store.deleteVideo(v.youtubeId));
    offerUndo('Dihapus dari library dan semua playlist.', undo, { ms: 8000 });
  });
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

/** Satu tombol "Tampilan": urutan + kepadatan daftar. */
function openViewMenu(anchor) {
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

function openPlaylistMenu(anchor) {
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
function playlistOrderItems(pl) {
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
async function sharePlaylist(pl) {
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

async function receiveShare(code) {
  let data;
  try { data = await decodeShare(code); } catch (e) { toast(`Link playlist tidak bisa dibuka: ${e.message}`, 'error', 7000); return; }
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
window.addEventListener('hashchange', () => { const c = takeShareFromUrl(); if (c) receiveShare(c); });

// ---------- tag ----------
/** Atur tag untuk satu video (ids.length === 1) atau tambah/hapus satu tag di banyak video. */
function tagsDialog(ids) {
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
function autoTagAll() {
  const r = applyAutoTags(store, Object.keys(store.data.videos));
  if (!r.videos) { toast('Tidak ada tag baru: semua lagu sudah bertag sesuai judulnya.', 'info'); return; }
  offerUndo(`${r.tags} tag ditambahkan ke ${r.videos} lagu.`, () => r.undo(), { type: 'success', done: 'Tag otomatis dibatalkan.' });
}
window.addEventListener('mtv-autotag-all', autoTagAll);

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
  local.selAnchor = key;
  renderMain();
  renderSelectBar();
}
/** Ctrl/Shift+klik. Shift: pilih semua lagu di antara lagu terakhir yang diklik dan lagu ini. */
function clickSelect(key, range) {
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
      ${inPl && canReorder() ? b('sel-order', 'sort', 'Urutan') : ''}
      ${inPl ? b('sel-move', 'arrowRight', 'Pindah') : ''}
      ${b('sel-fav', 'heart', allFav ? 'Batal favorit' : 'Favorit')}
      ${b('sel-watched', 'checkCircle', ents.length && ents.every((e) => e.video.watched) ? 'Belum ditonton' : 'Ditonton')}
      ${b('sel-tag', 'tag', 'Tag')}
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

// ---------- timer tidur & kecepatan ----------
/**
 * Menu ⋮ player (v41: sama di PC & HP). Hanya hal yang memang soal lagu yang sedang diputar; tombol yang
 * sudah ada di bilah (lirik, tambah ke playlist) tidak diulang, setelan permanen pindah ke Setelan → Umum.
 */
function openPlayerMenu(anchor) {
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
    { label: 'Setelan pemutar…', icon: 'settings', action: () => openSettings('general') },
  ]);
}
function rateItems() {
  return [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => ({
    label: r === 1 ? '1× (normal)' : `${r}×`, icon: 'gauge', checked: player.rate === r,
    action: () => { player.setRate(r); store.ui.rate = r; store.saveUi(); },
  }));
}
function sleepItems() {
  const on = sleepTimer.active;
  return [
    ...SLEEP_PRESETS.map((m) => ({ label: `${m} menit`, icon: 'moon', action: () => sleepTimer.set(m) })),
    { label: 'Akhir lagu ini', icon: 'pause', checked: sleepTimer.endOfTrack, action: () => sleepTimer.set('track') },
    on && 'sep',
    on && { label: 'Matikan timer', icon: 'x', action: () => sleepTimer.set(0) },
  ];
}
// label hitung mundur di player bawah: render ulang hanya saat teksnya berubah (±1× per menit)
let lastSleepLabel = '';
sleepTimer.onChange(() => {
  const l = sleepTimer.label();
  if (l !== lastSleepLabel) { lastSleepLabel = l; renderDockAll(); }
});

// ---------- status sinkron (v41): satu klik di ikon awan → status lengkap + Sinkron sekarang ----------
function syncSummary() {
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
function openSyncMenu(anchor) {
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
// "x menit lalu" di tooltip tetap segar
setInterval(() => { if (document.visibilityState === 'visible') ui.renderSyncBadge(sync, store); }, 60000);

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
  if (open && !$('lyrics-panel').hidden) toggleLyrics(false);
  setPanel('queue', open, (on) => {
    panel.hidden = !on;
    document.body.classList.toggle('queue-open', on);
    ui.renderQueue(player, store);
  });
}

/** Tampilkan / sembunyikan video. Bawaan: tersembunyi — cukup player di bawah, musik tetap jalan. */
function toggleVideo(force) {
  const hidden = store.ui.stageMin !== false;
  const show = force !== undefined ? force : hidden;
  store.ui.stageMin = !show;
  store.saveUi();
}

function applyLyrics(on) {
  $('lyrics-panel').hidden = !on;
  document.body.classList.toggle('lyrics-open', on);
  if (on) { lyricsPanel.load(); setTimeout(() => lyricsPanel.tick(player.time()), 60); }
  renderDockAll();
}
function toggleLyrics(force) {
  const panel = $('lyrics-panel');
  const open = force !== undefined ? force : panel.hidden;
  if (open === !panel.hidden) return;
  if (open && !$('queue-panel').hidden) toggleQueue(false);
  setPanel('lyrics', open, applyLyrics);
}
/** Dari Lobby langsung ke lirik: entri riwayat Lobby ditukar dengan lirik (tombol Back tetap menutup lirik). */
function lyricsFromLobby() {
  if (!$('lyrics-panel').hidden) { overlay.close('lobby'); return; }
  if (!$('queue-panel').hidden) toggleQueue(false);
  applyLyrics(true);
  overlay.swap('lobby', 'lyrics', () => { applyLyrics(false); renderBottomNav(); });
  renderBottomNav();
}

function openAddSheet(open = true) {
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
    renderAddPreview();
  } else {
    if (local.multi) setMulti(false);
    const link = r.valid.length ? `https://youtu.be/${r.valid[0]}` : text.trim();
    $('add-input').value = link;
    feedback(r.valid.length ? 'Link siap — pilih playlist lalu tekan Tambah.' : 'Tidak ada link YouTube yang dikenali.', r.valid.length ? 'ok' : 'error');
  }
}

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
    case 'queue-jump': player.jumpTo(Number(el.dataset.pos)); break;
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

// ---------- tarik untuk mengubah urutan: satu lagu, atau semua yang dipilih sekaligus (js/rowdrag.js) ----------
/** Entri yang ikut digeser bila baris `en` digeser: semua yang dipilih (kalau `en` termasuk), atau `en` saja. */
function dragGroup(en) {
  return local.selecting && local.selected.has(en.key) && local.selected.size > 1 ? selectedEntries() : [en];
}
/** Indeks jatuh (posisi di playlist) → posisi awal blok setelah blok dikeluarkan. */
function dropTo(ents, dropIndex) {
  const keys = new Set(ents.map((e) => e.index));
  let to = dropIndex; for (const i of keys) if (i < dropIndex) to--;
  return to;
}
/** Gulir otomatis saat menggeser di dekat tepi atas/bawah (di bawah bar atas, di atas player/bar pilihan). */
function edgeScroller() {
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

// ---------- gestur v41: geser baris (HP), tarik urutan playlist, ketuk video ----------
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
enableVideoTaps(document.querySelector('.stage-video'), { player, icon, onToggle: () => player.toggle() });

// PC: panel Tambah melayang di bawah bar atas, selebar area daftar lagu.
function placeAddPopover() {
  const panel = $('add-form');
  if (isPhone() || !document.body.classList.contains('add-open-d')) { panel.style.left = ''; panel.style.width = ''; return; }
  const main = $('main');
  const cs = getComputedStyle(main);
  const r = main.getBoundingClientRect();
  const w = Math.min(820, main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  panel.style.width = `${w}px`;
  panel.style.left = `${r.left + (main.clientWidth - w) / 2}px`;
}
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
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderAddPreview, 150);
});
$('add-multi').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('add-form').requestSubmit(); }
});

// ---------- kolom serbaguna: ketik = cari, tempel link YouTube = langsung tambah ----------
const hasLinks = (text) => /(youtu\.be\/|youtube\.com\/|music\.youtube)/i.test(text || '');
function addFromSearch(text) {
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
function searchHint(msg) {
  let h = document.getElementById('search-hint');
  if (!h) { h = document.createElement('div'); h.id = 'search-hint'; h.className = 'search-hint'; $('search').closest('.search').appendChild(h); }
  h.textContent = msg; h.hidden = !msg;
}
let searchTimer = null;
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
  if (type === 'error') toast(data && data.skipping ? `${player.error} Melewati ke video berikutnya…` : player.error, 'error', 5000);
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

window.addEventListener('storage', (e) => {
  if (e.key === 'mytube_vault_state_v1') { store.load(); store.emit('external'); }
});

// ---------- notifikasi, layar kunci & tombol media keyboard (js/mediasession.js) ----------
const media = createMediaSession({
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
window.addEventListener('mtv-pref', (e) => {
  if (e.detail === 'tint') applyTint(player.current ? player.current.youtubeId : null, store.ui.tint !== false);
  if (e.detail === 'mediaKeys') media.configure();
});
let tick = 0;
let lastListenAt = Date.now();
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

let listenBuf = 0;
function addListenBuffered(sec) {
  listenBuf += sec;
  if (listenBuf >= 15) { addListen(listenBuf); listenBuf = 0; } // tulis ke penyimpanan tiap ±15 detik
}
window.addEventListener('pagehide', () => { if (listenBuf > 0) { addListen(listenBuf); listenBuf = 0; } });
/** Jalankan aksi data-action yang sama seperti tombol di UI (dipakai command palette). */
function fire(action, data = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.hidden = true;
  b.dataset.action = action;
  Object.assign(b.dataset, data);
  document.body.appendChild(b);
  b.click();
  b.remove();
}

function openCommandPalette() {
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

function playVideoById(id) {
  const e = store.viewEntries('all').find((x) => x.youtubeId === id);
  if (e) { rememberQueueSource(false); player.playList([e], 0); }
}

const lyricsPanel = createLyricsPanel($('lyrics-panel'), {
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

/** Ganti lagu yang sedang diputar (biasanya MV) dengan versi audionya supaya lirik pas. */
async function findAudioVersion(info = {}) {
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
function currentLyricLine() {
  if (!player.current) return '';
  lyricsPanel.load();
  lyricsPanel.tick(player.time());
  const p = $('lyrics-panel').querySelector('.lyrics-lines.synced p.now');
  if (!p) return '';
  const clone = p.cloneNode(true);
  clone.querySelectorAll('.lyr-tr').forEach((n) => n.remove());
  return clone.textContent.trim();
}
const lobby = createLobbyHost({
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

// ---------- lanjutkan sesi terakhir (js/session.js) ----------
let resumeOffer = null;
let sessionTimer = 0;
function persistSession() {
  clearTimeout(sessionTimer);
  sessionTimer = 0;
  if (!player.current) return;
  const time = player.state === 'ended' ? 0 : player.time();
  saveSession(snapshotSession(player, { time, source: local.queueSource }));
}
const persistSoon = () => { clearTimeout(sessionTimer); sessionTimer = setTimeout(persistSession, 1200); };
player.on((type, data) => {
  if (type === 'track' && !data) { clearTimeout(sessionTimer); saveSession(null); return; } // player dihentikan
  if (type === 'track' || type === 'queue' || type === 'state') persistSoon();
  if (type === 'track' && resumeOffer) hideResume();
});
window.addEventListener('pagehide', persistSession);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistSession(); });

function offerResume(s) {
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
function hideResume() {
  resumeOffer = null;
  $('resume-card').hidden = true;
  document.body.classList.remove('has-resume');
}
function resumeSession() {
  const s = resumeOffer;
  hideResume();
  if (!s) return;
  const src = s.source;
  local.queueSource = src && typeof src.view === 'string' && (!src.view.startsWith('pl:') || store.getPlaylist(src.view.slice(3))) ? src : null;
  player.restore(s);
}

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
store.load();
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
const launched = handleLaunch() || !!shareCode;
if (shareCode) receiveShare(shareCode);
if (store.isFresh && !launched) onboarding();
maybeShowWhatsNew({ fresh: store.isFresh || launched });
if (!store.isFresh && !launched && store.ui.lobby && store.ui.lobby.startup) setTimeout(() => lobby.open(), 300);
if (!store.isFresh && !launched && !player.current) {
  const last = loadSession({ exists: (id) => !!store.data.videos[id] });
  if (last) offerResume(last);
}
