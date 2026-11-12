// Bilah progres yang bisa ditarik (mouse & sentuh): klik/tarik untuk melompat, waktu tampil di atas kursor,
// knob mengikuti jari. Posisi digambar lewat variabel CSS --p (0–100%) di elemen bilah.
//
// Lompatan ke player baru dikirim saat jari/tombol dilepas, supaya YouTube tidak dibanjiri seekTo.

import { formatDuration } from './utils.js';

export const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);
const fmt = (s) => formatDuration(s) || '0:00';

/**
 * Persen lebar bagian yang dipotong di awal & akhir lagu, untuk diarsir di bilah.
 * trim = [mulai, akhir] dalam detik (0 = tidak dipotong).
 */
export function cutPercents(trim, duration) {
  if (!trim || !(duration > 0)) return { a: 0, b: 0 };
  const a = clamp01(trim[0] / duration) * 100;
  const b = trim[1] > 0 ? clamp01((duration - trim[1]) / duration) * 100 : 0;
  return { a, b };
}

export function createSeekbar(el, { duration, seek, onPreview }) {
  const tip = el.querySelector('.dock-tip');
  let drag = null;

  const ratioAt = (x) => {
    const r = el.getBoundingClientRect();
    return r.width ? clamp01((x - r.left) / r.width) : 0;
  };
  const paint = (ratio) => el.style.setProperty('--p', `${(ratio * 100).toFixed(3)}%`);
  const showTip = (ratio) => {
    const d = duration();
    if (!d) { tip.hidden = true; return; }
    tip.textContent = fmt(ratio * d);
    tip.hidden = false;
    const w = el.clientWidth;
    const half = tip.offsetWidth / 2 + 2;
    tip.style.left = `${Math.max(half, Math.min(w - half, ratio * w))}px`;
  };

  el.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !duration()) return;
    e.preventDefault();
    drag = { ratio: ratioAt(e.clientX) };
    el.classList.add('scrubbing');
    try { el.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
    paint(drag.ratio);
    showTip(drag.ratio);
    if (onPreview) onPreview(drag.ratio * duration());
  });
  el.addEventListener('pointermove', (e) => {
    const ratio = ratioAt(e.clientX);
    if (drag) {
      drag.ratio = ratio;
      paint(ratio);
      showTip(ratio);
      if (onPreview) onPreview(ratio * duration());
    } else if (e.pointerType === 'mouse') showTip(ratio);
  });
  const end = (commit) => (e) => {
    if (!drag) return;
    const { ratio } = drag;
    drag = null;
    // biarkan satu frame tanpa transisi supaya bilah tidak "meluncur" dari posisi lama
    requestAnimationFrame(() => el.classList.remove('scrubbing'));
    if (e.pointerType !== 'mouse') tip.hidden = true;
    if (commit) seek(ratio * duration());
  };
  el.addEventListener('pointerup', end(true));
  el.addEventListener('pointercancel', end(false));
  el.addEventListener('pointerleave', () => { if (!drag) tip.hidden = true; });

  return {
    get dragging() { return !!drag; },
    /** Perbarui posisi dari player (diabaikan selama pengguna sedang menarik). */
    set(time, d) {
      if (drag) return;
      const ratio = d > 0 ? clamp01(time / d) : 0;
      paint(ratio);
      const text = d > 0 ? `${fmt(time)} / ${fmt(d)}` : '';
      if (el.getAttribute('aria-valuetext') !== text) {
        el.setAttribute('aria-valuetext', text);
        el.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      }
    },
    /** Arsir bagian yang dipotong (intro/outro). */
    setCuts(trim, d) {
      const { a, b } = cutPercents(trim, d);
      el.style.setProperty('--cut-a', `${a.toFixed(2)}%`);
      el.style.setProperty('--cut-b', `${b.toFixed(2)}%`);
      el.classList.toggle('has-cut', a > 0 || b > 0);
    },
  };
}
