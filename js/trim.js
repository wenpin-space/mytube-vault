// Potong awal/akhir lagu: lewati intro atau outro (mis. adegan pembuka MV, obrolan penutup).
// Dialog punya pemutar kecil sendiri (geser · mundur/maju 5 dtk · putar/jeda) supaya titiknya bisa dicari
// tanpa menutup dialog, lalu "Mulai dari sini" / "Akhiri di sini" memakai posisi itu.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, formatDuration, parseClock } from './utils.js';

const fmt = (s) => formatDuration(s) || '0:00';

/**
 * Validasi isian dialog (murni, mudah diuji).
 * Hasil: { start, end } dalam detik (0 = tidak dipotong) atau { error }.
 */
export function readTrimInput(startText, endText, duration = 0) {
  const start = parseClock(startText);
  const end = parseClock(endText);
  if (Number.isNaN(start) || Number.isNaN(end)) return { error: 'Tulis waktu seperti 0:45 atau 1:02:03.' };
  if (duration > 0 && start >= duration - 1) return { error: `Titik mulai harus sebelum akhir lagu (${fmt(duration)}).` };
  if (end && end <= start + 1) return { error: 'Titik akhir harus setelah titik mulai.' };
  return { start, end: duration > 0 && end >= duration ? 0 : end };
}

/** Durasi yang benar-benar diputar setelah dipotong. */
export function trimmedDuration(trim, duration) {
  if (!(duration > 0)) return 0;
  if (!trim) return duration;
  return Math.max(0, (trim[1] > 0 ? Math.min(trim[1], duration) : duration) - Math.min(trim[0] || 0, duration));
}

/**
 * player: { time(), duration(), seek(t), toggle(), isPlaying }
 * Hasil: { start, end } · 'clear' (hapus potongan) · null (batal).
 */
export function trimDialog({ title = '', trim = null, duration = 0, player }) {
  let timer = 0;
  const cur = trim || [0, 0];
  const p = modal({
    title: 'Potong awal/akhir lagu',
    body: `
      <p class="trim-song" translate="no">${escapeHtml(title)}</p>
      <p class="hint">Lewati intro atau outro: lagu mulai dan berakhir di titik yang kamu tentukan. Berlaku di semua playlist dan ikut tersinkron.</p>
      <div class="trim-scrub">
        <button type="button" class="icon-btn" data-t="play" aria-label="Putar / jeda"></button>
        <button type="button" class="btn sm" data-t="back" aria-label="Mundur 5 detik">−5</button>
        <input type="range" class="vol-range trim-range" min="0" max="${Math.max(1, Math.round(duration))}" step="1" value="0" aria-label="Posisi lagu">
        <button type="button" class="btn sm" data-t="fwd" aria-label="Maju 5 detik">+5</button>
        <span class="trim-now" aria-live="off"></span>
      </div>
      <div class="trim-row">
        <label class="field"><span>Mulai dari</span><input type="text" id="trim-start" inputmode="numeric" autocomplete="off" placeholder="0:00" value="${cur[0] ? fmt(cur[0]) : ''}"></label>
        <button type="button" class="btn sm" data-t="set-start">${icon('locate')}<span>Mulai dari sini</span></button>
      </div>
      <div class="trim-row">
        <label class="field"><span>Berakhir di</span><input type="text" id="trim-end" inputmode="numeric" autocomplete="off" placeholder="akhir lagu" value="${cur[1] ? fmt(cur[1]) : ''}"></label>
        <button type="button" class="btn sm" data-t="set-end">${icon('locate')}<span>Akhiri di sini</span></button>
      </div>
      <p class="muted small trim-sum"></p>
      <p class="form-error"></p>`,
    actions: [
      ...(trim ? [{ label: 'Hapus potongan', value: 'clear', variant: 'danger-ghost' }] : []),
      { label: 'Batal', value: null },
      {
        label: 'Simpan',
        variant: 'primary',
        validate: (b) => {
          const r = readTrimInput(b.querySelector('#trim-start').value, b.querySelector('#trim-end').value, player.duration() || duration);
          b.querySelector('.form-error').textContent = r.error || '';
          return !r.error;
        },
        value: (b) => {
          const r = readTrimInput(b.querySelector('#trim-start').value, b.querySelector('#trim-end').value, player.duration() || duration);
          return { start: r.start, end: r.end };
        },
      },
    ],
    onOpen: (b) => {
      const range = b.querySelector('.trim-range');
      const now = b.querySelector('.trim-now');
      const playBtn = b.querySelector('[data-t=play]');
      const sum = b.querySelector('.trim-sum');
      const startIn = b.querySelector('#trim-start');
      const endIn = b.querySelector('#trim-end');
      let scrubbing = false;
      let playing = null;

      const summary = () => {
        const d = player.duration() || duration;
        const r = readTrimInput(startIn.value, endIn.value, d);
        b.querySelector('.form-error').textContent = '';
        if (r.error || !d) { sum.textContent = ''; return; }
        const left = trimmedDuration([r.start, r.end], d);
        sum.textContent = r.start || r.end ? `Diputar ${fmt(left)} dari ${fmt(d)}.` : `Tanpa potongan: diputar penuh (${fmt(d)}).`;
      };
      const tick = () => {
        const d = player.duration() || duration;
        if (d > 0 && Number(range.max) !== Math.round(d)) range.max = String(Math.round(d));
        const t = scrubbing ? Number(range.value) : player.time();
        if (!scrubbing) range.value = String(Math.round(t));
        range.style.setProperty('--v', `${d > 0 ? Math.min(100, (t / d) * 100) : 0}%`);
        now.textContent = d > 0 ? `${fmt(t)} / ${fmt(d)}` : fmt(t);
        if (playing !== player.isPlaying) {
          playing = player.isPlaying;
          playBtn.innerHTML = icon(playing ? 'pause' : 'play', 'fill');
        }
      };
      const jump = (t) => { player.seek(Math.max(0, t)); range.value = String(Math.round(Math.max(0, t))); setTimeout(tick, 60); };

      range.addEventListener('input', () => { scrubbing = true; tick(); });
      range.addEventListener('change', () => { jump(Number(range.value)); scrubbing = false; });
      b.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-t]');
        if (!btn) return;
        const t = player.time();
        switch (btn.dataset.t) {
          case 'play': player.toggle(); setTimeout(tick, 120); break;
          case 'back': jump(t - 5); break;
          case 'fwd': jump(t + 5); break;
          case 'set-start': startIn.value = t >= 1 ? fmt(Math.floor(t)) : ''; summary(); break;
          case 'set-end': endIn.value = fmt(Math.ceil(t)); summary(); break;
          default: break;
        }
      });
      startIn.addEventListener('input', summary);
      endIn.addEventListener('input', summary);
      timer = setInterval(tick, 250);
      tick();
      summary();
      // di layar sentuh jangan langsung memunculkan keyboard: alur utamanya geser lalu "Mulai dari sini"
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) startIn.focus();
    },
  });
  return p.finally(() => clearInterval(timer));
}
