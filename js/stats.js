// Statistik mendengarkan. Log detail (kapan diputar, berapa lama didengar) hanya disimpan di perangkat ini;
// jumlah putar per lagu ikut data utama (playCount) sehingga tersinkron lewat Gist.

import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, formatTotal } from './utils.js';
import { thumbUrl } from './metadata.js';
import { titleOf } from './titles.js';
import { locale } from './i18n.js';

const KEY = 'mytube_vault_stats_v1';
const MAX_PLAYS = 3000;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.plays) && s.daily && typeof s.daily === 'object') return s;
  } catch { /* abaikan */ }
  return { plays: [], daily: {} };
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* penuh: lewati */ } }

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function logPlay(id, at = Date.now()) {
  const s = load();
  s.plays.push({ id, at });
  if (s.plays.length > MAX_PLAYS) s.plays.splice(0, s.plays.length - MAX_PLAYS);
  save(s);
}

/** Tambah detik mendengarkan ke hari ini (dipanggil berkala saat musik berjalan). */
export function addListen(seconds, when = new Date()) {
  if (!(seconds > 0)) return;
  const s = load();
  const k = dayKey(when);
  s.daily[k] = Math.round((s.daily[k] || 0) + seconds);
  const keys = Object.keys(s.daily).sort();
  if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((x) => delete s.daily[x]);
  save(s);
}

export function clearStats() { try { localStorage.removeItem(KEY); } catch { /* abaikan */ } }

/** Hitung ringkasan (murni, mudah diuji). */
export function computeStats(data, raw = load(), now = new Date()) {
  const vids = Object.values(data.videos);
  const totalPlays = vids.reduce((n, v) => n + (v.playCount || 0), 0);
  const libDuration = vids.reduce((n, v) => n + (v.duration || 0), 0);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    days.push({ key: k, label: d.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', ''), date: d.getDate(), seconds: raw.daily[k] || 0 });
  }
  const sumDays = (n) => {
    let t = 0;
    for (let i = 0; i < n; i++) { const d = new Date(now); d.setDate(d.getDate() - i); t += raw.daily[dayKey(d)] || 0; }
    return t;
  };
  const hours = Array(24).fill(0);
  for (const p of raw.plays) hours[new Date(p.at).getHours()]++;
  const top = vids.filter((v) => v.playCount > 0).sort((a, b) => b.playCount - a.playCount || String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt))).slice(0, 10);
  const byChannel = new Map();
  for (const v of vids) if (v.playCount > 0 && v.channel) byChannel.set(v.channel, (byChannel.get(v.channel) || 0) + v.playCount);
  const channels = [...byChannel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, plays]) => ({ name, plays }));
  const byTag = new Map();
  for (const v of vids) for (const t of v.tags || []) byTag.set(t, (byTag.get(t) || 0) + Math.max(1, v.playCount || 0));
  const tags = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, score]) => ({ name, score }));
  const peakHour = hours.some((h) => h > 0) ? hours.indexOf(Math.max(...hours)) : -1;
  return {
    videos: vids.length, playlists: data.playlists.length, favorites: vids.filter((v) => v.favorite).length,
    totalPlays, libDuration, week: sumDays(7), month: sumDays(30), days, hours, peakHour, top, channels, tags,
  };
}

const mins = (s) => Math.round(s / 60);
function bars(values, labels, fmt, { highlight = -1 } = {}) {
  if (!values.some((v) => v > 0)) return '<p class="bars-empty muted small">Belum ada data di perangkat ini. Grafik terisi sendiri saat kamu memutar lagu.</p>';
  const max = Math.max(1, ...values);
  return `<div class="bars">${values.map((v, i) => `
    <div class="bar-col${i === highlight ? ' hl' : ''}" title="${escapeHtml(labels[i].title)}: ${escapeHtml(fmt(v))}">
      <div class="bar" style="height:${Math.round((v / max) * 100)}%"></div>
      <span class="bar-label">${escapeHtml(labels[i].short)}</span>
    </div>`).join('')}</div>`;
}

export function openStatsDialog(store, { onPlay } = {}) {
  const s = computeStats(store.data);
  const tile = (label, value, sub = '') => `<div class="stat-tile"><span class="muted small">${label}</span><b>${value}</b>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>`;
  return modal({
    title: 'Statistik',
    wide: true,
    body: `
      <div class="stat-grid">
        ${tile('Didengar 7 hari', formatTotal(s.week) || '0 menit')}
        ${tile('Didengar 30 hari', formatTotal(s.month) || '0 menit')}
        ${tile('Total diputar', `${s.totalPlays.toLocaleString(locale())}×`)}
        ${tile('Library', `${s.videos} lagu`, `${s.playlists} playlist · ${s.favorites} favorit${s.libDuration ? ` · ±${formatTotal(s.libDuration)}` : ''}`)}
      </div>
      <section class="stat-sec"><h3>${icon('chart')}Menit mendengarkan, 14 hari terakhir</h3>
        ${bars(s.days.map((d) => mins(d.seconds)), s.days.map((d) => ({ short: d.date, title: `${d.label} ${d.key}` })), (v) => `${v} menit`, { highlight: 13 })}</section>
      <section class="stat-sec"><h3>${icon('clock')}Jam favorit${s.peakHour >= 0 ? ` <span class="muted small">— paling sering pukul ${String(s.peakHour).padStart(2, '0')}.00</span>` : ''}</h3>
        ${bars(s.hours, s.hours.map((_, h) => ({ short: h % 3 === 0 ? String(h) : '', title: `Pukul ${String(h).padStart(2, '0')}.00` })), (v) => `${v} kali diputar`, { highlight: s.peakHour })}</section>
      <div class="stat-two">
        <section class="stat-sec"><h3>${icon('music')}Paling sering diputar</h3>
          ${s.top.length ? `<ol class="stat-top">${s.top.map((v) => `<li><button type="button" class="stat-song" data-play="${escapeHtml(v.youtubeId)}">
            <img src="${thumbUrl(v.youtubeId, 'default')}" alt="" loading="lazy"><span class="lib-text"><b>${escapeHtml(titleOf(v) || v.youtubeId)}</b><small class="muted">${escapeHtml(v.channel || '')}</small></span><span class="pill">${v.playCount}×</span></button></li>`).join('')}</ol>` : '<p class="muted small">Belum ada.</p>'}
        </section>
        <section class="stat-sec"><h3>${icon('volume')}Channel teratas</h3>
          ${s.channels.length ? `<ul class="stat-list">${s.channels.map((c) => `<li><span>${escapeHtml(c.name)}</span><span class="pill">${c.plays}×</span></li>`).join('')}</ul>` : '<p class="muted small">Belum ada.</p>'}
          <h3 class="mt">${icon('tag')}Tag</h3>
          ${s.tags.length ? `<div class="tag-row">${s.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t.name)}</span>`).join('')}</div>` : '<p class="muted small">Belum ada tag. Atur lewat menu ⋮ pada lagu.</p>'}
        </section>
      </div>
      <p class="hint">Jumlah putar per lagu ikut tersinkron lewat Cloud Sync. Grafik menit & jam dihitung di perangkat ini saja.</p>`,
    actions: [{ label: 'Tutup', value: null }],
    onOpen: (b, finish) => {
      b.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-play]');
        if (btn && onPlay) { finish(null); onPlay(btn.dataset.play); }
      });
    },
  });
}
