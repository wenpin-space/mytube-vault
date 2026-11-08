// Lobby: layar santai penuh — latar animasi, jam, lagu yang diputar, lirik, suara alam, Pomodoro & timer tidur.

import * as amb from './ambient.js';
import { SCENES, createSceneRunner, isCanvasScene } from './scenes.js';
import { putFile, getFile, deleteFile } from './idb.js';
import { LOCATIONS, WEATHERS, TIMES, resolveTime, roomSoundMix } from './room.js';
import { escapeHtml } from './utils.js';
import { thumbUrl } from './metadata.js';

export const MODES = [
  { id: 'room', name: 'Kamar santai', icon: 'sofa', scene: 'room', mix: {}, room: true },
  { id: 'rain', name: 'Hujan malam', icon: 'rain', scene: 'rain', mix: { rain: 0.65, thunder: 0.3 } },
  { id: 'chill', name: 'Santai', icon: 'sun', scene: 'sunset', mix: { vinyl: 0.4, rain: 0.15 } },
  { id: 'focus', name: 'Fokus', icon: 'timer', scene: 'aurora', mix: { brown: 0.45 }, extra: 'pomo' },
  { id: 'sleep', name: 'Tidur', icon: 'moon', scene: 'stars', mix: { rain: 0.45, wind: 0.2 }, extra: 'sleep' },
  { id: 'nature', name: 'Api unggun', icon: 'flame', scene: 'campfire', mix: { fire: 0.55, crickets: 0.35, wind: 0.12 } },
  { id: 'beach', name: 'Pantai', icon: 'waves', scene: 'beach', mix: { waves: 0.65, wind: 0.15, birds: 0.12 } },
  { id: 'city', name: 'Kota retro', icon: 'city', scene: 'city', mix: { rain: 0.35, cafe: 0.3 } },
  { id: 'winter', name: 'Musim dingin', icon: 'snow', scene: 'snow', mix: { wind: 0.35, fire: 0.25 } },
];

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

const DEFAULTS = { room: { loc: 'mountain', weather: 'rain', time: 'auto', autoSound: true }, mode: 'room', scene: 'room', mix: null, master: 0.8, presets: [], lowPower: false, autoHide: true, startup: false, nickname: '', showLyrics: true, wake: true, customSounds: [], hasBg: false, pomo: { work: 25, brk: 5, long: 15 } };

export function createLobby({ store, player, icon, toast, getLyric, playSomething, onOpenChange, isPhone }) {
  const cfg = () => {
    store.ui.lobby = { ...DEFAULTS, ...(store.ui.lobby || {}) };
    return store.ui.lobby;
  };
  const save = () => store.saveUi();
  let el = null;
  let runner = null;
  let open = false;
  let clockTimer = 0;
  let lyricTimer = 0;
  let idleTimer = 0;
  let wakeLock = null;
  let bgUrl = null;
  let customLoaded = false;
  const pomo = { phase: 'work', remaining: 25 * 60, sessions: 0, running: false, timer: 0 };
  const sleep = { end: 0, total: 0, timer: 0, baseVol: null };

  // ------------------------------------------------------------------ DOM
  function build() {
    el = document.createElement('div');
    el.id = 'lobby';
    el.className = 'lobby';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Lobby');
    el.innerHTML = `
      <canvas class="lb-canvas" aria-hidden="true"></canvas>
      <div class="lb-photo" aria-hidden="true"></div>
      <div class="lb-vignette" aria-hidden="true"></div>
      <header class="lb-top lb-chrome">
        <div class="lb-modes" role="tablist" aria-label="Mode">${MODES.map((m) => `<button type="button" class="lb-mode" role="tab" data-lb="mode" data-id="${m.id}">${icon(m.icon)}<span>${m.name}</span></button>`).join('')}</div>
        <div class="lb-actions">
          <button type="button" class="lb-btn lb-room-btn" data-lb="panel" data-id="room" title="Lokasi, cuaca & waktu" hidden>${icon('cloud')}<span>Suasana</span></button>
          <button type="button" class="lb-btn" data-lb="panel" data-id="scene" title="Latar">${icon('image')}<span>Latar</span></button>
          <button type="button" class="lb-btn" data-lb="panel" data-id="mix" title="Suara alam">${icon('sliders')}<span>Suara</span></button>
          <button type="button" class="lb-btn icon" data-lb="panel" data-id="settings" title="Setelan Lobby" aria-label="Setelan Lobby">${icon('gear')}</button>
          <button type="button" class="lb-btn icon" data-lb="close" title="Keluar dari Lobby (Esc)" aria-label="Keluar dari Lobby">${icon('x')}</button>
        </div>
      </header>
      <main class="lb-center">
        <div class="lb-greet"></div>
        <div class="lb-clock" aria-live="off"></div>
        <div class="lb-date"></div>
        <div class="lb-lyric" aria-live="polite"></div>
        <section class="lb-pomo lb-chrome-soft" hidden></section>
        <section class="lb-sleep lb-chrome-soft" hidden></section>
        <button type="button" class="lb-unlock" data-lb="unlock" hidden>${icon('volume')}<span>Ketuk untuk menyalakan suara</span></button>
      </main>
      <footer class="lb-bottom lb-chrome">
        <div class="lb-np"></div>
        <div class="lb-amb-side"><div class="lb-room-pill"></div><div class="lb-amb-status"></div></div>
      </footer>
      <aside class="lb-panel" data-panel="room" hidden></aside>
      <aside class="lb-panel" data-panel="scene" hidden></aside>
      <aside class="lb-panel" data-panel="mix" hidden></aside>
      <aside class="lb-panel" data-panel="settings" hidden></aside>
      <input type="file" class="lb-file-bg" accept="image/*" hidden>
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
    amb.onChange(() => { if (open) { renderAmbStatus(); syncMixSliders(); } });
    document.addEventListener('visibilitychange', () => { if (open && !document.hidden) requestWake(); });
  }
  const $ = (sel) => el.querySelector(sel);

  // ------------------------------------------------------------------ buka / tutup
  function show() {
    if (!el) build();
    if (open) return;
    open = true;
    el.hidden = false;
    document.body.classList.add('lobby-open');
    const c = cfg();
    runner.setLowPower(c.lowPower);
    applyMode(c.mode, { keepMix: !!c.mix, quiet: true });
    if (c.mix) startMix(c.mix);
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
    lyricTimer = setInterval(tickLyric, 300);
    renderNP();
    renderAmbStatus();
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
  const roomCfg = () => { const c = cfg(); c.room = { ...DEFAULTS.room, ...(c.room || {}) }; return c.room; };
  const roomResolved = () => { const r = roomCfg(); return { loc: r.loc, weather: r.weather, time: resolveTime(r.time) }; };
  function syncRoom({ sound = false } = {}) {
    const rs = roomResolved();
    runner.setState({ room: rs });
    if (sound && roomCfg().autoSound && cfg().scene === 'room') {
      cfg().mix = roomSoundMix(rs); save(); startMix(cfg().mix);
    }
    renderRoomPill();
    if (!$('.lb-panel[data-panel="room"]').hidden) renderRoomPanel();
  }
  function renderRoomPill() {
    const box = $('.lb-room-pill');
    if (cfg().scene !== 'room') { box.innerHTML = ''; return; }
    const r = roomCfg(); const rs = roomResolved();
    const w = WEATHERS.find((x) => x.id === r.weather) || WEATHERS[0];
    box.innerHTML = `<button type="button" class="lb-pill" data-lb="panel" data-id="room">${icon(w.icon)}<span>${escapeHtml((LOCATIONS.find((x) => x.id === r.loc) || LOCATIONS[0]).name)} · ${w.name} · ${(TIMES.find((x) => x.id === rs.time) || {}).name}</span></button>`;
  }
  function renderRoomPanel() {
    const r = roomCfg();
    const group = (title, list, key, withIcon) => `<h4 class="lb-sub">${title}</h4><div class="lb-chips">${list.map((x) => `<button type="button" class="chip" data-lb="room-set" data-key="${key}" data-id="${x.id}" aria-pressed="${r[key] === x.id}">${withIcon && x.icon ? icon(x.icon) : ''}${x.name}${key === 'time' && x.id === 'auto' ? ` <span class="count">${(TIMES.find((t) => t.id === resolveTime('auto')) || {}).name}</span>` : ''}</button>`).join('')}</div>`;
    $('.lb-panel[data-panel="room"]').innerHTML = `${panelHead('Suasana kamar')}
      ${group('Pemandangan di luar jendela', LOCATIONS, 'loc')}
      ${group('Cuaca', WEATHERS, 'weather', true)}
      ${group('Waktu', TIMES, 'time')}
      <label class="lb-switch"><input type="checkbox" data-lb="room-auto" ${r.autoSound ? 'checked' : ''}><span><b>Suara ikut suasana</b><small>Hujan, ombak, jangkrik, dan lainnya menyesuaikan lokasi, cuaca & waktu.</small></span></label>
      <button type="button" class="lb-btn" data-lb="room-random">${icon('shuffle')}<span>Suasana acak</span></button>`;
  }

  // ------------------------------------------------------------------ mode & latar
  function applyMode(id, { keepMix = false, quiet = false } = {}) {
    const m = MODES.find((x) => x.id === id) || MODES[0];
    const c = cfg();
    c.mode = m.id;
    if (!quiet || !c.scene) c.scene = m.scene;
    if (!keepMix) { c.mix = m.room ? roomSoundMix(roomResolved()) : { ...m.mix }; startMix(c.mix); }
    save();
    el.querySelectorAll('.lb-mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === m.id)));
    el.dataset.mode = m.id;
    setScene(c.scene);
    $('.lb-pomo').hidden = m.extra !== 'pomo';
    $('.lb-sleep').hidden = m.extra !== 'sleep';
    if (m.extra === 'pomo') renderPomo();
    if (m.extra === 'sleep') renderSleep();
  }

  async function setScene(id) {
    const c = cfg();
    c.scene = id;
    save();
    el.dataset.scene = id;
    const photo = $('.lb-photo');
    $('.lb-room-btn').hidden = id !== 'room';
    if (id === 'room') syncRoom(); else renderRoomPill();
    if (isCanvasScene(id)) {
      photo.style.backgroundImage = '';
      photo.classList.remove('on', 'song');
      runner.setScene(id);
    } else {
      runner.setScene(null);
      if (id === 'song') {
        photo.classList.add('on', 'song');
        updateSongBg();
      } else if (id === 'custom') {
        photo.classList.remove('song');
        if (!bgUrl) {
          const blob = await getFile('lobby-bg').catch(() => null);
          if (blob) bgUrl = URL.createObjectURL(blob);
        }
        if (bgUrl) { photo.style.backgroundImage = `url("${bgUrl}")`; photo.classList.add('on'); } else { photo.classList.remove('on'); openPanel('scene'); toast('Pilih gambar dulu: Latar → Unggah gambar.', 'info'); }
      }
    }
    if (!$('.lb-panel[data-panel="scene"]').hidden) renderScenePanel();
  }
  function updateSongBg() {
    if (cfg().scene !== 'song') return;
    const cur = player.current;
    $('.lb-photo').style.backgroundImage = cur ? `url("${thumbUrl(cur.youtubeId, 'hqdefault')}")` : '';
  }

  // ------------------------------------------------------------------ suara
  const needsUnlock = () => {
    const c = cfg();
    return amb.isSupported() && !!c.mix && Object.values(c.mix).some((v) => v > 0) && (amb.isSuspended() || !amb.isPlaying());
  };
  function startMix(mix) {
    try { amb.applyMix(filterMix(mix)); } catch { /* tidak didukung */ }
    setTimeout(() => { if (open) $('.lb-unlock').hidden = !needsUnlockStrict(); }, 400);
  }
  function filterMix(mix) {
    const out = {};
    for (const [k, v] of Object.entries(mix || {})) if (!k.startsWith('custom:') || amb.hasCustom(k)) out[k] = v;
    return out;
  }
  // AudioContext yang belum diizinkan browser (dibuka otomatis tanpa ketukan) → tampilkan tombol
  const needsUnlockStrict = () => needsUnlock();
  function unlockAudio() {
    amb.unlock();
    startMix(cfg().mix || {});
    $('.lb-unlock').hidden = true;
  }

  function renderAmbStatus() {
    const ids = amb.activeIds();
    const names = ids.map((id) => (amb.SOUNDS.find((s) => s.id === id) || (cfg().customSounds.find((s) => s.id === id)) || { name: id }).name);
    $('.lb-amb-status').innerHTML = ids.length
      ? `<button type="button" class="lb-pill" data-lb="panel" data-id="mix">${icon('sliders')}<span>${escapeHtml(names.slice(0, 3).join(' · '))}${names.length > 3 ? ` +${names.length - 3}` : ''}</span></button>
         <button type="button" class="lb-btn icon sm" data-lb="mute-amb" title="Matikan semua suara alam" aria-label="Matikan semua suara alam">${icon('x')}</button>`
      : `<button type="button" class="lb-pill dim" data-lb="panel" data-id="mix">${icon('sliders')}<span>Suara alam mati</span></button>`;
  }

  // ------------------------------------------------------------------ panel
  function openPanel(name) {
    el.querySelectorAll('.lb-panel').forEach((p) => { p.hidden = p.dataset.panel !== name || !p.hidden; });
    const p = $(`.lb-panel[data-panel="${name}"]`);
    if (p.hidden) return;
    if (name === 'scene') renderScenePanel();
    if (name === 'room') renderRoomPanel();
    if (name === 'mix') renderMixPanel();
    if (name === 'settings') renderSettingsPanel();
    el.classList.add('panel-open');
  }
  function closePanels() {
    el.querySelectorAll('.lb-panel').forEach((p) => { p.hidden = true; });
    el.classList.remove('panel-open');
  }
  const panelHead = (title) => `<div class="lb-panel-head"><h3>${title}</h3><button type="button" class="lb-btn icon sm" data-lb="close-panel" aria-label="Tutup panel">${icon('x')}</button></div>`;

  function renderScenePanel() {
    const c = cfg();
    $('.lb-panel[data-panel="scene"]').innerHTML = `${panelHead('Latar')}
      <div class="lb-scenes">${SCENES.map((s) => `<button type="button" class="lb-scene" data-lb="scene" data-id="${s.id}" aria-pressed="${c.scene === s.id}">
        <span class="lb-scene-thumb sc-${s.id}"></span><b>${s.name}</b><small>${s.style}</small></button>`).join('')}</div>
      <div class="lb-row"><button type="button" class="lb-btn" data-lb="upload-bg">${icon('upload')}<span>Unggah gambar / GIF</span></button>
        ${c.hasBg ? `<button type="button" class="lb-btn" data-lb="remove-bg">${icon('trash')}<span>Hapus gambar</span></button>` : ''}</div>
      <p class="lb-hint">Gambar disimpan hanya di perangkat ini (maks. 15 MB).</p>`;
  }

  function sliderRow(id, name, ic, val, removable = false) {
    return `<div class="lb-mix-row${val > 0 ? ' on' : ''}" data-id="${escapeHtml(id)}">
      <button type="button" class="lb-mix-ic" data-lb="toggle-snd" data-id="${escapeHtml(id)}" aria-pressed="${val > 0}" title="${val > 0 ? 'Matikan' : 'Nyalakan'} ${escapeHtml(name)}">${icon(ic)}</button>
      <label><span>${escapeHtml(name)}</span><input type="range" min="0" max="100" value="${Math.round(val * 100)}" data-lb="vol" data-id="${escapeHtml(id)}" aria-label="Volume ${escapeHtml(name)}"></label>
      ${removable ? `<button type="button" class="lb-btn icon sm" data-lb="del-snd" data-id="${escapeHtml(id)}" aria-label="Hapus suara ${escapeHtml(name)}">${icon('trash')}</button>` : ''}
    </div>`;
  }
  function renderMixPanel() {
    const c = cfg();
    const mix = c.mix || {};
    const presets = [...MODES.map((m) => ({ name: m.name, mix: m.room ? roomSoundMix(roomResolved()) : m.mix, builtin: true })), ...c.presets];
    $('.lb-panel[data-panel="mix"]').innerHTML = `${panelHead('Suara alam')}
      ${amb.isSupported() ? '' : '<p class="lb-hint">Browser ini tidak mendukung Web Audio.</p>'}
      <div class="lb-master"><span>${icon('volume')}Volume suara alam</span><input type="range" min="0" max="100" value="${Math.round(c.master * 100)}" data-lb="master" aria-label="Volume suara alam"></div>
      <div class="lb-presets">${presets.map((p, i) => `<button type="button" class="chip" data-lb="preset" data-i="${i}">${escapeHtml(p.name)}${p.builtin ? '' : ` <span class="count" data-lb="del-preset" data-i="${i}" title="Hapus racikan">✕</span>`}</button>`).join('')}</div>
      <div class="lb-mix">${amb.SOUNDS.map((s) => sliderRow(s.id, s.name, s.icon, mix[s.id] || 0)).join('')}
        ${c.customSounds.map((s) => sliderRow(s.id, s.name, 'music', mix[s.id] || 0, true)).join('')}</div>
      <div class="lb-row">
        <button type="button" class="lb-btn" data-lb="save-preset">${icon('plus')}<span>Simpan racikan</span></button>
        <button type="button" class="lb-btn" data-lb="upload-snd">${icon('upload')}<span>Tambah suara sendiri</span></button>
        <button type="button" class="lb-btn" data-lb="mute-amb">${icon('x')}<span>Matikan semua</span></button>
      </div>
      <p class="lb-hint">Suara disintesis langsung oleh browser (tanpa file, jalan offline). Suara tetap berbunyi walau Lobby ditutup — matikan di sini atau lewat ikon di player bawah.</p>`;
  }
  function syncMixSliders() {
    const p = $('.lb-panel[data-panel="mix"]');
    if (!p || p.hidden) return;
    p.querySelectorAll('.lb-mix-row').forEach((row) => {
      const v = amb.level(row.dataset.id);
      row.classList.toggle('on', v > 0);
      row.querySelector('.lb-mix-ic').setAttribute('aria-pressed', String(v > 0));
      const r = row.querySelector('input');
      if (document.activeElement !== r) r.value = Math.round(v * 100);
    });
  }

  function renderSettingsPanel() {
    const c = cfg();
    const tog = (key, label, hint) => `<label class="lb-switch"><input type="checkbox" data-lb="set" data-key="${key}" ${c[key] ? 'checked' : ''}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    $('.lb-panel[data-panel="settings"]').innerHTML = `${panelHead('Setelan Lobby')}
      <label class="lb-field"><span>Nama panggilan</span><input type="text" maxlength="24" value="${escapeHtml(c.nickname)}" data-lb="nickname" placeholder="mis. Vinz"></label>
      ${tog('showLyrics', 'Tampilkan lirik', 'Baris lirik yang sedang dinyanyikan muncul di bawah jam.')}
      ${tog('autoHide', 'Sembunyikan tombol otomatis', 'Setelah 4 detik tanpa gerakan, yang tampil hanya pemandangan.')}
      ${tog('lowPower', 'Hemat baterai', 'Animasi lebih ringan (24 fps, resolusi lebih rendah).')}
      ${tog('wake', 'Layar tetap menyala', 'Selama Lobby terbuka (kalau browser mendukung).')}
      ${tog('startup', 'Buka Lobby saat aplikasi dibuka', '')}
      <p class="lb-hint">Pintasan: <kbd>B</kbd> buka/tutup Lobby · <kbd>Spasi</kbd> putar/jeda · <kbd>N</kbd> lagu berikutnya · <kbd>Esc</kbd> keluar.</p>`;
  }

  // ------------------------------------------------------------------ jam, lagu, lirik
  function tickClock() {
    const now = new Date();
    const c = cfg();
    $('.lb-clock').textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    $('.lb-date').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    $('.lb-greet').textContent = `${greeting(now.getHours())}${c.nickname ? `, ${c.nickname}` : ''}`;
    if (sleep.end) tickSleep();
    if (c.scene === 'room' && roomCfg().time === 'auto' && now.getSeconds() === 0) syncRoom({ sound: true });
  }
  function tickLyric() {
    const box = $('.lb-lyric');
    if (!cfg().showLyrics || !player.current) { box.textContent = ''; return; }
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
    if (!cur) {
      box.innerHTML = `<button type="button" class="lb-btn" data-lb="play-something">${icon('play', 'fill')}<span>Putar musik</span></button><span class="lb-np-hint">atau nikmati suara alam saja</span>`;
      return;
    }
    const v = store.data.videos[cur.youtubeId] || {};
    box.innerHTML = `
      <img src="${thumbUrl(cur.youtubeId, 'mqdefault')}" alt="">
      <div class="lb-np-text"><b>${escapeHtml(v.title || 'Memuat judul…')}</b><span>${escapeHtml(v.channel || '')}</span></div>
      <div class="lb-np-ctl">
        <button type="button" class="lb-btn icon" data-lb="prev" aria-label="Sebelumnya">${icon('prev')}</button>
        <button type="button" class="lb-btn icon play" data-lb="toggle" aria-label="${player.isPlaying ? 'Jeda' : 'Putar'}">${icon(player.isPlaying ? 'pause' : 'play', 'fill')}</button>
        <button type="button" class="lb-btn icon" data-lb="next" aria-label="Berikutnya">${icon('next')}</button>
      </div>`;
  }

  // ------------------------------------------------------------------ Pomodoro
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function pomoCfg() { const p = cfg().pomo; return { work: p.work, brk: p.brk, long: p.long, every: 4 }; }
  function renderPomo() {
    const p = pomoCfg();
    const total = (pomo.phase === 'work' ? p.work : pomo.phase === 'long' ? p.long : p.brk) * 60;
    const frac = Math.max(0, Math.min(1, pomo.remaining / total));
    const R = 54; const C = 2 * Math.PI * R;
    $('.lb-pomo').innerHTML = `
      <div class="lb-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="bg"/><circle cx="60" cy="60" r="${R}" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - frac)}"/></svg>
        <div class="lb-ring-text"><b>${fmt(pomo.remaining)}</b><span>${{ work: 'Fokus', break: 'Istirahat', long: 'Istirahat panjang' }[pomo.phase]}</span></div></div>
      <div class="lb-pomo-side">
        <div class="lb-pomo-btns">
          <button type="button" class="lb-btn primary" data-lb="pomo-toggle">${icon(pomo.running ? 'pause' : 'play', 'fill')}<span>${pomo.running ? 'Jeda' : 'Mulai'}</span></button>
          <button type="button" class="lb-btn icon" data-lb="pomo-skip" title="Lewati ke fase berikutnya" aria-label="Lewati">${icon('next')}</button>
          <button type="button" class="lb-btn icon" data-lb="pomo-reset" title="Ulang" aria-label="Ulang">${icon('refresh')}</button>
        </div>
        <div class="lb-pomo-meta">Sesi selesai: <b>${pomo.sessions}</b> · ${p.work}/${p.brk} menit
          <select data-lb="pomo-len" aria-label="Durasi">${[[25, 5, 15], [50, 10, 20], [15, 3, 10], [90, 15, 30]].map(([a, b, c2]) => `<option value="${a},${b},${c2}" ${a === p.work ? 'selected' : ''}>${a}/${b}</option>`).join('')}</select></div>
      </div>`;
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
    if (open && !$('.lb-pomo').hidden) renderPomo();
  }

  // ------------------------------------------------------------------ Tidur
  function renderSleep() {
    const left = sleep.end ? Math.max(0, (sleep.end - Date.now()) / 1000) : 0;
    $('.lb-sleep').innerHTML = sleep.end
      ? `<div class="lb-sleep-count"><b>${fmt(left)}</b><span>lagi musik & suara alam memelan lalu berhenti</span></div>
         <div class="lb-row center"><button type="button" class="lb-btn" data-lb="sleep-add">+15 menit</button><button type="button" class="lb-btn" data-lb="sleep-cancel">${icon('x')}<span>Batalkan</span></button></div>`
      : `<div class="lb-sleep-title">${icon('moon')}<span>Timer tidur</span></div>
         <div class="lb-row center">${[15, 30, 45, 60, 90].map((m) => `<button type="button" class="lb-btn" data-lb="sleep-set" data-min="${m}">${m} menit</button>`).join('')}</div>`;
  }
  function setSleepTimer(min) {
    sleep.total = min * 60;
    sleep.end = Date.now() + min * 60000;
    sleep.baseVol = null;
    renderSleep();
    toast(`Timer tidur ${min} menit dimulai. Selamat beristirahat.`, 'info');
  }
  function cancelSleep(restore = true) {
    if (restore && sleep.baseVol != null) player.setVolume(sleep.baseVol);
    if (restore) amb.setMaster(cfg().master, 0.5);
    sleep.end = 0; sleep.baseVol = null;
    runner.setState({ dim: 0 });
    if (el && !$('.lb-sleep').hidden) renderSleep();
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
    if (open && !$('.lb-sleep').hidden) renderSleep();
  }

  // ------------------------------------------------------------------ auto-hide & wake lock
  function wake() {
    if (!el) return;
    el.classList.remove('idle');
    clearTimeout(idleTimer);
    if (cfg().autoHide) idleTimer = setTimeout(() => { if (open && !el.classList.contains('panel-open') && !el.matches(':focus-within select, :focus-within input[type=text]')) el.classList.add('idle'); }, 4000);
  }
  async function requestWake() {
    if (!cfg().wake || !('wakeLock' in navigator) || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { /* tidak diizinkan */ }
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

  // ------------------------------------------------------------------ file sendiri
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
      if (e.target === el || e.target.closest('.lb-center') === null && !e.target.closest('.lb-panel, .lb-chrome')) closePanels();
      return;
    }
    const act = b.dataset.lb;
    const c = cfg();
    switch (act) {
      case 'close': hide(); break;
      case 'mode': applyMode(b.dataset.id); break;
      case 'panel': openPanel(b.dataset.id); break;
      case 'close-panel': closePanels(); break;
      case 'scene': setScene(b.dataset.id); break;
      case 'unlock': unlockAudio(); break;
      case 'upload-bg': $('.lb-file-bg').click(); break;
      case 'remove-bg':
        await deleteFile('lobby-bg').catch(() => {});
        if (bgUrl) { URL.revokeObjectURL(bgUrl); bgUrl = null; }
        c.hasBg = false; save();
        if (c.scene === 'custom') setScene(MODES.find((m) => m.id === c.mode).scene); else renderScenePanel();
        break;
      case 'upload-snd': $('.lb-file-snd').click(); break;
      case 'toggle-snd': {
        const id = b.dataset.id;
        setMixLevel(id, amb.level(id) > 0 ? 0 : 0.5);
        break;
      }
      case 'del-snd': {
        const id = b.dataset.id;
        amb.removeCustom(id);
        await deleteFile(`snd:${id}`).catch(() => {});
        c.customSounds = c.customSounds.filter((s) => s.id !== id);
        if (c.mix) delete c.mix[id];
        save(); renderMixPanel();
        break;
      }
      case 'mute-amb': amb.stopAll(); c.mix = {}; save(); renderAmbStatus(); syncMixSliders(); break;
      case 'preset': {
        if (e.target.closest('[data-lb="del-preset"]')) {
          const i = Number(e.target.closest('[data-lb="del-preset"]').dataset.i) - MODES.length;
          c.presets.splice(i, 1); save(); renderMixPanel();
          break;
        }
        const all = [...MODES.map((m) => ({ name: m.name, mix: m.room ? roomSoundMix(roomResolved()) : m.mix })), ...c.presets];
        const p = all[Number(b.dataset.i)];
        if (p) { c.mix = { ...p.mix }; save(); startMix(c.mix); setTimeout(syncMixSliders, 50); toast(`Racikan “${p.name}”`, 'info', 1500); }
        break;
      }
      case 'save-preset': {
        const mix = amb.currentMix();
        if (!Object.keys(mix).length) { toast('Nyalakan beberapa suara dulu.', 'info'); break; }
        const name = prompt('Nama racikan:', 'Racikanku') || '';
        if (!name.trim()) break;
        c.presets.push({ name: name.trim().slice(0, 24), mix });
        save(); renderMixPanel();
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
      case 'pomo-toggle':
        pomo.running = !pomo.running;
        if (pomo.running && !pomo.timer) pomo.timer = setInterval(pomoStep, 1000);
        if (pomo.running && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
        renderPomo();
        break;
      case 'pomo-skip': pomo.remaining = 1; pomo.running = true; if (!pomo.timer) pomo.timer = setInterval(pomoStep, 1000); pomoStep(); break;
      case 'pomo-reset': Object.assign(pomo, { phase: 'work', remaining: c.pomo.work * 60, running: false }); renderPomo(); break;
      case 'sleep-set': setSleepTimer(Number(b.dataset.min)); break;
      case 'sleep-add': sleep.end += 15 * 60000; renderSleep(); break;
      case 'sleep-cancel': cancelSleep(); toast('Timer tidur dibatalkan.'); break;
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
    if (t.dataset.lb === 'pomo-len') {
      const [w, b, l] = t.value.split(',').map(Number);
      c.pomo = { work: w, brk: b, long: l }; save();
      if (!pomo.running) pomo.remaining = (pomo.phase === 'work' ? w : pomo.phase === 'long' ? l : b) * 60;
      renderPomo();
      return;
    }
    if (t.classList.contains('lb-file-bg') && t.files[0]) {
      const f = t.files[0];
      t.value = '';
      if (f.size > 15 * 1024 * 1024) { toast('Gambar terlalu besar (maks. 15 MB).', 'error'); return; }
      try {
        await putFile('lobby-bg', f);
        if (bgUrl) URL.revokeObjectURL(bgUrl);
        bgUrl = URL.createObjectURL(f);
        c.hasBg = true; save();
        setScene('custom');
        toast('Gambar latar dipasang.', 'success');
      } catch (err) { toast(err.message || 'Gagal menyimpan gambar.', 'error'); }
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
        renderMixPanel();
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
      if (type === 'track') { updateSongBg(); $('.lb-lyric').textContent = ''; }
    },
    /** Untuk Escape: tutup panel dulu, baru Lobby. */
    escape() { if (!open) return false; if (el.classList.contains('panel-open')) closePanels(); else hide(); return true; },
    ambientActive: () => amb.isPlaying(),
    openMixer() { show(); openPanel('mix'); },
    openMode(id) { show(); applyMode(id); },
    get phone() { return isPhone(); },
  };
}
