// Tarik untuk mengubah urutan (mouse & sentuh) — baris "terangkat" mengikuti jari/kursor, baris lain
// bergeser halus memberi ruang, dan halaman bergulir sendiri di dekat tepi. Kalau lagu yang ditarik
// sedang dipilih bersama lagu lain, semua yang dipilih ikut dipindah (tanda jumlah di baris yang ditarik).
//
// Mouse: tarik dari mana saja di baris (bukan tombol) atau dari pegangan ⋮⋮. Sentuh: tarik dari pegangan
// (supaya gulir biasa tetap jalan). Esc membatalkan.

const NO_DRAG = 'button, a, input, textarea, select, .idx-edit, .tag, .pick, [data-action=item-menu], [data-action=fav]';

export function enableRowDrag(list, { canReorder, entryByKey, group, move, scroller, onState = () => {} }) {
  let pend = null; // tekan mouse, belum cukup bergeser
  let d = null; // sedang menarik
  let swallowClick = false;

  const rowsNow = () => [...list.querySelectorAll(':scope > .vrow')];
  const isGrid = () => list.dataset.density === 'grid';

  function start(row, e) {
    const en = entryByKey(row.dataset.key);
    if (!en) return false;
    const ents = group(en);
    const keys = new Set(ents.map((x) => x.key));
    const rows = rowsNow();
    const sy = window.scrollY;
    const info = rows.map((r) => { const b = r.getBoundingClientRect(); return { r, key: r.dataset.key, top: b.top + sy, h: b.height, mid: b.top + sy + b.height / 2 }; });
    const src = info.find((x) => x.r === row);
    const gapPx = info.length > 1 ? Math.max(0, info[1].top - (info[0].top + info[0].h)) : 0;
    const single = ents.length === 1;
    const rect = row.getBoundingClientRect();
    // salinan baris yang melayang
    const fl = row.cloneNode(true);
    fl.classList.add('drag-float'); fl.classList.remove('flash');
    fl.removeAttribute('data-action');
    Object.assign(fl.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    swallowClick = true;
    if (!single) { const b = document.createElement('span'); b.className = 'drag-count'; b.textContent = String(ents.length); fl.append(b); }
    document.body.append(fl);
    requestAnimationFrame(() => fl.classList.add('lifted'));
    d = {
      row, ents, keys, single, info, src, H: src.h + gapPx, fl, offY: e.clientY - rect.top, y: e.clientY, slot: -1,
      // baris lain = semua baris kecuali yang ditarik (satu lagu); untuk banyak lagu, yang dipilih tetap di tempat (redup)
      others: single ? info.filter((x) => x !== src) : info,
    };
    info.forEach((x) => { if (keys.has(x.key)) x.r.classList.add(single ? 'drag-src' : 'drag-src-multi'); else x.r.classList.add('drag-shift'); });
    document.body.classList.add('row-dragging');
    onState(true);
    if (navigator.vibrate && e.pointerType !== 'mouse') navigator.vibrate(12);
    layout();
    return true;
  }

  /** Hitung slot (sebelum baris lain ke-k) dari tengah baris yang melayang, lalu geser baris lain. */
  function layout() {
    if (!d) return;
    const top = d.y - d.offY;
    d.fl.style.top = `${top}px`;
    if (isGrid()) { // kisi: cukup penanda garis
      list.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    }
    const center = top + window.scrollY + d.src.h / 2;
    let slot = d.others.findIndex((x) => center < x.mid);
    if (slot < 0) slot = d.others.length;
    if (slot === d.slot) return;
    d.slot = slot;
    const srcPos = d.info.indexOf(d.src);
    d.others.forEach((x, k) => {
      let dy = 0;
      if (d.single) {
        const i = d.info.indexOf(x);
        if (i > srcPos && k < slot) dy = -d.H; // baris di bawah naik mengisi tempat asal
        else if (i < srcPos && k >= slot) dy = d.H; // baris di atas turun memberi ruang
      } else if (k >= slot) dy = d.H;
      x.r.style.transform = dy ? `translateY(${dy}px)` : '';
    });
  }

  function finish(commit) {
    const s = d; d = null;
    if (!s) return;
    scroller.stop();
    document.body.classList.remove('row-dragging');
    // titik jatuh → indeks di playlist
    let dropIndex = null;
    if (commit) {
      const tgt = s.others[s.slot];
      if (tgt) dropIndex = entryByKey(tgt.key)?.index ?? null;
      else if (s.others.length) { const last = entryByKey(s.others[s.others.length - 1].key); dropIndex = last ? last.index + 1 : null; }
    }
    // tidak berubah kalau satu lagu dijatuhkan di tempat asalnya
    const changed = commit && dropIndex != null && (!s.single || s.slot !== s.info.indexOf(s.src));
    setTimeout(() => { swallowClick = false; }, 350);
    // baris melayang "mendarat" pelan, lalu daftar digambar ulang dengan urutan baru
    s.fl.classList.remove('lifted'); s.fl.classList.add('landing');
    const cleanup = () => {
      s.fl.remove();
      s.info.forEach((x) => { x.r.classList.remove('drag-src', 'drag-src-multi', 'drag-shift'); x.r.style.transform = ''; });
      onState(false);
    };
    if (changed) { setTimeout(() => { cleanup(); move(s.ents, dropIndex); }, 110); } else setTimeout(cleanup, 110);
  }

  list.addEventListener('pointerdown', (e) => {
    if (d || (e.pointerType === 'mouse' && e.button !== 0) || !canReorder()) return;
    const row = e.target.closest('.vrow');
    if (!row || !list.contains(row)) return;
    const onGrip = !!e.target.closest('.grip');
    if (e.pointerType !== 'mouse' && !onGrip) return; // sentuh: hanya dari pegangan
    if (!onGrip && e.target.closest(NO_DRAG)) return;
    pend = { row, x: e.clientX, y: e.clientY, id: e.pointerId, el: e.target };
    if (onGrip) { // pegangan: langsung mulai
      e.preventDefault();
      try { e.target.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
      if (start(row, e)) pend = null;
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (pend && !d && e.pointerId === pend.id) {
      const dx = e.clientX - pend.x; const dy = e.clientY - pend.y;
      if (Math.hypot(dx, dy) > 7 && Math.abs(dy) >= Math.abs(dx) * 0.6) {
        const p = pend; pend = null;
        window.getSelection()?.removeAllRanges();
        if (start(p.row, { clientX: p.x, clientY: p.y, pointerType: e.pointerType })) { d.y = e.clientY; layout(); }
      } else if (Math.hypot(dx, dy) > 7) pend = null;
      return;
    }
    if (!d) return;
    e.preventDefault();
    d.y = e.clientY;
    layout();
    scroller.update(e.clientY);
  }, { passive: false });
  window.addEventListener('pointerup', () => { pend = null; if (d) finish(true); });
  window.addEventListener('pointercancel', () => { pend = null; if (d) finish(false); });
  window.addEventListener('scroll', () => { if (d) layout(); }, { passive: true });
  window.addEventListener('keydown', (e) => { if (d && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } }, true);
  // klik setelah menarik jangan ikut memutar lagu / memilih
  window.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  list.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('.vrow')) e.preventDefault(); }); // matikan seret bawaan browser
  return { get active() { return !!d; } };
}
