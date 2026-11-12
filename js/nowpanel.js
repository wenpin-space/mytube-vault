// Panel "Sedang diputar" di sisi kanan (PC layar lebar, ≥ 1280 px): artwork atau video, judul,
// lirik berjalan, lagu berikutnya, dan info lagu. Video YouTube tidak dipindah ke panel (iframe akan
// dimuat ulang); kartu videonya diletakkan tepat di atas kotak artwork lewat CSS (body.np-side-on).

import { icon } from './icons.js';
import { thumbUrl } from './metadata.js';
import { escapeHtml, formatDuration, timeAgo } from './utils.js';

export const NP_SIDE_MIN_WIDTH = 1280;
const wide = () => window.matchMedia(`(min-width: ${NP_SIDE_MIN_WIDTH}px)`).matches;

/** Baris lirik yang ditampilkan di panel: indeks awal & akhir di sekitar baris aktif (murni). */
export function lyricWindow(count, active, before = 2, after = 4) {
  if (!count) return [0, 0];
  const a = Math.max(0, Math.min(count - 1, active < 0 ? 0 : active));
  const from = Math.max(0, a - before);
  return [from, Math.min(count, from + before + after + 1)];
}

export function createNowPanel({ store, player, lyrics, upcoming }) {
  const el = document.getElementById('np-side');
  const $ = (sel) => el.querySelector(sel);
  let lastKey = '';
  let lyrKey = '';

  const enabled = () => store.ui.npSide !== false;
  const visible = () => enabled() && wide() && !!player.current;

  function applyLayout() {
    const on = visible();
    document.body.classList.toggle('np-side-on', on);
    el.hidden = !on;
    document.querySelectorAll('[data-action=np-side-toggle]').forEach((b) => {
      b.classList.toggle('on', enabled());
      b.setAttribute('aria-pressed', String(enabled()));
      b.title = enabled() ? 'Sembunyikan panel Sedang diputar (I)' : 'Tampilkan panel Sedang diputar (I)';
    });
    return on;
  }

  function about(v, id) {
    const lists = store.data.playlists.filter((p) => p.items.some((it) => it.youtubeId === id));
    const rows = [];
    if (v.playCount) rows.push([icon('chart'), `Diputar ${v.playCount}×${v.lastPlayedAt ? ` · terakhir ${timeAgo(v.lastPlayedAt)}` : ''}`]);
    if (v.firstAddedAt) rows.push([icon('plus'), `Ditambahkan ${timeAgo(v.firstAddedAt)}`]);
    if (lists.length) rows.push([icon('music'), `Ada di ${lists.length} playlist: <span translate="no">${lists.slice(0, 3).map((p) => escapeHtml(p.name)).join(', ')}${lists.length > 3 ? ` +${lists.length - 3}` : ''}</span>`]);
    if (v.trim) rows.push([icon('scissors'), `Diputar ${formatDuration(v.trim[0]) || '0:00'}–${formatDuration(v.trim[1] || v.duration) || 'akhir'}`]);
    const tags = (v.tags || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
    return `${rows.map(([ic, t]) => `<li>${ic}<span>${t}</span></li>`).join('')}${tags ? `<li class="nps-tags">${tags}</li>` : ''}`;
  }

  /** Bagian yang hanya berubah saat lagu/antrean/data berubah. */
  function render() {
    if (!applyLayout()) { lastKey = ''; return; }
    const cur = player.current;
    const id = cur.youtubeId;
    const v = store.data.videos[id] || {};
    const next = upcoming().slice(0, 5);
    const key = [id, v.title, v.channel, v.favorite, v.playCount, (v.tags || []).join(','), v.trim && v.trim.join('-'),
      store.ui.stageMin !== false, next.map((n) => n.item.youtubeId).join(','), store.data.playlists.length].join('|');
    if (key === lastKey) return;
    const trackChanged = !lastKey.startsWith(`${id}|`);
    lastKey = key;

    const img = $('.nps-art img');
    const src = thumbUrl(id, 'hqdefault');
    if (img.getAttribute('src') !== src) img.src = src;
    $('.nps-art').classList.toggle('has-video', store.ui.stageMin === false);
    $('.nps-title').textContent = v.title || 'Memuat judul…';
    $('.nps-channel').textContent = v.channel || '';
    const fav = $('[data-action=dock-fav]');
    fav.innerHTML = icon('heart', v.favorite ? 'fill' : '');
    fav.classList.toggle('on', !!v.favorite);
    fav.setAttribute('aria-pressed', String(!!v.favorite));
    fav.title = v.favorite ? 'Hapus dari favorit' : 'Favoritkan';

    $('.nps-next ol').innerHTML = next.length
      ? next.map(({ pos, item }) => {
        const nv = store.data.videos[item.youtubeId] || {};
        return `<li><button type="button" data-action="queue-jump" data-pos="${pos}">
          <img src="${thumbUrl(item.youtubeId, 'default')}" alt="" loading="lazy" decoding="async">
          <span><b translate="no">${escapeHtml(nv.title || item.youtubeId)}</b><small translate="no">${escapeHtml(nv.channel || '')}</small></span>
          <em>${formatDuration(nv.duration) || ''}</em></button></li>`;
      }).join('')
      : `<li class="nps-empty">${player.repeat === 'all' ? 'Antrean akan diulang dari awal.' : 'Ini lagu terakhir di antrean.'}</li>`;
    $('.nps-about ul').innerHTML = about(v, id);
    if (trackChanged) { lyrKey = ''; $('.nps-scroll').scrollTop = 0; lyrics.load(); }
    tick();
  }

  /** Lirik berjalan (dipanggil ±2× per detik). */
  function tick() {
    if (el.hidden) return;
    const box = $('.nps-lines');
    const p = lyrics.peek(player.time());
    if (p.state === 'synced') {
      const [from, to] = lyricWindow(p.lines.length, p.active);
      const k = `s:${player.current && player.current.youtubeId}:${from}:${p.active}`;
      if (k === lyrKey) return;
      lyrKey = k;
      box.className = 'nps-lines synced';
      box.innerHTML = p.lines.slice(from, to).map((l, i) => {
        const n = from + i;
        const cls = n === p.active ? 'now' : n < p.active ? 'past' : '';
        return `<p class="${cls}" data-t="${l.t}">${escapeHtml(l.text) || '♪'}</p>`;
      }).join('');
      return;
    }
    const k = `${p.state}:${player.current && player.current.youtubeId}`;
    if (k === lyrKey) return;
    lyrKey = k;
    box.className = `nps-lines ${p.state}`;
    if (p.state === 'plain') {
      const lines = p.text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
      box.innerHTML = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<p class="nps-note">Lirik tidak tersinkron · buka lirik untuk teks lengkap</p>`;
    } else {
      const msg = { loading: 'Mencari lirik…', instrumental: '♪ Instrumental', error: 'Layanan lirik tidak bisa dihubungi.', none: 'Lirik tidak ditemukan.', idle: '' }[p.state] || '';
      box.innerHTML = `<p class="nps-note">${msg}</p>`;
    }
  }

  el.addEventListener('click', (e) => {
    const line = e.target.closest('.nps-lines.synced p[data-t]');
    if (line) player.seek(Math.max(0, Number(line.dataset.t)));
  });
  window.matchMedia(`(min-width: ${NP_SIDE_MIN_WIDTH}px)`).addEventListener('change', () => render());

  return {
    render,
    tick,
    get visible() { return !el.hidden; },
    toggle() {
      const on = !enabled();
      store.ui.npSide = on;
      store.saveUiQuiet();
      lastKey = '';
      render();
      return on;
    },
  };
}
