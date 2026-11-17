// Mini player mengambang di PC (v44): jendela kecil yang selalu di atas aplikasi lain (Word, Excel, …),
// berisi sampul, judul, dan tombol sebelumnya/putar/berikutnya. Memakai Document Picture-in-Picture
// (Chrome/Edge 116+). Video YouTube tetap di halaman utama; jendela ini hanya pengendali.

import { tr } from './i18n.js';

export const pipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

export function createMiniPip({ player, getInfo, icon, onClose = () => {} }) {
  let win = null;
  let timer = 0;

  function render() {
    if (!win) return;
    const d = win.document;
    const info = getInfo() || {};
    const $ = (s) => d.querySelector(s);
    $('.mp-art').src = info.art || '';
    $('.mp-art').hidden = !info.art;
    $('.mp-title').textContent = info.title || tr('Tidak ada lagu');
    $('.mp-sub').textContent = info.artist || '';
    $('[data-mp=play]').innerHTML = icon(player.isPlaying ? 'pause' : 'play', 'fill');
    $('[data-mp=play]').setAttribute('aria-label', player.isPlaying ? tr('Jeda') : tr('Putar'));
    $('[data-mp=fav]').innerHTML = icon('heart', info.favorite ? 'fill' : '');
    $('[data-mp=fav]').classList.toggle('on', !!info.favorite);
    tick();
  }
  function tick() {
    if (!win) return;
    const d = player.duration(); const t = player.time();
    win.document.querySelector('.mp-fill').style.width = d > 0 ? `${Math.min(100, (t / d) * 100)}%` : '0%';
  }

  async function open() {
    if (!pipSupported()) return false;
    if (win) { win.focus(); return true; }
    win = await window.documentPictureInPicture.requestWindow({ width: 340, height: 132 });
    // gaya halaman utama ikut disalin supaya warna & huruf sama
    for (const sheet of [...document.styleSheets]) {
      try {
        const css = [...sheet.cssRules].map((r) => r.cssText).join('\n');
        const st = win.document.createElement('style'); st.textContent = css; win.document.head.appendChild(st);
      } catch {
        if (sheet.href) { const l = win.document.createElement('link'); l.rel = 'stylesheet'; l.href = sheet.href; win.document.head.appendChild(l); }
      }
    }
    win.document.documentElement.className = document.documentElement.className;
    win.document.body.className = `mini-pip ${document.body.className.includes('light') ? 'light' : ''}`;
    win.document.title = 'MyTube Vault';
    win.document.body.innerHTML = `
      <div class="mp-wrap">
        <img class="mp-art" alt="">
        <div class="mp-main">
          <div class="mp-text"><b class="mp-title" translate="no"></b><span class="mp-sub" translate="no"></span></div>
          <div class="mp-ctrl">
            <button type="button" class="icon-btn" data-mp="prev" aria-label="${tr('Sebelumnya')}">${icon('prev')}</button>
            <button type="button" class="play-btn sm" data-mp="play" aria-label="Putar"></button>
            <button type="button" class="icon-btn" data-mp="next" aria-label="${tr('Berikutnya')}">${icon('next')}</button>
            <button type="button" class="icon-btn" data-mp="fav" aria-label="${tr('Favorit')}"></button>
          </div>
        </div>
      </div>
      <div class="mp-bar"><i class="mp-fill"></i></div>`;
    win.document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mp]');
      if (!b) return;
      const a = b.dataset.mp;
      if (a === 'play') player.toggle();
      else if (a === 'prev') player.prev();
      else if (a === 'next') player.next();
      else if (a === 'fav') { const info = getInfo(); if (info && info.toggleFavorite) info.toggleFavorite(); setTimeout(render, 50); }
    });
    win.document.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); player.toggle(); }
      if (e.key === 'ArrowRight') player.next();
      if (e.key === 'ArrowLeft') player.prev();
    });
    win.addEventListener('pagehide', () => { win = null; clearInterval(timer); onClose(); });
    timer = setInterval(tick, 1000);
    render();
    return true;
  }
  function close() { if (win) win.close(); }

  player.on((type) => { if (['track', 'state', 'playing', 'ended'].includes(type)) render(); });
  return { open, close, render, isOpen: () => !!win, toggle: () => (win ? (close(), false) : open()) };
}
