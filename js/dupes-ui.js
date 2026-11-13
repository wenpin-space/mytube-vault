// Dialog "Lagu ganda" (v41). Dimuat saat pertama dipakai. Hasil: [{ keep, drops }] untuk digabung
// oleh main.js (lewat store.mergeVideos, dengan Urungkan), atau null bila dibatalkan.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, formatDuration } from './utils.js';
import { thumbUrl } from './metadata.js';
import { findDuplicates } from './dupes.js';
import { titleOf } from './titles.js';

/**
 * ids: hanya kelompok yang memuat salah satu video ini (mis. lagu yang baru ditambahkan).
 * playlistId: hanya kelompok yang ≥ 2 anggotanya ada di playlist itu.
 */
export function dupesDialog(store, { ids = null, playlistId = null } = {}) {
  const { videos, playlists } = store.data;
  let groups = findDuplicates(videos, playlists);
  if (ids) { const want = new Set(ids); groups = groups.filter((g) => g.ids.some((id) => want.has(id))); }
  if (playlistId) {
    const pl = store.getPlaylist(playlistId);
    const inPl = new Set(pl ? pl.items.map((it) => it.youtubeId) : []);
    groups = groups.filter((g) => g.ids.filter((id) => inPl.has(id)).length >= 2);
  }
  const where = (id) => playlists.filter((p) => p.items.some((it) => it.youtubeId === id)).map((p) => p.name);
  const shown = groups.slice(0, 100);
  const row = (g, gi, id, i) => {
    const v = videos[id];
    const pls = where(id);
    const facts = [
      v.channel ? `<span translate="no">${escapeHtml(v.channel)}</span>` : '',
      v.duration ? formatDuration(v.duration) : '',
      pls.length ? `<span title="${escapeHtml(pls.join(', '))}">di ${pls.length} playlist</span>` : 'hanya di library',
      v.playCount ? `${v.playCount}× diputar` : '',
      v.unavailable ? '<span class="tag tag-warn">tidak tersedia</span>' : '',
    ].filter(Boolean).join(' · ');
    return `<label class="dup-row">
      <input type="radio" name="dup-${gi}" value="${escapeHtml(id)}" ${i === 0 ? 'checked' : ''}>
      <img src="${thumbUrl(id, 'default')}" alt="" loading="lazy" decoding="async">
      <span class="dup-text"><b translate="no" title="${escapeHtml(v.title || '')}">${escapeHtml(titleOf(v) || id)}</b>${v.favorite ? icon('heart', 'fill') : ''}
        <span class="muted small">${facts}</span></span>
      <span class="dup-keep">simpan</span>
    </label>`;
  };
  const body = groups.length
    ? `<p class="muted">${groups.length === 1 ? 'Satu lagu ada lebih dari sekali dengan video berbeda (mis. MV dan versi audio).' : `${groups.length} lagu ada lebih dari sekali dengan video berbeda (mis. MV dan versi audio).`} Pilih video yang disimpan; yang lain diganti dengannya di semua playlist, lalu favorit, tag, dan jumlah putarnya digabung.</p>
      <div class="dup-list">${shown.map((g, gi) => `<section class="dup-group" data-g="${gi}">
        <label class="check dup-on"><input type="checkbox" data-on checked><span>Gabungkan</span></label>
        ${g.ids.map((id, i) => row(g, gi, id, i)).join('')}
      </section>`).join('')}</div>
      ${groups.length > shown.length ? `<p class="hint">Menampilkan 100 kelompok pertama dari ${groups.length}. Buka lagi setelah menggabungkan untuk sisanya.</p>` : ''}
      <p class="hint">Versi berbeda (live, remix, cover, acoustic, sped up) tidak dianggap sama. Bisa diurungkan setelahnya.</p>`
    : `<div class="dup-empty">${icon('checkCircle')}<p><b>Tidak ada lagu ganda.</b></p><p class="muted">${playlistId ? 'Setiap lagu di playlist ini hanya ada sekali.' : 'Setiap lagu di library hanya ada sekali.'} Lagu yang judulnya belum dimuat tidak ikut diperiksa.</p></div>`;
  return modal({
    title: 'Lagu ganda',
    wide: true,
    body,
    actions: groups.length
      ? [{ label: 'Batal', value: null }, {
        label: `Gabungkan ${shown.length}`, variant: 'primary',
        value: (b) => [...b.querySelectorAll('.dup-group')].filter((s) => s.querySelector('[data-on]').checked).map((s) => {
          const g = shown[Number(s.dataset.g)];
          const keep = s.querySelector('input[type=radio]:checked').value;
          return { keep, drops: g.ids.filter((x) => x !== keep) };
        }),
      }]
      : [{ label: 'Tutup', value: null }],
    onOpen: (b, finish, dlg) => {
      const btn = dlg.querySelector('.modal-actions .btn-primary');
      const count = () => {
        const n = b.querySelectorAll('.dup-group [data-on]:checked').length;
        if (btn) { btn.textContent = n ? `Gabungkan ${n}` : 'Gabungkan'; btn.disabled = !n; }
      };
      b.addEventListener('change', (e) => {
        const s = e.target.closest('.dup-group');
        if (s) s.classList.toggle('off', !s.querySelector('[data-on]').checked);
        count();
      });
      count();
    },
  });
}
