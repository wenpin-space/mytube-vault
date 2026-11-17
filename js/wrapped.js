// "Wrapped" tahunan & "Setahun lalu" (v44), dari log putar di perangkat ini (js/stats.js).
// Jumlah putar per lagu ikut tersinkron, tapi log waktunya hanya ada di perangkat tempat lagu diputar,
// jadi rekap ini menggambarkan perangkat ini saja.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, formatTotal } from './utils.js';
import { thumbUrl } from './metadata.js';
import { titleOf } from './titles.js';
import { locale } from './i18n.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

/** Rekap satu tahun. plays = [{id, at}], daily = {'YYYY-MM-DD': detik}. Murni, untuk diuji. */
export function computeWrapped(data, plays, daily, year) {
  const inYear = plays.filter((p) => new Date(p.at).getFullYear() === year && data.videos[p.id]);
  const count = new Map();
  for (const p of inYear) count.set(p.id, (count.get(p.id) || 0) + 1);
  const songs = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n, video: data.videos[id] }));
  const artists = new Map();
  for (const s of songs) {
    const ch = String(s.video.channel || '').replace(/\s*-\s*Topic$/, '').trim();
    if (ch) artists.set(ch, (artists.get(ch) || 0) + s.n);
  }
  const tags = new Map();
  for (const s of songs) for (const t of s.video.tags || []) tags.set(t, (tags.get(t) || 0) + s.n);
  const months = Array(12).fill(0);
  const hours = Array(24).fill(0);
  for (const p of inYear) { const d = new Date(p.at); months[d.getMonth()]++; hours[d.getHours()]++; }
  const days = Object.entries(daily).filter(([k]) => k.startsWith(`${year}-`));
  const seconds = days.reduce((n, [, v]) => n + v, 0);
  // hari berturut-turut terpanjang dengan musik
  const set = new Set(days.filter(([, v]) => v > 0).map(([k]) => k));
  let best = 0;
  for (const k of set) {
    const d = new Date(`${k}T12:00:00`);
    const prev = new Date(d.getTime() - DAY);
    if (set.has(`${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`)) continue;
    let n = 0; let cur = d;
    while (set.has(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`)) { n++; cur = new Date(cur.getTime() + DAY); }
    best = Math.max(best, n);
  }
  return {
    year, plays: inYear.length, seconds, daysListened: set.size, streak: best,
    uniqueSongs: songs.length, topSongs: songs.slice(0, 5), ranked: songs.slice(0, 50).map((s) => s.id),
    topArtists: [...artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n })),
    topTags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n })),
    topMonth: months.some((x) => x) ? months.indexOf(Math.max(...months)) : -1,
    topHour: hours.some((x) => x) ? hours.indexOf(Math.max(...hours)) : -1,
    first: inYear.length ? { id: inYear[0].id, at: inYear[0].at, video: data.videos[inYear[0].id] } : null,
  };
}

/**
 * Lagu yang sering diputar sekitar tanggal ini setahun lalu (±3 hari). Bila log belum setahun,
 * dipakai sebulan lalu. Hasil: { label, ids } atau null.
 */
export function onThisDay(data, plays, now = Date.now()) {
  for (const [label, back] of [['Setahun lalu', 365], ['Sebulan lalu', 30]]) {
    const mid = now - back * DAY;
    const near = plays.filter((p) => Math.abs(p.at - mid) <= 3 * DAY && data.videos[p.id]);
    if (near.length < 2) continue;
    const c = new Map();
    for (const p of near) c.set(p.id, (c.get(p.id) || 0) + 1);
    const ids = [...c.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 6);
    if (ids.length) return { label, ids };
  }
  return null;
}

const monthName = (m) => new Date(2026, m, 1).toLocaleDateString(locale(), { month: 'long' });

export function wrappedDialog(store, { plays, daily, year = new Date().getFullYear(), onPlayList }) {
  const w = computeWrapped(store.data, plays, daily, year);
  const name = (v) => escapeHtml(titleOf(v) || v.youtubeId);
  const slides = [];
  if (!w.plays) {
    slides.push(`<div class="wr-slide"><p class="wr-kicker">Wrapped ${year}</p><h2>Belum ada cerita tahun ini</h2><p>Rekap terisi dari lagu yang kamu putar di perangkat ini. Putar beberapa lagu dulu, lalu buka lagi.</p></div>`);
  } else {
    slides.push(`<div class="wr-slide"><p class="wr-kicker">Wrapped ${year}</p><h2>Tahunmu dalam musik</h2><p class="wr-big">${formatTotal(w.seconds) || `${w.plays}×`}</p><p>mendengarkan · ${w.plays} kali memutar · ${w.uniqueSongs} lagu berbeda</p></div>`);
    if (w.first) slides.push(`<div class="wr-slide"><p class="wr-kicker">Lagu pertama tahun ini</p><img class="wr-art" src="${thumbUrl(w.first.id, 'hqdefault')}" alt=""><h2 translate="no">${name(w.first.video)}</h2><p>${new Date(w.first.at).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}</p></div>`);
    slides.push(`<div class="wr-slide"><p class="wr-kicker">Lagu teratasmu</p><ol class="wr-list">${w.topSongs.map((s, i) => `<li><span class="wr-n">${i + 1}</span><img src="${thumbUrl(s.id, 'default')}" alt=""><span translate="no"><b>${name(s.video)}</b><small>${escapeHtml(s.video.channel || '')}</small></span><span class="wr-c">${s.n}×</span></li>`).join('')}</ol></div>`);
    if (w.topArtists.length) slides.push(`<div class="wr-slide"><p class="wr-kicker">Artis yang paling sering kamu putar</p><h2 translate="no">${escapeHtml(w.topArtists[0].name)}</h2><ol class="wr-list plain">${w.topArtists.slice(1).map((a, i) => `<li><span class="wr-n">${i + 2}</span><span translate="no"><b>${escapeHtml(a.name)}</b></span><span class="wr-c">${a.n}×</span></li>`).join('')}</ol></div>`);
    const facts = [
      w.topMonth >= 0 ? `<li><b>${monthName(w.topMonth)}</b><span>bulan paling ramai</span></li>` : '',
      w.topHour >= 0 ? `<li><b>${pad(w.topHour)}.00</b><span>jam favoritmu mendengarkan</span></li>` : '',
      w.streak > 1 ? `<li><b>${w.streak} hari</b><span>berturut-turut ditemani musik</span></li>` : '',
      w.daysListened ? `<li><b>${w.daysListened} hari</b><span>mendengarkan tahun ini</span></li>` : '',
      w.topTags.length ? `<li><b translate="no">#${escapeHtml(w.topTags[0].name)}</b><span>suasana yang paling sering</span></li>` : '',
    ].filter(Boolean).join('');
    if (facts) slides.push(`<div class="wr-slide"><p class="wr-kicker">Kebiasaanmu</p><ul class="wr-facts">${facts}</ul></div>`);
    slides.push(`<div class="wr-slide"><p class="wr-kicker">Selesai</p><h2>Terima kasih sudah mendengarkan</h2><p>Simpan lagu teratasmu sebagai playlist, lalu putar lagi kapan saja.</p><button type="button" class="btn btn-primary" data-wr="save">${icon('plus')}Simpan “Top ${year}”</button></div>`);
  }
  return modal({
    title: `Wrapped ${year}`,
    wide: true,
    body: `<div class="wrapped" data-n="${slides.length}"><div class="wr-track">${slides.join('')}</div>
      <div class="wr-nav"><button type="button" class="icon-btn" data-wr="prev" aria-label="Sebelumnya">${icon('prev')}</button>
        <span class="wr-dots">${slides.map((_, i) => `<i data-i="${i}"></i>`).join('')}</span>
        <button type="button" class="icon-btn" data-wr="next" aria-label="Berikutnya">${icon('next')}</button></div>
      <p class="hint">Dari riwayat putar di perangkat ini.</p></div>`,
    actions: [{ label: 'Tutup', value: null }],
    onOpen: (b, finish) => {
      let i = 0;
      const track = b.querySelector('.wr-track');
      const show = () => {
        track.style.transform = `translateX(${-i * 100}%)`;
        b.querySelectorAll('.wr-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
        b.querySelector('[data-wr=prev]').disabled = i === 0;
        b.querySelector('[data-wr=next]').disabled = i === slides.length - 1;
      };
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-wr]');
        if (!a) return;
        if (a.dataset.wr === 'next') i = Math.min(slides.length - 1, i + 1);
        if (a.dataset.wr === 'prev') i = Math.max(0, i - 1);
        if (a.dataset.wr === 'save') { finish(null); onPlayList(`Top ${year}`, w.ranked); return; }
        show();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { i = Math.min(slides.length - 1, i + 1); show(); }
        if (e.key === 'ArrowLeft') { i = Math.max(0, i - 1); show(); }
      });
      show();
    },
  });
}
