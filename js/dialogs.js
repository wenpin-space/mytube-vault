// Modal, toast, dan menu popover. Setiap modal = <dialog> baru, jadi modal bisa bertumpuk.

import { escapeHtml, formatDateTime } from './utils.js';
import { icon } from './icons.js';

// ---------- toast ----------
/** Toast ditaruh di dialog paling atas (kalau ada) supaya tidak tertutup backdrop. */
export function toast(message, type = 'info', ms = 3500, action = null) {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  const host = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  let box = host.querySelector(':scope > .toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('aria-live', 'polite');
    host.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.fn(); dismiss(); });
    el.appendChild(b);
  }
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const timer = setTimeout(dismiss, ms);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }
}

// ---------- modal ----------
export function modal({ title, body = '', actions = [], wide = false, dismissValue = null, onOpen } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `modal${wide ? ' modal-wide' : ''}`;
    dlg.innerHTML = `
      <div class="modal-inner">
        <header class="modal-head"><h2></h2>
          <button type="button" class="icon-btn" data-modal-close aria-label="Tutup">${icon('x')}</button>
        </header>
        <div class="modal-body"></div>
        ${actions.length ? '<footer class="modal-actions"></footer>' : ''}
      </div>`;
    dlg.querySelector('h2').textContent = title;
    const bodyEl = dlg.querySelector('.modal-body');
    if (body instanceof Node) bodyEl.appendChild(body); else bodyEl.innerHTML = body;

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      resolve(value);
    };

    const foot = dlg.querySelector('.modal-actions');
    const buttons = actions.map((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${a.variant ? ` btn-${a.variant}` : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', async () => {
        if (a.validate && !(await a.validate(bodyEl))) return;
        finish(typeof a.value === 'function' ? a.value(bodyEl) : a.value);
      });
      foot.appendChild(b);
      return { a, b };
    });

    dlg.querySelector('[data-modal-close]').addEventListener('click', () => finish(dismissValue));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(dismissValue); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const t = e.target;
      const submitOnEnter = (t.matches('input') && !t.matches('[type=checkbox],[type=radio],[type=file]')) ||
        (t.matches('textarea') && (e.ctrlKey || e.metaKey));
      if (!submitOnEnter) return;
      const primary = buttons.find((x) => x.a.variant === 'primary');
      if (primary) { e.preventDefault(); primary.b.click(); }
    });

    document.body.appendChild(dlg);
    dlg.showModal();
    if (onOpen) onOpen(bodyEl, finish, dlg);
    else {
      const first = bodyEl.querySelector('input, textarea, select');
      if (first) first.focus();
    }
  });
}

function setError(bodyEl, msg) {
  const el = bodyEl.querySelector('.form-error');
  if (el) el.textContent = msg || '';
  return !msg;
}

export function confirmDialog(title, message, { ok = 'Ya', cancel = 'Batal', danger = false } = {}) {
  return modal({
    title,
    body: `<p class="pre">${escapeHtml(message)}</p>`,
    actions: [{ label: cancel, value: false }, { label: ok, value: true, variant: danger ? 'danger' : 'primary' }],
    dismissValue: false,
  });
}

export function promptDialog(title, { label = '', value = '', placeholder = '', ok = 'Simpan', hint = '' } = {}) {
  return modal({
    title,
    body: `<label class="field"><span>${escapeHtml(label)}</span>
      <input type="text" id="prompt-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="100"></label>
      ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}<p class="form-error"></p>`,
    actions: [
      { label: 'Batal', value: null },
      {
        label: ok,
        variant: 'primary',
        validate: (b) => setError(b, b.querySelector('#prompt-input').value.trim() ? '' : 'Tidak boleh kosong.'),
        value: (b) => b.querySelector('#prompt-input').value.trim(),
      },
    ],
    onOpen: (b) => { const i = b.querySelector('#prompt-input'); i.focus(); i.select(); },
  });
}

export function textInputDialog(title, { label = '', placeholder = '', ok = 'Lanjut' } = {}) {
  return modal({
    title,
    body: `<label class="field"><span>${escapeHtml(label)}</span>
      <textarea id="text-input" rows="8" placeholder="${escapeHtml(placeholder)}" spellcheck="false"></textarea></label>
      <p class="form-error"></p>`,
    actions: [
      { label: 'Batal', value: null },
      {
        label: ok,
        variant: 'primary',
        validate: (b) => setError(b, b.querySelector('#text-input').value.trim() ? '' : 'Belum ada teks.'),
        value: (b) => b.querySelector('#text-input').value,
      },
    ],
  });
}

/** mode: 'open' (buka backup) | 'new' (buat) | 'change' (ganti). Hasil: {pass, remember} | null */
export function passphraseDialog({ mode = 'open', retry = false } = {}) {
  const isNew = mode !== 'open';
  const title = mode === 'open' ? 'Masukkan passphrase' : mode === 'change' ? 'Ganti passphrase' : 'Buat passphrase enkripsi';
  const intro = mode === 'open'
    ? `${retry ? '<p class="error-text">Passphrase salah. Coba lagi.</p>' : ''}<p>Backup cloud terenkripsi. Masukkan passphrase untuk membukanya.</p>`
    : `<p>Passphrase dipakai untuk mengenkripsi isi Gist (minimal 8 karakter).</p>
       <p class="warn-box">${icon('alert')}<span>Kalau passphrase lupa, backup terenkripsi <b>tidak bisa dipulihkan</b> oleh siapa pun. Simpan di password manager.</span></p>`;
  return modal({
    title,
    body: `${intro}
      <label class="field"><span>Passphrase</span><input type="password" id="pp1" autocomplete="${isNew ? 'new-password' : 'current-password'}"></label>
      ${isNew ? '<label class="field"><span>Ulangi passphrase</span><input type="password" id="pp2" autocomplete="new-password"></label>' : ''}
      <label class="check"><input type="checkbox" id="pp-remember" checked><span>Ingat di perangkat ini (disimpan di browser, sama seperti token GitHub)</span></label>
      <p class="form-error"></p>`,
    actions: [
      { label: 'Batal', value: null },
      {
        label: mode === 'open' ? 'Buka' : 'Simpan',
        variant: 'primary',
        validate: (b) => {
          const p = b.querySelector('#pp1').value;
          if (!p) return setError(b, 'Passphrase masih kosong.');
          if (isNew && p.length < 8) return setError(b, 'Minimal 8 karakter.');
          if (isNew && p !== b.querySelector('#pp2').value) return setError(b, 'Kedua passphrase tidak sama.');
          return true;
        },
        value: (b) => ({ pass: b.querySelector('#pp1').value, remember: b.querySelector('#pp-remember').checked }),
      },
    ],
  });
}

export function conflictDialog({ local, remote, remoteUpdatedAt }) {
  const card = (t, s, updated) => `
    <div class="cmp-card"><h4>${t}</h4>
      ${s ? `<p><b>${s.playlists}</b> playlist · <b>${s.videos}</b> video</p>` : '<p>Isi terenkripsi (passphrase belum dimasukkan)</p>'}
      <p class="muted small">Diubah ${escapeHtml(formatDateTime(updated))}</p></div>`;
  return modal({
    title: 'Konflik data',
    body: `<p>Data di cloud sudah diubah dari perangkat lain sejak sinkron terakhir, sementara di sini juga ada perubahan yang belum terkirim. Pilih versi yang mau dipakai:</p>
      <div class="compare">${card('Perangkat ini', local, local && local.updatedAt)}${card('Cloud (GitHub Gist)', remote, remoteUpdatedAt)}</div>
      <p class="hint">Pakai lokal → versi cloud saat ini tetap tersimpan di Riwayat versi. Pakai cloud → data lokal disimpan sebagai snapshot (tab Backup).</p>`,
    actions: [
      { label: 'Nanti saja', value: null },
      { label: 'Pakai versi lokal', value: 'local' },
      { label: 'Pakai versi cloud', value: 'cloud', variant: 'primary' },
    ],
  });
}

/** Hasil: playlistId | '__new__' | null */
export function pickPlaylistDialog(playlists, { title = 'Pilih playlist', excludeId = null } = {}) {
  const items = playlists.filter((p) => p.id !== excludeId);
  return modal({
    title,
    body: `<div class="list-box pick-list">
      ${items.map((p) => `<button type="button" class="pick-item" data-id="${escapeHtml(p.id)}">${icon('music')}<span>${escapeHtml(p.name)}</span><span class="muted small">${p.items.length}</span></button>`).join('')}
      <button type="button" class="pick-item" data-id="__new__">${icon('plus')}<span>Playlist baru…</span></button></div>`,
    onOpen: (b, finish) => {
      b.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-id]');
        if (btn) finish(btn.dataset.id);
      });
      const first = b.querySelector('.pick-item');
      if (first) first.focus();
    },
  });
}

// ---------- menu popover ----------
let menuEl = null;
let menuCleanup = null;

export function closeMenu() {
  if (menuEl) { if (menuEl.scrim) menuEl.scrim.remove(); menuEl.remove(); menuEl = null; }
  if (menuCleanup) { menuCleanup(); menuCleanup = null; }
}

export function openMenu(anchor, items) {
  if (menuEl && menuEl.anchor === anchor) { closeMenu(); return; }
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.anchor = anchor;
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { m.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.className = `menu-item${it.danger ? ' danger' : ''}`;
    b.disabled = !!it.disabled;
    b.innerHTML = `${it.icon ? icon(it.icon) : '<span class="i"></span>'}<span>${escapeHtml(it.label)}</span>`;
    b.addEventListener('click', () => { closeMenu(); if (it.action) it.action(); });
    m.appendChild(b);
  }
  // rapikan separator di awal/akhir
  while (m.firstElementChild && m.firstElementChild.classList.contains('menu-sep')) m.firstElementChild.remove();
  while (m.lastElementChild && m.lastElementChild.classList.contains('menu-sep')) m.lastElementChild.remove();

  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth;
  const mh = m.offsetHeight;
  const left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  menuEl = m;

  const onDown = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { closeMenu(); anchor.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const btns = [...m.querySelectorAll('.menu-item:not(:disabled)')];
      const i = btns.indexOf(document.activeElement);
      const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      if (btns[n]) btns[n].focus();
    }
  };
  // Abaikan scroll sesaat setelah menu dibuka (sisa momentum scroll di HP).
  const openedAt = performance.now();
  // Di HP menu tampil sebagai sheet di bawah layar, jadi scroll halaman tidak membuatnya salah posisi.
  const isSheet = getComputedStyle(m).bottom === '0px';
  if (isSheet) {
    // Lapisan gelap yang menelan ketukan, supaya ketuk di luar menu hanya menutup menu
    // (tidak ikut menekan tombol/kolom di bawahnya).
    const scrim = document.createElement('div');
    scrim.className = 'menu-scrim';
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); };
    scrim.addEventListener('pointerdown', swallow);
    scrim.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    document.body.insertBefore(scrim, m);
    m.scrim = scrim;
  }
  const onScroll = (e) => { if (!isSheet && !m.contains(e.target) && performance.now() - openedAt > 300) closeMenu(); };
  // Bilah alamat Chrome Android muncul/hilang saat disentuh → memicu resize tinggi. Tutup hanya kalau lebarnya berubah.
  const startW = window.innerWidth;
  const onResize = () => { if (window.innerWidth !== startW) closeMenu(); };
  setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  document.addEventListener('scroll', onScroll, true);
  menuCleanup = () => {
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);
  };
  const first = m.querySelector('.menu-item:not(:disabled)');
  if (first) first.focus({ preventScroll: true });
}
