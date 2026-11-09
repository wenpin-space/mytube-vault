// Lobby: layar santai penuh — Kamar santai yang dilukis, jam, lagu yang diputar, lirik, suara alam,
// serta alat Fokus (Pomodoro) dan Timer tidur. Tampilan sengaja minimalis: 4 ikon di kanan atas dan
// satu bar musik tipis di bawah; semuanya menghilang saat tidak ada gerakan.

import * as amb from './ambient.js';
import { createSceneRunner, canvasDpr } from './scenes.js';
import { SLEEP_PRESETS } from './sleep.js';
import { putFile, getFile, deleteFile } from './idb.js';
import { LOCATIONS, WEATHERS, TIMES, resolveTime, roomSoundMix, prewarmRoom, pausePrewarm } from './room.js';
import { escapeHtml } from './utils.js';
import { DRINKS, FOODS } from './cafe.js';
import { thumbUrl } from './metadata.js';
import { locale, tr, LANG } from './i18n.js';
import { fetchWeather, searchCity, placeName, geolocate, liveScene, describeWmo, localMinutes, minutesToNextTime, STALE_MS } from './weather.js';

/** Sapaan sesuai jam. */
export function greeting(hour) {
  if (hour < 4) return 'Selamat malam';
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

/** Mesin Pomodoro murni (mudah diuji). */
export function pomodoroNext(state, cfg = { work: 25, brk: 5, long: 15, every: 4 }) {
  if (state.phase === 'work') {
    const sessions = state.sessions + 1;
    const long = sessions % cfg.every === 0;
    return { phase: long ? 'long' : 'break', remaining: (long ? cfg.long : cfg.brk) * 60, sessions, running: true };
  }
  return { phase: 'work', remaining: cfg.work * 60, sessions: state.sessions, running: true };
}

export const FOCUS_PRESETS = [[25, 5, 15], [50, 10, 20], [15, 3, 10], [90, 15, 30]];
export { SLEEP_PRESETS };

const DEFAULTS = { room: { spot: 'room', loc: 'mountain', weather: 'rain', time: 'auto', autoSound: true, live: false, place: null }, wx: null, cafe: null, mix: null, master: 0.8, presets: [], autoHide: true, cafeSfx: true, startup: false, nickname: '', showLyrics: true, wake: true, customSounds: [], pomo: { work: 25, brk: 5, long: 15 } };
const PHASE = { work: 'Fokus', break: 'Istirahat', long: 'Istirahat panjang' };

/** Satu ubin noise kecil untuk grain film (dibuat sekali, dipakai CSS). */
let grainUrl = '';
function grainTile() {
  if (grainUrl) return grainUrl;
  try {
    const n = 160; const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
    const x = cv.getContext('2d'); const img = x.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.random() * 34; }
    x.putImageData(img, 0, 0);
    grainUrl = cv.toDataURL('image/png');
  } catch { grainUrl = ''; }
  return grainUrl;
}

export function createLobby({ store, player, icon, toast, sleepTimer, getLyric, playSomething, onOpenChange, isPhone, openLyrics }) {
  const cfg = () => {
    const c = { ...DEFAULTS, ...(store.ui.lobby || {}) };
    // bersihkan sisa versi lama (mode/latar lain sudah dihapus)
    if (c.hasBg) { deleteFile('lobby-bg').catch(() => {}); }
    delete c.mode; delete c.scene; delete c.hasBg; delete c.lowPower;
    store.ui.lobby = c;
    return c;
  };
  // setelan Lobby tidak mengubah tampilan aplikasi di belakangnya → simpan tanpa render ulang
  const save = () => store.saveUiQuiet();
  let el = null;
  let runner = null;
  let open = false;
  let clockTimer = 0;
  let lyricTimer = 0;
  let idleTimer = 0;
  let wakeLock = null;
  let customLoaded = false;
  const tabs = { scene: 'view', timer: 'focus' };
  let lastSceneKey = '';
  let editingLoc = false;
  let cityResults = [];
  let wxBusy = null;
  let warmedNext = '';
  const pomo = { phase: 'work', remaining: 25 * 60, sessions: 0, running: false, timer: 0, active: false };
  let busyTimer = 0;

  // ------------------------------------------------------------------ DOM
  function build() {
    el = document.createElement('div');
    el.id = 'lobby';
    el.className = 'lobby';
    el.dataset.scene = 'room';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Lobby');
    const ico = (id, ic, title, extra = '') => `<button type="button" class="lb-ico" data-lb="${id === 'close' ? 'close' : 'panel'}" data-id="${id}" title="${title}" aria-label="${title}" ${extra}>${icon(ic)}</button>`;
    el.innerHTML = `
      <canvas class="lb-canvas" aria-hidden="true"></canvas>
      <div class="lb-grain" aria-hidden="true"></div>
      <div class="lb-vignette" aria-hidden="true"></div>
      <div class="lb-dim" aria-hidden="true"></div>
      <header class="lb-top lb-chrome">
        <nav class="lb-tools" aria-label="Alat Lobby">
          ${ico('scene', 'cloud', 'Suasana & suara (S)')}
          ${ico('timer', 'timer', 'Fokus & timer tidur (T)')}
          ${ico('settings', 'gear', 'Setelan Lobby')}
          ${ico('close', 'x', 'Tutup Lobby (Esc)')}
        </nav>
      </header>
      <main class="lb-center">
        <div class="lb-greet"></div>
        <div class="lb-clock" aria-live="off"></div>
        <div class="lb-date"><span class="lb-date-day"></span><button type="button" class="lb-place" data-lb="panel" data-id="scene"></button></div>
        <div class="lb-lyric" aria-live="polite" translate="no"></div>
        <div class="lb-widgets"><section class="lb-w lb-pomo" hidden></section><section class="lb-w lb-sleep" hidden></section></div>
        <button type="button" class="lb-unlock" data-lb="unlock" hidden>${icon('volume')}<span>Ketuk untuk menyalakan suara</span></button>
      </main>
      <footer class="lb-bottom lb-chrome"><div class="lb-np"></div></footer>
      <aside class="lb-panel" data-panel="scene" hidden></aside>
      <aside class="lb-panel" data-panel="timer" hidden></aside>
      <aside class="lb-panel" data-panel="settings" hidden></aside>
      <input type="file" class="lb-file-snd" accept="audio/*" hidden>`;
    document.body.appendChild(el);
    el.querySelector('.lb-grain').style.backgroundImage = `url(${grainTile()})`;
    runner = createSceneRunner(el.querySelector('.lb-canvas'));
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    el.addEventListener('submit', onSubmit);
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => el.addEventListener(ev, wake, { passive: true }));
    el.addEventListener('pointerdown', () => { if (needsUnlock()) unlockAudio(); }, { capture: true });
    // parallax halus: pemandangan di luar jendela sedikit bergeser mengikuti mouse
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      runner.setState({ pointer: { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 } });
    }, { passive: true });
    amb.onChange(() => { if (open) { renderNP(); syncMixSliders(); } });
    if (sleepTimer) sleepTimer.onChange(() => { if (open) { renderWidgets(); if (!panel('timer').hidden && tabs.timer === 'sleep') renderTimerPanel(); } });
    document.addEventListener('visibilitychange', () => { if (open && !document.hidden) requestWake(); });
  }
  const $ = (sel) => el.querySelector(sel);
  const panel = (name) => $(`.lb-panel[data-panel="${name}"]`);

  // ------------------------------------------------------------------ buka / tutup
  function show() {
    if (!el) build();
    if (open) return;
    open = true;
    pausePrewarm();
    el.hidden = false;
    document.body.classList.add('lobby-open');
    const c = cfg();
    runner.setScene('room');
    syncRoom();
    pushCafe();
    refreshWeather();
    if (!c.mix) c.mix = roomCfg().autoSound ? roomSoundMix(roomResolved()) : {};
    startMix(c.mix);
    save();
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
    lyricTimer = setInterval(tickLyric, 350);
    renderNP();
    renderWidgets();
    wake();
    requestWake();
    loadCustomSounds();
    onOpenChange && onOpenChange(true);
  }
  function hide({ silent = false } = {}) {
    if (!open) return;
    open = false;
    el.hidden = true;
    document.body.classList.remove('lobby-open');
    runner.stop();
    clearInterval(clockTimer);
    clearInterval(lyricTimer);
    clearTimeout(idleTimer);
    closePanels();
    releaseWake();
    el.classList.remove('leaving');
    if (!silent && onOpenChange) onOpenChange(false);
  }

  /** Klik bar musik → pindah ke halaman lirik dengan transisi (artwork & judul "terbang" ke tempatnya). */
  const VT_NAMES = [['.lb-np img', 'lv-thumb', 'np-art'], ['.lb-np-text b', 'lv-title', 'np-title'], ['.lb-np-text > span', 'lv-sub', 'np-sub']];
  function vtNames(side) {
    // nama transisi dipasang hanya di satu sisi pada satu waktu → tidak pernah ada nama ganda
    VT_NAMES.forEach(([lobbySel, lvId, name]) => {
      const a = el.querySelector(lobbySel); const b = document.getElementById(lvId);
      if (a) a.style.viewTransitionName = side === 'old' ? name : '';
      if (b) b.style.viewTransitionName = side === 'new' ? name : '';
    });
  }
  function toLyrics() {
    if (!openLyrics || !player.current) return;
    const lv = document.getElementById('lyrics-panel');
    const lyricsAlreadyOpen = lv && !lv.hidden;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const swap = () => { hide({ silent: true }); openLyrics(); };
    if (document.startViewTransition && !reduce && !lyricsAlreadyOpen) {
      vtNames('old');
      try {
        const t = document.startViewTransition(() => { swap(); vtNames('new'); });
        const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
        quiet(t.ready); quiet(t.updateCallbackDone);
        t.finished.catch(() => {}).finally(() => vtNames('none'));
      } catch { vtNames('none'); if (open) swap(); }
      return;
    }
    if (reduce) { swap(); return; }
    el.classList.add('leaving');
    setTimeout(() => {
      swap();
      if (lv && !lyricsAlreadyOpen) { lv.classList.remove('lv-enter'); void lv.offsetWidth; lv.classList.add('lv-enter'); }
    }, 260);
  }

  // ------------------------------------------------------------------ kamar santai: lokasi, cuaca, waktu
  const roomCfg = () => { const c = store.ui.lobby || cfg(); c.room = { ...DEFAULTS.room, ...(c.room || {}) }; return c.room; };
  /** Suasana yang dipakai: pilihan manual, atau cuaca & waktu nyata di lokasi yang dipilih. */
  const roomResolved = (now = Date.now()) => {
    const r = roomCfg();
    const out = { place: r.spot === 'cafe' ? 'cafe' : 'room', loc: r.loc, weather: r.weather, time: resolveTime(r.time, new Date(now).getHours()) };
    if (r.live) {
      const ls = liveScene((store.ui.lobby || {}).wx, now);
      if (ls) { out.weather = ls.weather; if (ls.time) out.time = ls.time; }
    }
    return out;
  };
  const sceneKey = (rs) => `${rs.place}|${rs.loc}|${rs.weather}|${rs.time}`;
  const SPOTS = [{ id: 'room', name: 'Kamar santai', icon: 'sofa' }, { id: 'cafe', name: 'Kafe', icon: 'coffee' }];
  const nameOf = (list, id) => (list.find((x) => x.id === id) || list[0]).name;
  /** Label di samping tanggal: "Batam · 28° · hujan ringan" (nyata) atau "Gunung & danau · hujan" (manual). */
  function placeLabel() {
    const r = roomCfg(); const wx = cfg().wx;
    if (r.live && r.place) return wx ? `${r.place.name} · ${wx.temp}° · ${describeWmo(wx.code)}` : `${r.place.name} · memuat cuaca…`;
    const rs = roomResolved();
    return `${r.spot === 'cafe' ? 'Kafe · ' : ''}${nameOf(LOCATIONS, r.loc)} · ${nameOf(WEATHERS, rs.weather).toLowerCase()}`;
  }
  function syncRoom({ sound = false } = {}) {
    const rs = roomResolved();
    runner.setState({ room: rs });
    el.dataset.time = rs.time;
    const changed = sceneKey(rs) !== lastSceneKey;
    lastSceneKey = sceneKey(rs);
    if (sound && changed && roomCfg().autoSound) { cfg().mix = roomSoundMix(rs); save(); startMix(cfg().mix); }
    $('.lb-place').textContent = placeLabel();
    updateScenePanel();
    if (changed) watchBusy();
  }

  // ------------------------------------------------------------------ kafe: pesanan di meja kita
  // Minuman & roti berkurang pelan-pelan selama Lobby terbuka di Kafe. Tanpa Fokus: minuman ±20 menit,
  // roti ±14 menit, lalu ±1 menit setelah habis pelayan mengantar pesanan baru. Dengan Fokus: habis tepat
  // di akhir sesi fokus, dan pesanan baru datang saat istirahat dimulai.
  const DRINK_MIN = 20; const FOOD_MIN = 14;
  let cafeSaveTick = 0;
  const pickOther = (list, prev) => { const xs = list.filter((x) => x.id !== prev); return xs[Math.floor(Math.random() * xs.length)].id; };
  function cafeOrder() {
    const c = cfg();
    if (!c.cafe || !c.cafe.drink) c.cafe = { serial: 1, drink: pickOther(DRINKS, null), food: pickOther(FOODS, null), used: 0, fused: 0, emptyAt: 0 };
    return c.cafe;
  }
  function newOrder() {
    const cur = cafeOrder();
    cfg().cafe = { serial: cur.serial + 1, drink: pickOther(DRINKS, cur.drink), food: pickOther(FOODS, cur.food), used: 0, fused: 0, emptyAt: 0 };
    save(); pushCafe();
  }
  function pushCafe() {
    if (!runner) return;
    const k = cafeOrder();
    runner.setState({ cafe: { serial: k.serial, drink: k.drink, food: k.food, drinkLeft: 1 - k.used, foodLeft: 1 - k.fused } });
  }
  function tickCafe() {
    if (roomCfg().spot !== 'cafe') return;
    const k = cafeOrder();
    const focus = pomo.active;
    if (!focus || (pomo.running && pomo.phase === 'work')) {
      const dMin = focus ? pomoCfg().work : DRINK_MIN; const fMin = focus ? pomoCfg().work : FOOD_MIN;
      k.used = Math.min(1, k.used + 1 / (dMin * 60)); k.fused = Math.min(1, k.fused + 1 / (fMin * 60));
    }
    if (k.used >= 1 && k.fused >= 1) {
      if (!k.emptyAt) k.emptyAt = Date.now();
      if (!focus && Date.now() - k.emptyAt > 60000) { newOrder(); return; }
    }
    pushCafe();
    if (++cafeSaveTick % 15 === 0) save();
  }
  window.addEventListener('cafe-sfx', (e) => { if (open && cfg().cafeSfx !== false) amb.sfx(e.detail); });

  // ------------------------------------------------------------------ cuaca & waktu nyata
  /** Ambil cuaca terbaru kalau datanya sudah basi (±25 menit) atau lokasinya baru. */
  function refreshWeather({ force = false } = {}) {
    const r = roomCfg(); const c = cfg();
    if (!r.live || !r.place) return Promise.resolve(false);
    const fresh = c.wx && c.wx.lat === r.place.lat && c.wx.lon === r.place.lon && Date.now() - c.wx.at < STALE_MS;
    if (fresh && !force) return Promise.resolve(false);
    if (wxBusy) return wxBusy;
    const place = r.place;
    wxBusy = fetchWeather(place.lat, place.lon)
      .then((wx) => {
        if (roomCfg().place !== place) return false;
        cfg().wx = { ...wx, lat: place.lat, lon: place.lon };
        save();
        if (open) { syncRoom({ sound: true }); renderLiveInfo(); }
        return true;
      })
      .catch((e) => { if (force && open) toast(`Cuaca tidak bisa diambil (${e.message}). Memakai data terakhir.`, 'error', 5000); return false; })
      .finally(() => { wxBusy = null; if (open) renderLiveInfo(); });
    if (open) renderLiveInfo();
    return wxBusy;
  }
  function setPlace(p) {
    const r = roomCfg();
    r.place = { name: String(p.name || 'Lokasimu').slice(0, 40), lat: p.lat, lon: p.lon };
    r.live = true;
    editingLoc = false; cityResults = [];
    cfg().wx = null;
    save();
    renderScenePanel();
    syncRoom({ sound: true });
    refreshWeather({ force: true });
  }
  /** Siapkan lukisan untuk waktu berikutnya (mis. senja) ±20 menit sebelumnya, supaya pergantiannya mulus. */
  function prepareNext() {
    const r = roomCfg(); const wx = cfg().wx;
    let mins = Infinity;
    if (r.live && wx) mins = minutesToNextTime(localMinutes(wx.offset), wx.sunrise, wx.sunset);
    else if (r.time === 'auto') {
      const d = new Date(); const cur = resolveTime('auto', d.getHours());
      for (let h = 1; h <= 24; h++) if (resolveTime('auto', (d.getHours() + h) % 24) !== cur) { mins = h * 60 - d.getMinutes(); break; }
    }
    if (mins > 20) return;
    const next = roomResolved(Date.now() + (mins + 1) * 60000);
    const k = sceneKey(next);
    if (k === warmedNext || k === lastSceneKey) return;
    warmedNext = k;
    prewarmRoom(next, window.innerWidth, window.innerHeight, canvasDpr());
  }
  /** Info kecil di bawah switch "Ikuti cuaca & waktu nyata". */
  function liveInfoText() {
    const r = roomCfg(); const wx = cfg().wx;
    if (!r.live) return 'Cuaca, pagi/siang/senja/malam mengikuti lokasimu.';
    if (!r.place) return 'Pilih lokasi dulu.';
    if (wxBusy && !wx) return 'Mengambil cuaca…';
    if (!wx) return 'Cuaca belum tersedia (offline?). Memakai pilihan manual.';
    const rs = roomResolved();
    const at = new Date(wx.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    return `${describeWmo(wx.code)}, ${wx.temp}° · ${nameOf(TIMES, rs.time).toLowerCase()} · diperbarui ${at}`;
  }
  function renderLiveInfo() {
    const n = el && el.querySelector('.lb-live-info');
    if (n) n.textContent = liveInfoText();
    const pl = el && el.querySelector('.lb-place');
    if (pl) pl.textContent = placeLabel();
  }

  /** Status kecil "Menyiapkan suasana…" selama lukisan baru dibuat (lukisan lama tetap tampil). */
  function watchBusy() {
    clearInterval(busyTimer);
    const tick = () => {
      const st = el && el.querySelector('.lb-status');
      const busy = open && runner.busy;
      if (st) st.textContent = busy ? 'Menyiapkan suasana baru…' : '';
      if (!busy) { clearInterval(busyTimer); busyTimer = 0; }
    };
    setTimeout(tick, 60);
    busyTimer = setInterval(tick, 400);
  }

  // ------------------------------------------------------------------ suara
  const needsUnlock = () => {
    const c = store.ui.lobby || {};
    return amb.isSupported() && !!c.mix && Object.values(c.mix).some((v) => v > 0) && (amb.isSuspended() || !amb.isPlaying());
  };
  function startMix(mix) {
    try { amb.applyMix(filterMix(mix)); } catch { /* tidak didukung */ }
    setTimeout(() => { if (open) $('.lb-unlock').hidden = !needsUnlock(); }, 400);
  }
  function filterMix(mix) {
    const out = {};
    for (const [k, v] of Object.entries(mix || {})) if (!k.startsWith('custom:') || amb.hasCustom(k)) out[k] = v;
    return out;
  }
  function unlockAudio() {
    amb.unlock();
    startMix(cfg().mix || {});
    $('.lb-unlock').hidden = true;
  }
  const soundName = (id) => (amb.SOUNDS.find((s) => s.id === id) || cfg().customSounds.find((s) => s.id === id) || { name: id }).name;

  // ------------------------------------------------------------------ panel
  function openPanel(name, tab) {
    if (tab) tabs[name] = tab;
    const p = panel(name);
    const already = !p.hidden && !tab;
    el.querySelectorAll('.lb-panel').forEach((x) => { x.hidden = true; });
    el.querySelectorAll('.lb-ico[data-id]').forEach((b) => b.classList.remove('on'));
    if (already) { el.classList.remove('panel-open'); return; }
    p.hidden = false;
    const btn = $(`.lb-ico[data-id="${name}"]`); if (btn) btn.classList.add('on');
    renderPanel(name);
    el.classList.add('panel-open');
  }
  function renderPanel(name) {
    if (name === 'scene') renderScenePanel();
    if (name === 'timer') renderTimerPanel();
    if (name === 'settings') renderSettingsPanel();
  }
  function closePanels() {
    el.querySelectorAll('.lb-panel').forEach((p) => { p.hidden = true; });
    el.querySelectorAll('.lb-ico[data-id]').forEach((b) => b.classList.remove('on'));
    el.classList.remove('panel-open');
  }
  const closeBtn = `<button type="button" class="lb-ico sm" data-lb="close-panel" aria-label="Tutup panel">${icon('x')}</button>`;
  const tabBar = (name, list) => `<div class="lb-tabs" role="tablist">${list.map(([id, label]) => `<button type="button" role="tab" class="lb-tab" data-lb="tab" data-panel="${name}" data-id="${id}" aria-selected="${tabs[name] === id}">${label}</button>`).join('')}${closeBtn}</div>`;
  const chips = (list, key, cur, withIcon) => `<div class="lb-chips">${list.map((x) => `<button type="button" class="chip" data-lb="room-set" data-key="${key}" data-id="${x.id}" aria-pressed="${cur === x.id}">${withIcon && x.icon ? icon(x.icon) : ''}${x.name}${key === 'time' && x.id === 'auto' ? ` <span class="count">${nameOf(TIMES, resolveTime('auto'))}</span>` : ''}</button>`).join('')}</div>`;

  function renderScenePanel() {
    const p = panel('scene');
    const head = tabBar('scene', [['view', 'Pemandangan'], ['sound', 'Suara alam']]);
    if (tabs.scene === 'view') {
      const r = roomCfg();
      const pl = r.place;
      const showEdit = r.live && (!pl || editingLoc);
      const loc = `<div class="lb-loc">
          <div class="lb-loc-row">${icon('pin')}<b translate="no">${pl ? escapeHtml(pl.name) : 'Belum ada lokasi'}</b>
            ${pl ? `<button type="button" class="lb-link" data-lb="loc-edit" aria-expanded="${showEdit}">${showEdit ? 'Batal' : 'Ganti'}</button>` : ''}</div>
          ${showEdit ? `<div class="lb-loc-edit">
            <button type="button" class="lb-btn" data-lb="gps">${icon('locate')}<span>Pakai lokasiku sekarang</span></button>
            <form class="lb-city" data-lb-form="city" role="search"><input type="search" placeholder="Atau cari kota, mis. Batam" aria-label="Cari kota" enterkeyhint="search"><button type="submit" class="lb-ico sm" aria-label="Cari kota">${icon('search')}</button></form>
            <div class="lb-loc-results">${cityResults.map((c, i) => `<button type="button" class="lb-res" data-lb="loc-pick" data-i="${i}" translate="no">${icon('pin')}<span>${escapeHtml(c.label)}</span></button>`).join('')}</div>
          </div>` : ''}
        </div>`;
      p.innerHTML = `${head}
        <div class="lb-spots" role="radiogroup" aria-label="Tempat">${SPOTS.map((x) => `<button type="button" class="lb-spot" role="radio" data-lb="spot" data-id="${x.id}" aria-checked="${(r.spot || 'room') === x.id}">${icon(x.icon)}<span>${x.name}</span></button>`).join('')}</div>
        <label class="lb-switch lb-live"><input type="checkbox" data-lb="live" ${r.live ? 'checked' : ''}><span><b>Ikuti cuaca & waktu nyata</b><small class="lb-live-info">${escapeHtml(liveInfoText())}</small></span></label>
        ${r.live ? loc : `<h4 class="lb-sub">Cuaca</h4>${chips(WEATHERS, 'weather', r.weather, true)}
        <h4 class="lb-sub">Waktu</h4>${chips(TIMES, 'time', r.time)}`}
        <h4 class="lb-sub">Di luar jendela</h4>${chips(LOCATIONS, 'loc', r.loc)}
        <p class="lb-status" aria-live="polite"></p>
        ${r.live ? '<p class="lb-credit">Data cuaca: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a></p>' : ''}`;
      watchBusy();
      return;
    }
    renderSoundTab(p, head);
  }
  /** Pilihan suasana berubah → cukup tandai tombol yang aktif (panel tidak dibangun ulang). */
  function updateScenePanel() {
    const p = panel('scene');
    if (!p || p.hidden || tabs.scene !== 'view') return;
    const r = roomCfg();
    p.querySelectorAll('[data-lb="room-set"]').forEach((b) => b.setAttribute('aria-pressed', String(r[b.dataset.key] === b.dataset.id)));
    p.querySelectorAll('[data-lb="spot"]').forEach((b) => b.setAttribute('aria-checked', String((r.spot || 'room') === b.dataset.id)));
    renderLiveInfo();
  }

  /** Tab suara: yang sedang berbunyi (dengan slider) di atas, sisanya kisi ikon — ketuk untuk menyalakan. */
  function renderSoundTab(p = panel('scene'), head = tabBar('scene', [['view', 'Pemandangan'], ['sound', 'Suara alam']])) {
    const c = cfg();
    const mix = c.mix || {};
    const all = [...amb.SOUNDS.map((x) => ({ ...x, custom: false })), ...c.customSounds.map((x) => ({ id: x.id, name: x.name, icon: 'music', custom: true }))];
    const isOn = (x) => (mix[x.id] || 0) > 0;
    const on = all.filter(isOn);
    const off = all.filter((x) => !isOn(x));
    const keep = p.scrollTop;
    p.innerHTML = `${head}
      ${amb.isSupported() ? '' : '<p class="lb-hint">Browser ini tidak mendukung Web Audio.</p>'}
      <label class="lb-switch"><input type="checkbox" data-lb="room-auto" ${roomCfg().autoSound ? 'checked' : ''}><span><b>Ikuti suasana</b><small>Suara menyesuaikan pemandangan, cuaca & waktu.</small></span></label>
      <div class="lb-master">${icon('volume')}<input type="range" min="0" max="100" value="${Math.round(c.master * 100)}" data-lb="master" aria-label="Volume suara alam"></div>
      ${c.presets.length ? `<div class="lb-chips lb-presets">${c.presets.map((pr, i) => `<button type="button" class="chip" data-lb="preset" data-i="${i}">${escapeHtml(pr.name)} <span class="count" data-lb="del-preset" data-i="${i}" title="Hapus racikan">✕</span></button>`).join('')}</div>` : ''}
      <h4 class="lb-sub">Sedang berbunyi</h4>
      <div class="lb-mix">${on.length ? on.map((x) => sliderRow(x.id, x.name, x.icon, mix[x.id], x.custom)).join('') : '<p class="lb-hint lb-empty">Belum ada suara. Ketuk salah satu di bawah.</p>'}</div>
      <h4 class="lb-sub">Tambah suara</h4>
      <div class="lb-grid">${off.map((x) => `<button type="button" class="lb-gbtn" data-lb="add-snd" data-id="${escapeHtml(x.id)}" title="Nyalakan ${escapeHtml(x.name)}">${icon(x.icon)}<span>${escapeHtml(x.name)}</span></button>`).join('')}</div>
      <form class="lb-save" data-lb-form="preset" hidden><input type="text" maxlength="24" placeholder="Nama racikan, mis. Hujan sore" aria-label="Nama racikan"><button type="submit" class="lb-btn primary">Simpan</button></form>
      <details class="lb-more"><summary class="lb-btn">${icon('more')}<span>Lainnya</span></summary>
        <div class="lb-more-menu">
          <button type="button" data-lb="save-preset">${icon('plus')}<span>Simpan racikan ini</span></button>
          <button type="button" data-lb="upload-snd">${icon('upload')}<span>Tambah suara sendiri</span></button>
          <button type="button" data-lb="mute-amb">${icon('volumeX')}<span>Matikan semua suara</span></button>
        </div></details>`;
    p.scrollTop = keep;
  }
  function sliderRow(id, name, ic, val, removable = false) {
    return `<div class="lb-mix-row on" data-id="${escapeHtml(id)}">
      <button type="button" class="lb-mix-ic" data-lb="toggle-snd" data-id="${escapeHtml(id)}" aria-pressed="true" title="Matikan ${escapeHtml(name)}">${icon(ic)}</button>
      <label><span>${escapeHtml(name)}</span><input type="range" min="0" max="100" value="${Math.round(val * 100)}" data-lb="vol" data-id="${escapeHtml(id)}" aria-label="Volume ${escapeHtml(name)}"></label>
      ${removable ? `<button type="button" class="lb-ico sm" data-lb="del-snd" data-id="${escapeHtml(id)}" aria-label="Hapus suara ${escapeHtml(name)}">${icon('trash')}</button>` : ''}
    </div>`;
  }
  function syncMixSliders() {
    const p = panel('scene');
    if (!p || p.hidden || tabs.scene !== 'sound') return;
    p.querySelectorAll('.lb-mix-row').forEach((row) => {
      const v = amb.level(row.dataset.id);
      row.classList.toggle('on', v > 0);
      const r = row.querySelector('input');
      if (document.activeElement !== r) r.value = Math.round(v * 100);
    });
  }

  function renderTimerPanel() {
    const p = panel('timer');
    const head = tabBar('timer', [['focus', 'Fokus'], ['sleep', 'Timer tidur']]);
    if (tabs.timer === 'focus') {
      const pc = cfg().pomo;
      const today = todaySessions();
      p.innerHTML = `${head}
        <p class="lb-lead">Kerja fokus, lalu istirahat singkat. Setiap 4 sesi ada istirahat panjang.</p>
        <h4 class="lb-sub">Durasi fokus / istirahat</h4>
        <div class="lb-chips">${FOCUS_PRESETS.map(([a, b, l]) => `<button type="button" class="chip" data-lb="pomo-len" data-v="${a},${b},${l}" aria-pressed="${a === pc.work}">${a} / ${b} menit</button>`).join('')}</div>
        <div class="lb-row">${pomo.active
          ? `<button type="button" class="lb-btn primary" data-lb="pomo-toggle">${icon(pomo.running ? 'pause' : 'play', 'fill')}<span>${pomo.running ? 'Jeda' : 'Lanjutkan'}</span></button><button type="button" class="lb-btn" data-lb="pomo-stop">${icon('x')}<span>Hentikan</span></button>`
          : `<button type="button" class="lb-btn primary" data-lb="pomo-start">${icon('play', 'fill')}<span>Mulai fokus</span></button>`}</div>
        ${today ? `<p class="lb-hint">Sesi selesai hari ini: <b>${today}</b></p>` : ''}`;
      return;
    }
    const on = sleepTimer && sleepTimer.active;
    p.innerHTML = `${head}
      <p class="lb-lead">Musik & suara alam memelan perlahan lalu berhenti, layar ikut meredup.</p>
      <div class="lb-chips">${SLEEP_PRESETS.map((m) => `<button type="button" class="chip" data-lb="sleep-set" data-min="${m}">${m} menit</button>`).join('')}
        <button type="button" class="chip" data-lb="sleep-set" data-min="track" aria-pressed="${!!(sleepTimer && sleepTimer.endOfTrack)}">Akhir lagu ini</button></div>
      ${on ? `<div class="lb-row">${sleepTimer.endOfTrack ? '' : '<button type="button" class="lb-btn" data-lb="sleep-add">+15 menit</button>'}<button type="button" class="lb-btn" data-lb="sleep-cancel">${icon('x')}<span>Batalkan</span></button></div>` : ''}`;
  }

  function renderSettingsPanel() {
    const c = cfg();
    const tog = (key, label, hint) => `<label class="lb-switch"><input type="checkbox" data-lb="set" data-key="${key}" ${c[key] ? 'checked' : ''}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    panel('settings').innerHTML = `<div class="lb-tabs"><span class="lb-tab-title">Setelan</span>${closeBtn}</div>
      <label class="lb-field"><span>Nama panggilan</span><input type="text" maxlength="24" value="${escapeHtml(c.nickname)}" data-lb="nickname" placeholder="mis. Vinz"></label>
      ${tog('showLyrics', 'Tampilkan lirik', 'Baris yang sedang dinyanyikan muncul di bawah jam.')}
      ${tog('autoHide', 'Sembunyikan tombol otomatis', 'Setelah 3 detik tanpa gerakan.')}
      ${tog('wake', 'Layar tetap menyala', 'Selama Lobby terbuka (kalau browser mendukung).')}
      ${tog('cafeSfx', 'Bunyi kafe', 'Lonceng pintu saat ada yang masuk/keluar & denting cangkir.')}
      ${tog('startup', 'Buka Lobby saat aplikasi dibuka', '')}
      <p class="lb-hint"><kbd>B</kbd> buka/tutup · <kbd>S</kbd> suasana · <kbd>T</kbd> timer · <kbd>Spasi</kbd> putar/jeda · <kbd>N</kbd> berikutnya · <kbd>Esc</kbd> keluar</p>`;
  }

  // ------------------------------------------------------------------ jam (angka bergulir), lagu, lirik
  function setClock(text) {
    const box = $('.lb-clock');
    const old = box.dataset.v || '';
    if (old === text) return;
    box.dataset.v = text;
    box.setAttribute('aria-label', text);
    box.innerHTML = [...text].map((ch, i) => `<span class="${ch === ':' ? 'colon' : 'dg'}${old && old[i] !== ch ? ' roll' : ''}">${ch}</span>`).join('');
  }
  function tickClock() {
    const now = new Date();
    const c = store.ui.lobby || cfg();
    setClock(now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':'));
    $('.lb-date-day').textContent = now.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
    $('.lb-greet').textContent = `${greeting(now.getHours())}${c.nickname ? `, ${c.nickname}` : ''}`;
    tickDim();
    tickCafe();
    if (now.getSeconds() === 0) { // tiap menit: waktu/cuaca berganti? siapkan lukisan berikutnya?
      const r = roomCfg();
      if (r.live) refreshWeather();
      if (r.live || r.time === 'auto') {
        if (sceneKey(roomResolved()) !== lastSceneKey) syncRoom({ sound: true });
        prepareNext();
      }
    }
  }
  function tickLyric() {
    const box = $('.lb-lyric');
    if (!(store.ui.lobby || {}).showLyrics || !player.current) { if (box.dataset.line) { box.textContent = ''; box.dataset.line = ''; } return; }
    if (!player.isPlaying) return; // lagu dijeda: baris lirik tidak berubah
    const line = getLyric() || '';
    if (box.dataset.line !== line) {
      box.dataset.line = line;
      box.classList.remove('in'); void box.offsetWidth;
      box.textContent = line;
      if (line) box.classList.add('in');
    }
  }
  function renderNP() {
    if (!el) return;
    const cur = player.current;
    const box = $('.lb-np');
    const ids = amb.activeIds();
    const sound = `<button type="button" class="lb-ico sm lb-snd${ids.length ? ' on' : ''}" data-lb="panel" data-id="scene" data-tab="sound" title="${ids.length ? `Suara alam: ${escapeHtml(ids.map(soundName).join(', '))}` : 'Suara alam mati'}" aria-label="Suara alam">${icon(ids.length ? 'waves' : 'volumeX')}</button>`;
    if (!cur) {
      box.innerHTML = `<button type="button" class="lb-np-play" data-lb="play-something">${icon('play', 'fill')}<span>Putar musik</span></button>${sound}`;
      return;
    }
    const v = store.data.videos[cur.youtubeId] || {};
    box.innerHTML = `
      <button type="button" class="lb-np-main" data-lb="to-lyrics" title="Buka lirik" aria-label="Buka lirik">
        <img data-id="${escapeHtml(cur.youtubeId)}" data-q="mqdefault" src="${thumbUrl(cur.youtubeId, 'mqdefault')}" alt="">
        <span class="lb-np-text" translate="no"><b>${escapeHtml(v.title || 'Memuat judul…')}</b><span>${escapeHtml(v.channel || '')}</span></span>
        <span class="lb-np-lyr" aria-hidden="true">${icon('mic')}</span>
      </button>
      <div class="lb-np-ctl">
        <button type="button" class="lb-ico sm" data-lb="prev" aria-label="Sebelumnya">${icon('prev')}</button>
        <button type="button" class="lb-ico lb-pp" data-lb="toggle" aria-label="${player.isPlaying ? 'Jeda' : 'Putar'}">${icon(player.isPlaying ? 'pause' : 'play', 'fill')}</button>
        <button type="button" class="lb-ico sm" data-lb="next" aria-label="Berikutnya">${icon('next')}</button>
        ${sound}
      </div>`;
  }

  // ------------------------------------------------------------------ widget kecil (muncul hanya saat aktif)
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function pomoCfg() { const p = cfg().pomo; return { work: p.work, brk: p.brk, long: p.long, every: 4 }; }
  function renderWidgets() {
    if (!el) return;
    const wp = $('.lb-pomo'); const ws = $('.lb-sleep');
    wp.hidden = !pomo.active;
    if (pomo.active) {
      const p = pomoCfg();
      const total = (pomo.phase === 'work' ? p.work : pomo.phase === 'long' ? p.long : p.brk) * 60;
      const frac = Math.max(0, Math.min(1, pomo.remaining / total));
      const R = 16; const Cc = 2 * Math.PI * R;
      wp.innerHTML = `<svg class="lb-mini-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${R}" class="bg"/><circle cx="20" cy="20" r="${R}" class="fg" style="stroke-dasharray:${Cc};stroke-dashoffset:${Cc * (1 - frac)}"/></svg>
        <div class="lb-w-text"><b>${fmt(pomo.remaining)}</b><span>${PHASE[pomo.phase]} · sesi ${pomo.sessions + (pomo.phase === 'work' ? 1 : 0)}</span></div>
        <button type="button" class="lb-ico sm" data-lb="pomo-toggle" aria-label="${pomo.running ? 'Jeda' : 'Lanjutkan'}">${icon(pomo.running ? 'pause' : 'play', 'fill')}</button>
        <button type="button" class="lb-ico sm" data-lb="pomo-skip" aria-label="Lewati fase" title="Lewati fase">${icon('next')}</button>
        <button type="button" class="lb-ico sm" data-lb="pomo-stop" aria-label="Hentikan fokus" title="Hentikan">${icon('x')}</button>`;
    }
    const on = !!(sleepTimer && sleepTimer.active);
    ws.hidden = !on;
    if (on) {
      const track = sleepTimer.endOfTrack;
      const text = `<span class="lb-w-ic">${icon('moon')}</span><div class="lb-w-text"><b>${track ? 'Akhir lagu' : fmt(sleepTimer.remaining())}</b><span>Timer tidur</span></div>`;
      const btns = `${track ? '' : `<button type="button" class="lb-ico sm" data-lb="sleep-add" aria-label="Tambah 15 menit" title="+15 menit">${icon('plus')}</button>`}
        <button type="button" class="lb-ico sm" data-lb="sleep-cancel" aria-label="Batalkan timer tidur" title="Batalkan">${icon('x')}</button>`;
      // ganti angka saja tiap detik; tombol dibuat ulang hanya saat jenisnya berubah
      if (ws.dataset.kind !== String(track)) { ws.dataset.kind = String(track); ws.innerHTML = text + btns; } else ws.querySelector('.lb-w-text b').textContent = track ? 'Akhir lagu' : fmt(sleepTimer.remaining());
    } else ws.dataset.kind = '';
  }
  /** Sesi fokus selesai hari ini (disimpan, mulai dari 0 setiap hari). */
  const dayKey = () => new Date().toDateString();
  function todaySessions() { const d = cfg().pomoDay; return d && d.day === dayKey() ? d.n : 0; }
  function countSession() { cfg().pomoDay = { day: dayKey(), n: todaySessions() + 1 }; save(); }
  function pomoStep() {
    if (!pomo.running) return;
    pomo.remaining -= 1;
    if (pomo.remaining <= 0) {
      if (pomo.phase === 'work') { countSession(); if (roomCfg().spot === 'cafe') { const k = cafeOrder(); if (k.used > 0.25 || k.fused > 0.25) newOrder(); } }
      Object.assign(pomo, pomodoroNext(pomo, pomoCfg()));
      try { amb.chime(); } catch { /* abaikan */ }
      const msg = pomo.phase === 'work' ? 'Istirahat selesai — saatnya fokus lagi.' : `Sesi fokus selesai! Istirahat ${pomo.phase === 'long' ? pomoCfg().long : pomoCfg().brk} menit.`;
      toast(msg, 'success', 8000);
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) { try { new Notification('MyTube Vault', { body: tr(msg) }); } catch { /* abaikan */ } }
    }
    if (open) renderWidgets();
  }
  function startPomo() {
    const p = pomoCfg();
    Object.assign(pomo, { phase: 'work', remaining: p.work * 60, running: true, active: true });
    if (!pomo.timer) pomo.timer = setInterval(pomoStep, 1000);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }
  function stopPomo() { Object.assign(pomo, { running: false, active: false }); clearInterval(pomo.timer); pomo.timer = 0; }

  // ------------------------------------------------------------------ Timer tidur: layar ikut meredup di 10 menit terakhir
  function tickDim() {
    const left = sleepTimer && sleepTimer.active && !sleepTimer.endOfTrack ? sleepTimer.remaining() : Infinity;
    const dim = left === Infinity ? 0 : Math.max(0, Math.min(0.6, (600 - left) / 1000));
    const d = el.querySelector('.lb-dim');
    if (d.dataset.v !== String(dim)) { d.dataset.v = String(dim); d.style.opacity = String(dim); }
  }

  // ------------------------------------------------------------------ auto-hide & wake lock
  function wake() {
    if (!el) return;
    el.classList.remove('idle');
    clearTimeout(idleTimer);
    if ((store.ui.lobby || {}).autoHide !== false) idleTimer = setTimeout(() => { if (open && !el.classList.contains('panel-open') && !el.matches(':focus-within input[type=text]')) el.classList.add('idle'); }, 3000);
  }
  async function requestWake() {
    if (!cfg().wake || !('wakeLock' in navigator) || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { /* tidak diizinkan */ }
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

  // ------------------------------------------------------------------ suara sendiri
  async function loadCustomSounds() {
    if (customLoaded || !amb.isSupported()) return;
    customLoaded = true;
    for (const s of cfg().customSounds) {
      try { const buf = await getFile(`snd:${s.id}`); if (buf) await amb.addCustom(s.id, buf); } catch { /* lewati */ }
    }
    const mix = cfg().mix || {};
    if (Object.keys(mix).some((k) => k.startsWith('custom:'))) startMix(mix);
  }

  // ------------------------------------------------------------------ event
  /** Pengguna mengatur suara sendiri → matikan "Ikuti suasana" supaya racikannya tidak ditimpa lagi. */
  function manualSound() {
    const r = roomCfg();
    if (!r.autoSound) return;
    r.autoSound = false; save();
    toast('“Ikuti suasana” dimatikan supaya pengaturan suaramu tidak berubah sendiri.', 'info', 4500);
    const sw = el && el.querySelector('[data-lb="room-auto"]'); if (sw) sw.checked = false;
  }
  function setMixLevel(id, v, manual = true) {
    if (manual) manualSound();
    const c = cfg();
    c.mix = { ...(c.mix || {}) };
    if (v > 0) c.mix[id] = v; else delete c.mix[id];
    save();
    try { amb.setLevel(id, v); } catch (e) { toast(e.message, 'error'); }
  }


  async function onClick(e) {
    const b = e.target.closest('[data-lb]');
    if (!b) {
      if (!e.target.closest('.lb-panel, .lb-chrome, .lb-widgets')) closePanels();
      return;
    }
    const act = b.dataset.lb;
    const c = cfg();
    switch (act) {
      case 'close': hide(); break;
      case 'panel': openPanel(b.dataset.id, b.dataset.tab); break;
      case 'tab': tabs[b.dataset.panel] = b.dataset.id; renderPanel(b.dataset.panel); break;
      case 'close-panel': closePanels(); break;
      case 'unlock': unlockAudio(); break;
      case 'upload-snd': closeMore(); $('.lb-file-snd').click(); break;
      case 'toggle-snd': { const id = b.dataset.id; setMixLevel(id, 0); renderSoundTab(); break; }
      case 'add-snd': { setMixLevel(b.dataset.id, 0.5); renderSoundTab(); break; }
      case 'del-snd': {
        const id = b.dataset.id;
        amb.removeCustom(id);
        await deleteFile(`snd:${id}`).catch(() => {});
        c.customSounds = c.customSounds.filter((s) => s.id !== id);
        if (c.mix) delete c.mix[id];
        save(); renderSoundTab();
        break;
      }
      case 'mute-amb': manualSound(); amb.stopAll(); c.mix = {}; save(); renderNP(); renderSoundTab(); break;
      case 'preset': {
        const del = e.target.closest('[data-lb="del-preset"]');
        if (del) { c.presets.splice(Number(del.dataset.i), 1); save(); renderSoundTab(); break; }
        const p = c.presets[Number(b.dataset.i)];
        if (p) { manualSound(); c.mix = { ...p.mix }; save(); startMix(c.mix); setTimeout(() => renderSoundTab(), 60); toast(`Racikan “${p.name}”`, 'info', 1500); }
        break;
      }
      case 'save-preset': {
        closeMore();
        if (!Object.keys(amb.currentMix()).length) { toast('Nyalakan beberapa suara dulu.', 'info'); break; }
        const f = el.querySelector('[data-lb-form="preset"]');
        f.hidden = false; const inp = f.querySelector('input'); inp.value = ''; inp.focus();
        break;
      }
      case 'spot': {
        const r = roomCfg();
        if ((r.spot || 'room') === b.dataset.id) break;
        r.spot = b.dataset.id; save(); syncRoom({ sound: true }); if (r.spot === 'cafe') pushCafe();
        break;
      }
      case 'loc-edit': editingLoc = !editingLoc; cityResults = []; renderScenePanel(); focusCity(); break;
      case 'gps': {
        const lbl = b.querySelector('span'); lbl.textContent = 'Mencari lokasi…'; b.disabled = true;
        try {
          const pos = await geolocate();
          const name = await placeName(pos.lat, pos.lon, LANG);
          setPlace({ name: name || 'Lokasimu', ...pos });
        } catch (err) { toast(err.message, 'error', 6000); lbl.textContent = 'Pakai lokasiku sekarang'; b.disabled = false; focusCity(); }
        break;
      }
      case 'loc-pick': { const p = cityResults[Number(b.dataset.i)]; if (p) setPlace(p); break; }
      case 'room-set': {
        const r = roomCfg();
        if (r[b.dataset.key] === b.dataset.id) break;
        r[b.dataset.key] = b.dataset.id; save(); syncRoom({ sound: true });
        break;
      }
      case 'play-something': playSomething(); break;
      case 'to-lyrics': toLyrics(); break;
      case 'prev': player.prev(); break;
      case 'next': player.next(); break;
      case 'toggle': player.toggle(); break;
      case 'pomo-len': {
        const [w, br, l] = b.dataset.v.split(',').map(Number);
        c.pomo = { work: w, brk: br, long: l }; save();
        if (pomo.active && !pomo.running) pomo.remaining = (pomo.phase === 'work' ? w : pomo.phase === 'long' ? l : br) * 60;
        renderTimerPanel(); renderWidgets();
        break;
      }
      case 'pomo-start': startPomo(); renderTimerPanel(); renderWidgets(); closePanels(); break;
      case 'pomo-toggle':
        pomo.running = !pomo.running;
        if (pomo.running && !pomo.timer) pomo.timer = setInterval(pomoStep, 1000);
        renderWidgets(); if (!panel('timer').hidden) renderTimerPanel();
        break;
      case 'pomo-skip': pomo.remaining = 1; pomo.running = true; if (!pomo.timer) pomo.timer = setInterval(pomoStep, 1000); pomoStep(); break;
      case 'pomo-stop': stopPomo(); renderWidgets(); if (!panel('timer').hidden) renderTimerPanel(); break;
      case 'sleep-set': sleepTimer.set(b.dataset.min === 'track' ? 'track' : Number(b.dataset.min)); closePanels(); break;
      case 'sleep-add': sleepTimer.add(15); break;
      case 'sleep-cancel': sleepTimer.set(0); tickDim(); break;
      default: break;
    }
  }
  function closeMore() { const d = el.querySelector('.lb-more[open]'); if (d) d.open = false; }
  const focusCity = () => setTimeout(() => { const i = el.querySelector('.lb-city input'); if (i) i.focus(); }, 30);
  async function onSubmit(e) {
    const city = e.target.closest('[data-lb-form="city"]');
    if (city) {
      e.preventDefault();
      const q = city.querySelector('input').value.trim();
      if (q.length < 2) return;
      const box = el.querySelector('.lb-loc-results');
      box.innerHTML = '<p class="lb-hint">Mencari…</p>';
      try {
        cityResults = await searchCity(q, LANG);
        box.innerHTML = cityResults.length
          ? cityResults.map((c, i) => `<button type="button" class="lb-res" data-lb="loc-pick" data-i="${i}" translate="no">${icon('pin')}<span>${escapeHtml(c.label)}</span></button>`).join('')
          : `<p class="lb-hint">Kota “${escapeHtml(q)}” tidak ditemukan.</p>`;
      } catch (err) { box.innerHTML = `<p class="lb-hint">Tidak bisa mencari kota (${escapeHtml(err.message)}).</p>`; }
      return;
    }
    const f = e.target.closest('[data-lb-form="preset"]');
    if (!f) return;
    e.preventDefault();
    const name = f.querySelector('input').value.trim();
    const mix = amb.currentMix();
    if (!name || !Object.keys(mix).length) { f.hidden = true; return; }
    cfg().presets.push({ name: name.slice(0, 24), mix });
    save(); renderSoundTab();
    toast(`Racikan “${name.slice(0, 24)}” disimpan.`, 'success', 2000);
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.lb === 'vol') setMixLevel(t.dataset.id, Number(t.value) / 100);
    if (t.dataset.lb === 'master') { cfg().master = Number(t.value) / 100; save(); amb.setMaster(cfg().master); }
    if (t.dataset.lb === 'nickname') { cfg().nickname = t.value.trim(); save(); tickClock(); }
  }
  async function onChange(e) {
    const t = e.target;
    const c = cfg();
    if (t.dataset.lb === 'live') {
      const r = roomCfg();
      r.live = t.checked;
      if (r.live && !r.place) editingLoc = true;
      save(); renderScenePanel(); syncRoom({ sound: true });
      if (r.live) { if (r.place) refreshWeather(); else focusCity(); }
      return;
    }
    if (t.dataset.lb === 'room-auto') { roomCfg().autoSound = t.checked; save(); if (t.checked) syncRoom({ sound: true }); return; }
    if (t.dataset.lb === 'set') {
      c[t.dataset.key] = t.checked; save();
      if (t.dataset.key === 'wake') { if (t.checked) requestWake(); else releaseWake(); }
      if (t.dataset.key === 'autoHide') wake();
      return;
    }
    if (t.classList.contains('lb-file-snd') && t.files[0]) {
      const f = t.files[0];
      t.value = '';
      if (f.size > 20 * 1024 * 1024) { toast('File suara terlalu besar (maks. 20 MB).', 'error'); return; }
      try {
        const buf = await f.arrayBuffer();
        const id = `custom:${Date.now().toString(36)}`;
        await amb.addCustom(id, buf);
        await putFile(`snd:${id}`, buf);
        c.customSounds.push({ id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 28) });
        save();
        setMixLevel(id, 0.5);
        renderSoundTab();
        toast('Suara ditambahkan dan diputar berulang.', 'success');
      } catch (err) { toast(`Tidak bisa memakai file ini (${err.message || 'format tidak didukung'}).`, 'error'); }
    }
  }

  return {
    open: show,
    close: hide,
    toggle: () => (open ? hide() : show()),
    isOpen: () => open,
    /** Dipanggil saat status player berubah. */
    update(type) {
      if (!el || !open) return;
      if (type === 'track' || type === 'state' || type === 'queue') renderNP();
      if (type === 'track') { $('.lb-lyric').textContent = ''; $('.lb-lyric').dataset.line = ''; }
    },
    /** Untuk Escape: tutup panel dulu, baru Lobby. */
    escape() { if (!open) return false; if (el.classList.contains('panel-open')) closePanels(); else hide(); return true; },
    ambientActive: () => amb.isPlaying(),
    /** Siapkan lukisan suasana saat ini di latar belakang (dipanggil saat aplikasi senggang). */
    prewarm() {
      if (open) return;
      // cuaca nyata: ambil cuaca terbaru dulu, supaya lukisan yang disiapkan sudah sesuai
      refreshWeather().finally(() => { if (!open) prewarmRoom(roomResolved(), window.innerWidth, window.innerHeight, canvasDpr()); });
    },
    /** Pintasan khusus Lobby: S = suasana, T = timer. */
    key(k) {
      if (!open) return false;
      if (k === 's' || k === 'S') { openPanel('scene'); return true; }
      if (k === 't' || k === 'T') { openPanel('timer'); return true; }
      return false;
    },
    openMixer() { show(); openPanel('scene', 'sound'); },
    toLyrics,
    openScene() { show(); openPanel('scene', 'view'); },
    openFocus() { show(); openPanel('timer', 'focus'); },
    openSleep() { show(); openPanel('timer', 'sleep'); },
    get phone() { return isPhone(); },
  };
}
