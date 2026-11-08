// Lobby: layar santai penuh — Kamar santai yang dilukis, jam, lagu yang diputar, lirik, suara alam,
// serta alat Fokus (Pomodoro) dan Timer tidur. Tampilan sengaja minimalis: 4 ikon di kanan atas dan
// satu bar musik tipis di bawah; semuanya menghilang saat tidak ada gerakan.

import * as amb from './ambient.js';
import { createSceneRunner } from './scenes.js';
import { putFile, getFile, deleteFile } from './idb.js';
import { LOCATIONS, WEATHERS, TIMES, resolveTime, roomSoundMix } from './room.js';
import { escapeHtml } from './utils.js';
import { thumbUrl } from './metadata.js';

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
export const SLEEP_PRESETS = [15, 30, 45, 60, 90];

const DEFAULTS = { room: { loc: 'mountain', weather: 'rain', time: 'auto', autoSound: true }, mix: null, master: 0.8, presets: [], lowPower: false, autoHide: true, startup: false, nickname: '', showLyrics: true, wake: true, customSounds: [], pomo: { work: 25, brk: 5, long: 15 } };
const PHASE = { work: 'Fokus', break: 'Istirahat', long: 'Istirahat panjang' };

export function createLobby({ store, player, icon, toast, getLyric, playSomething, onOpenChange, isPhone }) {
  const cfg = () => {
    const c = { ...DEFAULTS, ...(store.ui.lobby || {}) };
    // bersihkan sisa versi lama (mode/latar lain sudah dihapus)
    if (c.hasBg) { deleteFile('lobby-bg').catch(() => {}); }
    delete c.mode; delete c.scene; delete c.hasBg;
    store.ui.lobby = c;
    return c;
  };
  const save = () => store.saveUi();
  let el = null;
  let runner = null;
  let open = false;
  let clockTimer = 0;
  let lyricTimer = 0;
  let idleTimer = 0;
  let wakeLock = null;
  let customLoaded = false;
  const tabs = { scene: 'view', timer: 'focus' };
  const pomo = { phase: 'work', remaining: 25 * 60, sessions: 0, running: false, timer: 0, active: false };
  const sleep = { end: 0, total: 0, baseVol: null };

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
      <div class="lb-vignette" aria-hidden="true"></div>
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
        <div class="lb-lyric" aria-live="polite"></div>
        <div class="lb-widgets"><section class="lb-w lb-pomo" hidden></section><section class="lb-w lb-sleep" hidden></section></div>
        <button type="button" class="lb-unlock" data-lb="unlock" hidden>${icon('volume')}<span>Ketuk untuk menyalakan suara</span></button>
      </main>
      <footer class="lb-bottom lb-chrome"><div class="lb-np"></div></footer>
      <aside class="lb-panel" data-panel="scene" hidden></aside>
      <aside class="lb-panel" data-panel="timer" hidden></aside>
      <aside class="lb-panel" data-panel="settings" hidden></aside>
      <input type="file" class="lb-file-snd" accept="audio/*" hidden>`;
    document.body.appendChild(el);
    runner = createSceneRunner(el.querySelector('.lb-canvas'));
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => el.addEventListener(ev, wake, { passive: true }));
    el.addEventListener('pointerdown', () => { if (needsUnlock()) unlockAudio(); }, { capture: true });
    // parallax halus: pemandangan di luar jendela sedikit bergeser mengikuti mouse
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      runner.setState({ pointer: { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 } });
    }, { passive: true });
    amb.onChange(() => { if (open) { renderNP(); syncMixSliders(); } });
    document.addEventListener('visibilitychange', () => { if (open && !document.hidden) requestWake(); });
  }
  const $ = (sel) => el.querySelector(sel);
  const panel = (name) => $(`.lb-panel[data-panel="${name}"]`);

  // ------------------------------------------------------------------ buka / tutup
  function show() {
    if (!el) build();
    if (open) return;
    open = true;
    el.hidden = false;
    document.body.classList.add('lobby-open');
    const c = cfg();
    runner.setLowPower(c.lowPower);
    runner.setScene('room');
    syncRoom();
    if (!c.mix) c.mix = roomCfg().autoSound ? roomSoundMix(roomResolved()) : {};
    startMix(c.mix);
    save();
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
    lyricTimer = setInterval(tickLyric, 300);
    renderNP();
    renderWidgets();
    wake();
    requestWake();
    loadCustomSounds();
    onOpenChange && onOpenChange(true);
  }
  function hide() {
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
    onOpenChange && onOpenChange(false);
  }

  // ------------------------------------------------------------------ kamar santai: lokasi, cuaca, waktu
  const roomCfg = () => { const c = store.ui.lobby || cfg(); c.room = { ...DEFAULTS.room, ...(c.room || {}) }; return c.room; };
  const roomResolved = () => { const r = roomCfg(); return { loc: r.loc, weather: r.weather, time: resolveTime(r.time) }; };
  const nameOf = (list, id) => (list.find((x) => x.id === id) || list[0]).name;
  function syncRoom({ sound = false } = {}) {
    const rs = roomResolved();
    runner.setState({ room: rs });
    el.dataset.time = rs.time;
    if (sound && roomCfg().autoSound) { cfg().mix = roomSoundMix(rs); save(); startMix(cfg().mix); }
    const r = roomCfg();
    $('.lb-place').textContent = `${nameOf(LOCATIONS, r.loc)} · ${nameOf(WEATHERS, r.weather).toLowerCase()}`;
    if (!panel('scene').hidden) renderScenePanel();
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
      p.innerHTML = `${head}
        <h4 class="lb-sub">Di luar jendela</h4>${chips(LOCATIONS, 'loc', r.loc)}
        <h4 class="lb-sub">Cuaca</h4>${chips(WEATHERS, 'weather', r.weather, true)}
        <h4 class="lb-sub">Waktu</h4>${chips(TIMES, 'time', r.time)}
        <div class="lb-row"><button type="button" class="lb-btn" data-lb="room-random">${icon('shuffle')}<span>Acak</span></button></div>`;
      return;
    }
    const c = cfg();
    const mix = c.mix || {};
    p.innerHTML = `${head}
      ${amb.isSupported() ? '' : '<p class="lb-hint">Browser ini tidak mendukung Web Audio.</p>'}
      <label class="lb-switch"><input type="checkbox" data-lb="room-auto" ${roomCfg().autoSound ? 'checked' : ''}><span><b>Ikuti suasana</b><small>Suara menyesuaikan pemandangan, cuaca & waktu.</small></span></label>
      <div class="lb-master">${icon('volume')}<input type="range" min="0" max="100" value="${Math.round(c.master * 100)}" data-lb="master" aria-label="Volume suara alam"></div>
      ${c.presets.length ? `<div class="lb-chips lb-presets">${c.presets.map((pr, i) => `<button type="button" class="chip" data-lb="preset" data-i="${i}">${escapeHtml(pr.name)} <span class="count" data-lb="del-preset" data-i="${i}" title="Hapus racikan">✕</span></button>`).join('')}</div>` : ''}
      <div class="lb-mix">${amb.SOUNDS.map((s) => sliderRow(s.id, s.name, s.icon, mix[s.id] || 0)).join('')}
        ${c.customSounds.map((s) => sliderRow(s.id, s.name, 'music', mix[s.id] || 0, true)).join('')}</div>
      <div class="lb-row">
        <button type="button" class="lb-btn" data-lb="save-preset">${icon('plus')}<span>Simpan racikan</span></button>
        <button type="button" class="lb-btn" data-lb="upload-snd">${icon('upload')}<span>Suara sendiri</span></button>
        <button type="button" class="lb-btn" data-lb="mute-amb">${icon('volumeX')}<span>Matikan</span></button>
      </div>`;
  }
  function sliderRow(id, name, ic, val, removable = false) {
    return `<div class="lb-mix-row${val > 0 ? ' on' : ''}" data-id="${escapeHtml(id)}">
      <button type="button" class="lb-mix-ic" data-lb="toggle-snd" data-id="${escapeHtml(id)}" aria-pressed="${val > 0}" title="${val > 0 ? 'Matikan' : 'Nyalakan'} ${escapeHtml(name)}">${icon(ic)}</button>
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
      row.querySelector('.lb-mix-ic').setAttribute('aria-pressed', String(v > 0));
      const r = row.querySelector('input');
      if (document.activeElement !== r) r.value = Math.round(v * 100);
    });
  }

  function renderTimerPanel() {
    const p = panel('timer');
    const head = tabBar('timer', [['focus', 'Fokus'], ['sleep', 'Timer tidur']]);
    if (tabs.timer === 'focus') {
      const pc = cfg().pomo;
      p.innerHTML = `${head}
        <p class="lb-lead">Kerja fokus, lalu istirahat singkat. Setiap 4 sesi ada istirahat panjang.</p>
        <h4 class="lb-sub">Durasi fokus / istirahat</h4>
        <div class="lb-chips">${FOCUS_PRESETS.map(([a, b, l]) => `<button type="button" class="chip" data-lb="pomo-len" data-v="${a},${b},${l}" aria-pressed="${a === pc.work}">${a} / ${b} menit</button>`).join('')}</div>
        <div class="lb-row">${pomo.active
          ? `<button type="button" class="lb-btn primary" data-lb="pomo-toggle">${icon(pomo.running ? 'pause' : 'play', 'fill')}<span>${pomo.running ? 'Jeda' : 'Lanjutkan'}</span></button><button type="button" class="lb-btn" data-lb="pomo-stop">${icon('x')}<span>Hentikan</span></button>`
          : `<button type="button" class="lb-btn primary" data-lb="pomo-start">${icon('play', 'fill')}<span>Mulai fokus</span></button>`}</div>
        ${pomo.sessions ? `<p class="lb-hint">Sesi selesai hari ini: <b>${pomo.sessions}</b></p>` : ''}`;
      return;
    }
    p.innerHTML = `${head}
      <p class="lb-lead">Musik & suara alam memelan perlahan lalu berhenti, layar ikut meredup.</p>
      <div class="lb-chips">${SLEEP_PRESETS.map((m) => `<button type="button" class="chip" data-lb="sleep-set" data-min="${m}">${m} menit</button>`).join('')}</div>
      ${sleep.end ? `<div class="lb-row"><button type="button" class="lb-btn" data-lb="sleep-add">+15 menit</button><button type="button" class="lb-btn" data-lb="sleep-cancel">${icon('x')}<span>Batalkan</span></button></div>` : ''}`;
  }

  function renderSettingsPanel() {
    const c = cfg();
    const tog = (key, label, hint) => `<label class="lb-switch"><input type="checkbox" data-lb="set" data-key="${key}" ${c[key] ? 'checked' : ''}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    panel('settings').innerHTML = `<div class="lb-tabs"><span class="lb-tab-title">Setelan</span>${closeBtn}</div>
      <label class="lb-field"><span>Nama panggilan</span><input type="text" maxlength="24" value="${escapeHtml(c.nickname)}" data-lb="nickname" placeholder="mis. Vinz"></label>
      ${tog('showLyrics', 'Tampilkan lirik', 'Baris yang sedang dinyanyikan muncul di bawah jam.')}
      ${tog('autoHide', 'Sembunyikan tombol otomatis', 'Setelah 3 detik tanpa gerakan.')}
      ${tog('lowPower', 'Hemat baterai', 'Animasi lebih ringan (24 fps, resolusi lebih rendah).')}
      ${tog('wake', 'Layar tetap menyala', 'Selama Lobby terbuka (kalau browser mendukung).')}
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
    setClock(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':'));
    $('.lb-date-day').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    $('.lb-greet').textContent = `${greeting(now.getHours())}${c.nickname ? `, ${c.nickname}` : ''}`;
    if (sleep.end) tickSleep();
    if (roomCfg().time === 'auto' && now.getSeconds() === 0) syncRoom({ sound: true });
  }
  function tickLyric() {
    const box = $('.lb-lyric');
    if (!(store.ui.lobby || {}).showLyrics || !player.current) { box.textContent = ''; box.dataset.line = ''; return; }
    const line = getLyric() || '';
    if (box.dataset.line !== line) {
      box.dataset.line = line;
      box.classList.remove('in'); void box.offsetWidth;
      box.textContent = line;
      if (line) box.classList.add('in');
    }
  }
  // artwork: coba beberapa ukuran — sebagian video tidak punya mqdefault (YouTube mengembalikan gambar abu 120px)
  const QUALITIES = ['mqdefault', 'hqdefault', 'sddefault', 'default'];
  function artFallback(img) {
    const next = () => {
      const i = QUALITIES.indexOf(img.dataset.q) + 1;
      if (i >= QUALITIES.length) { img.classList.add('none'); return; }
      img.dataset.q = QUALITIES[i]; img.src = thumbUrl(img.dataset.id, QUALITIES[i]);
    };
    img.addEventListener('error', next);
    img.addEventListener('load', () => { if (img.naturalWidth <= 120 && img.dataset.q !== 'default') next(); });
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
      <img data-id="${escapeHtml(cur.youtubeId)}" data-q="mqdefault" src="${thumbUrl(cur.youtubeId, 'mqdefault')}" alt="">
      <div class="lb-np-text"><b>${escapeHtml(v.title || 'Memuat judul…')}</b><span>${escapeHtml(v.channel || '')}</span></div>
      <div class="lb-np-ctl">
        <button type="button" class="lb-ico sm" data-lb="prev" aria-label="Sebelumnya">${icon('prev')}</button>
        <button type="button" class="lb-ico lb-pp" data-lb="toggle" aria-label="${player.isPlaying ? 'Jeda' : 'Putar'}">${icon(player.isPlaying ? 'pause' : 'play', 'fill')}</button>
        <button type="button" class="lb-ico sm" data-lb="next" aria-label="Berikutnya">${icon('next')}</button>
        ${sound}
      </div>`;
    artFallback(box.querySelector('img'));
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
    ws.hidden = !sleep.end;
    if (sleep.end) {
      const left = Math.max(0, (sleep.end - Date.now()) / 1000);
      ws.innerHTML = `<span class="lb-w-ic">${icon('moon')}</span><div class="lb-w-text"><b>${fmt(left)}</b><span>Timer tidur</span></div>
        <button type="button" class="lb-ico sm" data-lb="sleep-add" aria-label="Tambah 15 menit" title="+15 menit">${icon('plus')}</button>
        <button type="button" class="lb-ico sm" data-lb="sleep-cancel" aria-label="Batalkan timer tidur" title="Batalkan">${icon('x')}</button>`;
    }
  }
  function pomoStep() {
    if (!pomo.running) return;
    pomo.remaining -= 1;
    if (pomo.remaining <= 0) {
      Object.assign(pomo, pomodoroNext(pomo, pomoCfg()));
      try { amb.chime(); } catch { /* abaikan */ }
      const msg = pomo.phase === 'work' ? 'Istirahat selesai — saatnya fokus lagi.' : `Sesi fokus selesai! Istirahat ${pomo.phase === 'long' ? pomoCfg().long : pomoCfg().brk} menit.`;
      toast(msg, 'success', 8000);
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) { try { new Notification('MyTube Vault', { body: msg }); } catch { /* abaikan */ } }
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

  // ------------------------------------------------------------------ Timer tidur
  function setSleepTimer(min) {
    sleep.total = min * 60;
    sleep.end = Date.now() + min * 60000;
    sleep.baseVol = null;
    toast(`Timer tidur ${min} menit dimulai. Selamat beristirahat.`, 'info');
  }
  function cancelSleep(restore = true) {
    if (restore && sleep.baseVol != null) player.setVolume(sleep.baseVol);
    if (restore) amb.setMaster(cfg().master, 0.5);
    sleep.end = 0; sleep.baseVol = null;
    runner.setState({ dim: 0 });
  }
  function tickSleep() {
    const left = (sleep.end - Date.now()) / 1000;
    const FADE = 90;
    if (left <= FADE && left > 0) {
      if (sleep.baseVol == null) sleep.baseVol = player.volume();
      const f = left / FADE;
      if (player.isPlaying) player.setVolume(Math.round(sleep.baseVol * f));
      amb.setMaster(cfg().master * f, 0.9);
    }
    runner.setState({ dim: Math.max(0, Math.min(0.6, (600 - left) / 1000)) });
    if (left <= 0) {
      player.pause();
      amb.stopAll();
      const base = sleep.baseVol;
      setTimeout(() => { if (base != null) player.setVolume(base); amb.setMaster(cfg().master, 0.1); }, 1500);
      sleep.end = 0; sleep.baseVol = null;
      toast('Timer tidur selesai. Selamat tidur 🌙', 'info', 6000);
    }
    if (open) renderWidgets();
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
  function setMixLevel(id, v) {
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
      case 'upload-snd': $('.lb-file-snd').click(); break;
      case 'toggle-snd': { const id = b.dataset.id; setMixLevel(id, amb.level(id) > 0 ? 0 : 0.5); break; }
      case 'del-snd': {
        const id = b.dataset.id;
        amb.removeCustom(id);
        await deleteFile(`snd:${id}`).catch(() => {});
        c.customSounds = c.customSounds.filter((s) => s.id !== id);
        if (c.mix) delete c.mix[id];
        save(); renderScenePanel();
        break;
      }
      case 'mute-amb': amb.stopAll(); c.mix = {}; save(); renderNP(); syncMixSliders(); break;
      case 'preset': {
        const del = e.target.closest('[data-lb="del-preset"]');
        if (del) { c.presets.splice(Number(del.dataset.i), 1); save(); renderScenePanel(); break; }
        const p = c.presets[Number(b.dataset.i)];
        if (p) { c.mix = { ...p.mix }; save(); startMix(c.mix); setTimeout(syncMixSliders, 50); toast(`Racikan “${p.name}”`, 'info', 1500); }
        break;
      }
      case 'save-preset': {
        const mix = amb.currentMix();
        if (!Object.keys(mix).length) { toast('Nyalakan beberapa suara dulu.', 'info'); break; }
        const name = prompt('Nama racikan:', 'Racikanku') || '';
        if (!name.trim()) break;
        c.presets.push({ name: name.trim().slice(0, 24), mix });
        save(); renderScenePanel();
        break;
      }
      case 'room-set': roomCfg()[b.dataset.key] = b.dataset.id; save(); syncRoom({ sound: true }); break;
      case 'room-random': {
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)].id;
        Object.assign(roomCfg(), { loc: pick(LOCATIONS), weather: pick(WEATHERS) });
        save(); syncRoom({ sound: true });
        break;
      }
      case 'play-something': playSomething(); break;
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
      case 'sleep-set': setSleepTimer(Number(b.dataset.min)); renderWidgets(); closePanels(); break;
      case 'sleep-add': sleep.end += 15 * 60000; renderWidgets(); break;
      case 'sleep-cancel': cancelSleep(); renderWidgets(); if (!panel('timer').hidden) renderTimerPanel(); toast('Timer tidur dibatalkan.'); break;
      default: break;
    }
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
    if (t.dataset.lb === 'room-auto') { roomCfg().autoSound = t.checked; save(); if (t.checked) syncRoom({ sound: true }); return; }
    if (t.dataset.lb === 'set') {
      c[t.dataset.key] = t.checked; save();
      if (t.dataset.key === 'lowPower') runner.setLowPower(t.checked);
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
        renderScenePanel();
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
    /** Pintasan khusus Lobby: S = suasana, T = timer. */
    key(k) {
      if (!open) return false;
      if (k === 's' || k === 'S') { openPanel('scene'); return true; }
      if (k === 't' || k === 'T') { openPanel('timer'); return true; }
      return false;
    },
    openMixer() { show(); openPanel('scene', 'sound'); },
    openScene() { show(); openPanel('scene', 'view'); },
    openFocus() { show(); openPanel('timer', 'focus'); },
    openSleep() { show(); openPanel('timer', 'sleep'); },
    get phone() { return isPhone(); },
  };
}
