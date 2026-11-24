// app-library.js — bagian dari main.js (dipecah di v44). Lihat main.js untuk urutan setup.

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
import { $, PAGE, dupesDialog, local, player, sleepTimer } from './app-state.js';
import { importYtPlaylist, renderMemory, renderSelectBar, selectedEntries } from './app-actions.js';
import { openAddSheet } from './app-input.js';
import { nowPanel } from './app-events.js';

export let bar, metaQueue;
// ---------- Urungkan (v41): satu pola untuk semua hapus/pindah, juga lewat Ctrl+Z ----------
export let lastUndo = null;
/** Tampilkan toast dengan tombol Urungkan; Ctrl+Z menjalankan Urungkan terakhir (±1 menit). */
export function offerUndo(msg, undoFn, { type = 'info', ms = 8000, label = 'Urungkan', done = 'Dibatalkan.' } = {}) {
  const u = { fn: undoFn, at: Date.now(), done };
  lastUndo = u;
  u.toast = toast(msg, type, ms, { label, fn: () => runUndo(u) });
}
export function runUndo(u = lastUndo) {
  if (!u || u.used) return false;
  u.used = true;
  if (lastUndo === u) lastUndo = null;
  if (u.toast) u.toast.dismiss();
  u.fn();
  if (u.done) toast(u.done, 'info', 2200);
  return true;
}
/** Jalankan perubahan besar setelah menyimpan salinan data; hasil: fungsi untuk mengembalikannya. */
export function withUndo(fn, opts) {
  const cp = store.checkpoint();
  const result = fn();
  return { result, undo: () => store.restoreCheckpoint(cp, opts) };
}

/** Player bawah + panel Sedang diputar. */
export function renderDockAll() {
  ui.renderDock(player, store, dockOpts());
  if (nowPanel) nowPanel.render();
}



// ---------- lagu ganda (js/dupes.js) ----------
/** Lagu yang baru ditambahkan ternyata lagu yang sama dengan yang sudah ada → beri tahu (dikumpulkan dulu sebentar). */
export const similarNew = new Set();
export let similarTimer = 0;
export function noteSimilar(id) {
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
export async function openDupesDialog(opts = {}) {
  const res = await dupesDialog(store, opts);
  if (!res || !res.length) return;
  const { result: n, undo } = withUndo(() => res.reduce((sum, g) => sum + store.mergeVideos(g.keep, g.drops), 0));
  if (n) offerUndo(`${res.length === 1 ? 'Lagu ganda digabung' : `${res.length} lagu ganda digabung`} · ${n} video dihapus.`, undo, { type: 'success', ms: 9000 });
}

// ---------- helper view ----------
export function currentSort() {
  const v = store.ui.view;
  return store.ui.sort[v] || (v.startsWith('pl:') || v === 'history' || v === 'mix' ? 'manual' : 'addedNewest');
}
/** HP: pegangan geser hanya tampil dalam mode Atur urutan (v45). */
export function setArranging(on) {
  document.body.classList.toggle('arranging', !!on);
  local.arrangeView = store.ui.view;
  renderMain();
}
export function canReorder() {
  return store.ui.view.startsWith('pl:') && currentSort() === 'manual' && !local.query.trim() && !local.qf.length;
}
// ---------- ubah urutan: satu lagu atau banyak sekaligus ----------
/** Pindahkan entri (urutan di antara mereka tetap) supaya mulai di posisi `to` (0 = paling atas). */
export function moveBlock(ents, to, { scroll = true } = {}) {
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
export async function askPosition(ents) {
  const pl = store.currentPlaylist();
  if (!pl) return;
  const n = ents.length; const max = pl.items.length - n + 1;
  const cur = Math.min(...ents.map((e) => e.index)) + 1;
  const v = await positionDialog(n > 1 ? `Pindahkan ${n} lagu ke nomor…` : 'Pindahkan ke nomor…', { max, value: cur, hint: n > 1 ? `Lagu terpilih dikumpulkan berurutan mulai nomor itu (1–${max}).` : `1 = paling atas, ${max} = paling bawah.` });
  if (v) moveBlock(ents, v - 1);
}
/** Klik nomor urut sebuah lagu → ketik nomor baru langsung di tempat. */
export function editIndex(rowEl, entry) {
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
export function openOrderMenu(anchor) {
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

export function visibleEntries() {
  return sortEntries(quickFilter(filterEntries(store.viewEntries(), local.query), local.qf), currentSort());
}
export function density() {
  const d = store.ui.density;
  return d === 'compact' || d === 'grid' ? d : 'comfy';
}
export function setDensity(d) {
  store.ui.density = d;
  store.saveUi();
}
/** Tag paling sering di view ini (untuk chip filter cepat). */
export function topTagsOf(entries, n = 4, keep = new Set()) {
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
export function openTagFilterMenu(anchor) {
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
export function entryByKey(key) {
  return store.viewEntries().find((e) => e.key === key) || null;
}
/** Setelan tampilan v41: judul bersih & mode hemat. */
export function applyPrefs() {
  setCleanTitles(store.ui.cleanTitles !== false);
  const lite = store.ui.lite === true;
  setLiteThumbs(lite);
  document.body.classList.toggle('lite', lite);
}
export function applyTheme() {
  const t = store.ui.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ---------- render ----------
export function render() {
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

export function renderQS() {
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

export function dockOpts() {
  return { sleepLabel: sleepTimer.label() };
}

export function renderBottomNav() {
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

export function renderMain() {
  if (local.rowDrag) { local.renderLater = true; return; } // jangan ganti baris saat sedang ditarik
  const all = store.viewEntries();
  const sort = currentSort();
  const view = store.ui.view;
  const searched = filterEntries(all, local.query);
  renderMemory();
  const visible = sortEntries(quickFilter(searched, local.qf), sort);
  const duration = all.reduce((s, e) => s + (e.video.duration || 0), 0);
  const pl = store.currentPlaylist();
  ui.renderViewHead(store, { sort, total: all.length, visible: visible.length, query: local.query, filtered: !!(local.query.trim() || local.qf.length), duration, density: density(), coverIds: all.slice(0, 4).map((e) => e.youtubeId) });
  // filter gabungan: tag teratas dari hasil saat ini + tag yang sedang aktif
  const tagKeys = new Set(local.qf.filter((x) => x.startsWith('tag:')).map((x) => x.slice(4)));
  // v45: chip tag hanya untuk tag yang sedang aktif; sisanya lewat satu chip "Tag" (menu)
  const top = view.startsWith('tag:') ? [] : topTagsOf(visible, 0, tagKeys);
  const allTagsHere = view.startsWith('tag:') ? [] : topTagsOf(visible, 999, tagKeys);
  ui.renderQuickFilters(searched, {
    active: local.qf, view, filters: QUICK_FILTERS, tags: top, shown: visible.length,
    countWith: (id) => quickFilter(searched, toggleFilter(local.qf, id)).length,
    moreTags: Math.max(0, allTagsHere.length - top.length),
  });

  const hint = $('list-hint');
  let arranging = document.body.classList.contains('arranging');
  if (arranging && (!canReorder() || local.arrangeView !== store.ui.view)) { document.body.classList.remove('arranging'); arranging = false; }
  if (arranging && canReorder()) {
    hint.hidden = false;
    hint.innerHTML = `${icon('grip')}<span>Seret pegangan di kiri lagu untuk mengubah urutan.</span>
      <button type="button" class="btn sm" data-action="arrange-done">Selesai</button>`;
  } else if (pl && sort !== 'manual' && all.length > 1) {
    hint.hidden = false;
    hint.innerHTML = `${icon('sort')}<span>Urutan otomatis aktif (tampilan saja — urutan asli tidak berubah).</span>
      <button type="button" class="link-btn" data-action="sort-manual">Kembali ke urutan manual</button>`;
  } else if (view === 'mix' && all.length) {
    hint.hidden = false;
    hint.innerHTML = `${icon('sparkle')}<span>Dipilih dari library-mu berdasarkan lagu, channel, dan tag yang sering kamu putar. Berganti tiap hari.</span>`;
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
export let moreObserver = null;
export function observeMore() {
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

export function renderAddTarget() {
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
export function feedback(msg, type = '') {
  const el = $('add-feedback');
  el.textContent = msg;
  el.className = `add-feedback ${type}`;
}

export function setMulti(on) {
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
export function addPreviewData() {
  const pl = store.getPlaylist($('add-target').value);
  return classifyLinks($('add-multi').value, { videos: store.data.videos, inTarget: new Set(pl ? pl.items.map((i) => i.youtubeId) : []) });
}
export function renderAddPreview() {
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
export let previewTimer = 0;
export function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderAddPreview, 150); }

export function handleAdd(e) {
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
export function addIds(ids, target, { invalid = 0, dup = 0, libSkipped = 0 } = {}) {
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
export function flashVideos(ids, scroll = true) {
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
export function playFromEntry(entry) {
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
export function rememberQueueSource(on = true) {
  local.queueSource = on ? { view: store.ui.view, sort: currentSort(), query: local.query } : null;
}
export function syncQueueWithSource() {
  const src = local.queueSource;
  if (!src || !player.current) return;
  const view = src.view;
  if (view.startsWith('pl:') && !store.getPlaylist(view.slice(3))) { local.queueSource = null; return; }
  const entries = sortEntries(filterEntries(store.viewEntries(view), src.query), src.sort);
  player.syncQueue(entries);
}

export function playVisible(shuffleAll) {
  const entries = visibleEntries();
  if (!entries.length) return;
  if (shuffleAll) store.setPlayerSetting('shuffle', true);
  const start = shuffleAll ? Math.floor(Math.random() * entries.length) : 0;
  rememberQueueSource();
  player.playList(entries, start);
}


/** Pasang event & buat objek bagian ini (dipanggil sekali dari main.js, urutannya penting). */
export function setupLibrary() {
  // Bilah player bawah (js/playerbar.js) & panel yang bisa digeser (js/panels.js)
  bar = createPlayerBar({ player, store, ui, toast });
  enableStageFloat({ store });
  trackStageSpace();
  enableQueueDrag({ player });
  metaQueue = createMetaQueue((id, meta) => {
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
  $('add-preview').addEventListener('change', (e) => { if (e.target.dataset.ap === 'skip') { local.skipLibrary = e.target.checked; renderAddPreview(); } });
  $('add-preview').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ap-list]');
    if (b) importYtPlaylist({ url: `https://www.youtube.com/playlist?list=${b.dataset.apList}`, targetId: $('add-target').value });
  });
  $('add-target').addEventListener('change', () => { if (local.multi) renderAddPreview(); });
}
