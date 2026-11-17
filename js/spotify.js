// Import dari Spotify (v44). Spotify tidak bisa dibaca langsung tanpa login, jadi yang ditempel adalah
// DAFTAR LAGU-nya: file CSV dari Exportify / TuneMyMusic, atau baris "Artis - Judul". Tiap lagu dicari
// versi YouTube-nya lewat YouTube Data API (butuh API key; ±100 unit kuota per lagu ≈ 100 lagu per hari).

import { tr } from './i18n.js';
import { modal } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { getApiKey, findAudioVersions } from './sources.js';

const MAX = 60;

function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Daftar lagu dari CSV atau teks: [{ artist, title, ms }]. Murni, untuk diuji. */
export function parseTrackList(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (!t) return [];
  const first = t.split(/\r?\n/, 1)[0];
  if (/,/.test(first) && /track|title|judul|song/i.test(first) && /artist|artis/i.test(first)) {
    const rows = csvRows(t);
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    const ti = col('track name', 'title', 'song', 'name', 'judul');
    const ai = col('artist name', 'artist', 'artis');
    const di = col('duration (ms)', 'track duration (ms)', 'duration');
    return rows.slice(1).map((r) => ({
      title: (r[ti] || '').trim(),
      artist: (r[ai] || '').split(/[,;]/)[0].trim(), // artis pertama saja
      ms: di >= 0 ? Number(r[di]) || 0 : 0,
    })).filter((x) => x.title);
  }
  return t.split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).map((l) => {
    if (/open\.spotify\.com|spotify:/.test(l)) return { link: true, title: l, artist: '', ms: 0 };
    const by = /^(.+?)\s+by\s+(.+)$/i.exec(l);
    if (by) return { title: by[1].trim(), artist: by[2].trim(), ms: 0 };
    const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(l);
    return m ? { artist: m[1].trim(), title: m[2].trim(), ms: 0 } : { artist: '', title: l, ms: 0 };
  });
}

/** Hasil: { name, ids: [videoId], meta: {id: {title, channel, duration}} } atau null. */
export function spotifyImportDialog() {
  const key = getApiKey();
  return modal({
    title: 'Import dari Spotify',
    wide: true,
    body: `<p class="muted">Tempel daftar lagu dari Spotify, lalu aplikasi mencarikan versi YouTube-nya.</p>
      <ol class="small muted sp-how">
        <li>Paling mudah: buka <a href="https://exportify.net" target="_blank" rel="noopener">exportify.net</a> → login Spotify → <b>Export</b> playlist → pilih file CSV-nya di bawah.</li>
        <li>Atau tempel baris <b>Artis - Judul</b>, satu lagu per baris.</li>
      </ol>
      <div class="row"><label class="btn sm">${icon('upload')}<span>Pilih file CSV</span><input type="file" accept=".csv,.txt,text/csv,text/plain" data-s="file" hidden></label></div>
      <label class="field"><span>Daftar lagu</span><textarea rows="5" data-s="text" placeholder="Tulus - Hati-Hati di Jalan&#10;Mahalini - Sial"></textarea></label>
      <label class="field"><span>Nama playlist baru</span><input data-s="name" maxlength="100" value="${escapeHtml(tr('Dari Spotify'))}"></label>
      ${key ? '' : '<p class="error-text">Pencarian otomatis butuh YouTube API key (Setelan → Umum). Tanpa key, kamu tetap bisa membuka pencarian YouTube per lagu dari daftar di bawah.</p>'}
      <div class="sp-results" data-s="results"></div>`,
    actions: [{ label: 'Batal', value: null }, { label: 'Cari lagu', variant: 'primary', value: null, validate: () => false }],
    onOpen: (b, finish, dlg) => {
      const btn = dlg.querySelector('.modal-actions .btn-primary');
      const box = b.querySelector('[data-s=results]');
      let found = null;
      b.querySelector('[data-s=file]').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        b.querySelector('[data-s=text]').value = await f.text();
        if (/\.csv$/i.test(f.name)) b.querySelector('[data-s=name]').value = f.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 100) || tr('Dari Spotify');
      });
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (found) { // langkah kedua: simpan
          const ids = found.filter((x) => x.pick).map((x) => x.pick.id);
          if (!ids.length) return;
          const meta = Object.fromEntries(found.filter((x) => x.pick).map((x) => [x.pick.id, x.pick]));
          finish({ name: b.querySelector('[data-s=name]').value.trim() || tr('Dari Spotify'), ids, meta });
          return;
        }
        const tracks = parseTrackList(b.querySelector('[data-s=text]').value).filter((x) => !x.link);
        if (!tracks.length) { box.innerHTML = '<p class="error-text">Belum ada lagu yang dikenali. Tempel baris “Artis - Judul” atau pilih file CSV. Link Spotify saja tidak cukup (namanya tidak bisa dibaca tanpa login).</p>'; return; }
        const list = tracks.slice(0, MAX);
        const row = (x, i) => `<li class="sp-row" data-i="${i}"><span class="sp-q" translate="no">${escapeHtml(x.artist ? `${x.artist} – ${x.title}` : x.title)}</span><span class="sp-r muted small">${key ? 'menunggu…' : `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${x.artist} ${x.title}`)}" target="_blank" rel="noopener">Cari di YouTube</a>`}</span></li>`;
        box.innerHTML = `${tracks.length > MAX ? `<p class="hint">Diproses ${MAX} lagu pertama dari ${tracks.length} (batas kuota harian YouTube API). Ulangi besok untuk sisanya.</p>` : ''}<ol class="sp-list">${list.map(row).join('')}</ol>`;
        if (!key) return;
        btn.disabled = true;
        found = list.map((x) => ({ ...x, pick: null }));
        for (let i = 0; i < found.length; i++) {
          const x = found[i];
          const cell = box.querySelector(`.sp-row[data-i="${i}"] .sp-r`);
          cell.innerHTML = '<span class="spinner"></span>';
          try {
            const cands = await findAudioVersions({ artist: x.artist, track: x.title, lyricDuration: Math.round(x.ms / 1000) }, key);
            x.pick = cands[0] || null;
            cell.innerHTML = x.pick ? `${icon('check')}<span translate="no">${escapeHtml(x.pick.title)}</span>` : '<span class="error-text">tidak ketemu</span>';
          } catch (err) {
            cell.innerHTML = `<span class="error-text">${escapeHtml(err.message)}</span>`;
            if (err.code === 'quota' || /kuota|quota/i.test(err.message)) break;
          }
        }
        const n = found.filter((x) => x.pick).length;
        btn.disabled = !n;
        btn.textContent = n ? `Simpan ${n} lagu` : 'Tidak ada yang cocok';
      });
    },
  });
}
