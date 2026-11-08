// Command palette (Ctrl+K / ⌘K): lompat ke playlist, tag, lagu, atau jalankan aksi dengan keyboard.

import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { thumbUrl } from './metadata.js';

/** Skor kecocokan "fuzzy": semua huruf query muncul berurutan. Lebih tinggi = lebih cocok; -1 = tidak cocok. */
export function fuzzyScore(text, query) {
  const t = String(text).toLocaleLowerCase('id');
  const q = String(query).toLocaleLowerCase('id').trim();
  if (!q) return 0;
  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at * 2 - (t.length - q.length) * 0.1 + (at === 0 || /\s/.test(t[at - 1]) ? 200 : 0);
  // setiap kata query harus ada (urutan bebas)
  const words = q.split(/\s+/);
  if (words.length > 1 && words.every((w) => t.includes(w))) return 600 - t.length * 0.1;
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    const k = t.indexOf(ch, ti);
    if (k < 0) return -1;
    streak = k === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - Math.min(k - ti, 10);
    ti = k + 1;
  }
  return score;
}

/**
 * items: [{ id, group, label, hint?, icon?, thumb?, keywords?, run() }]
 * songs(q): fungsi opsional → item lagu yang cocok (dicari hanya saat ada query).
 */
export function openPalette({ items, songs }) {
  if (document.querySelector('dialog.palette[open]')) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'palette';
  dlg.setAttribute('aria-label', 'Perintah cepat');
  dlg.innerHTML = `
    <div class="pal-search">${icon('search')}<input type="text" placeholder="Cari playlist, lagu, atau perintah…" aria-label="Cari perintah" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="pal-list"><kbd>Esc</kbd></div>
    <div class="pal-list" id="pal-list" role="listbox"></div>
    <div class="pal-foot muted small"><span><kbd>↑</kbd><kbd>↓</kbd> pilih</span><span><kbd>Enter</kbd> buka</span><span><kbd>Ctrl</kbd><kbd>K</kbd> buka/tutup</span></div>`;
  document.body.appendChild(dlg);
  const input = dlg.querySelector('input');
  const list = dlg.querySelector('.pal-list');
  let shown = [];
  let sel = 0;

  const filter = (q) => {
    if (!q.trim()) return items.filter((x) => !x.hideEmpty);
    const scored = items
      .map((x) => ({ x, s: Math.max(fuzzyScore(x.label, q), x.keywords ? fuzzyScore(x.keywords, q) - 50 : -1) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.x);
    const extra = songs ? songs(q) : [];
    return [...scored.slice(0, 30), ...extra];
  };

  const render = () => {
    const q = input.value;
    shown = filter(q);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    if (!shown.length) { list.innerHTML = `<p class="muted pad">Tidak ada yang cocok dengan “${escapeHtml(q)}”.</p>`; return; }
    let group = null;
    list.innerHTML = shown.map((x, i) => {
      const head = x.group !== group ? `<p class="pal-group">${escapeHtml((group = x.group))}</p>` : '';
      return `${head}<button type="button" class="pal-item${i === sel ? ' sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}">
        ${x.thumb ? `<img src="${thumbUrl(x.thumb, 'default')}" alt="" loading="lazy">` : `<span class="pal-ic">${icon(x.icon || 'arrowRight')}</span>`}
        <span class="pal-label"${x.thumb ? ' translate="no"' : ''}>${escapeHtml(x.label)}</span>${x.hint ? `<span class="pal-hint">${escapeHtml(x.hint)}</span>` : ''}</button>`;
    }).join('');
  };
  const move = (d) => {
    if (!shown.length) return;
    sel = (sel + d + shown.length) % shown.length;
    list.querySelectorAll('.pal-item').forEach((b) => {
      const on = Number(b.dataset.i) === sel;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-selected', String(on));
      if (on) b.scrollIntoView({ block: 'nearest' });
    });
  };
  const close = () => { dlg.close(); };
  const run = (i) => {
    const x = shown[i];
    if (!x) return;
    close();
    setTimeout(() => x.run(), 0);
  };

  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); close(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.pal-item'); if (b) run(Number(b.dataset.i)); });
  list.addEventListener('mousemove', (e) => {
    const b = e.target.closest('.pal-item');
    if (b && Number(b.dataset.i) !== sel) { sel = Number(b.dataset.i); list.querySelectorAll('.pal-item').forEach((n) => n.classList.toggle('sel', n === b)); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  render();
  dlg.showModal();
  input.focus();
}
