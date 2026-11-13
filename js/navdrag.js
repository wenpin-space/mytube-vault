// Atur urutan playlist di daftar samping dengan menarik (v41).
// Mouse: tarik langsung (setelah bergeser 6 px). Sentuh: tekan lama ±0,35 detik lalu tarik.

/** Indeks tujuan dari posisi y terhadap titik tengah tiap item (selain yang ditarik). Murni, untuk diuji. */
export function dropIndex(mids, y) {
  let i = 0;
  while (i < mids.length && y > mids[i]) i++;
  return i;
}

export function enableNavDrag(box, { move, canDrag = () => true }) {
  let s = null;
  let swallow = false;

  const items = () => [...box.querySelectorAll('.nav-item[data-view^="pl:"]')];
  function start() {
    s.on = true;
    const r = s.el.getBoundingClientRect();
    s.h = r.height;
    s.ghost = s.el.cloneNode(true);
    s.ghost.classList.add('nav-ghost');
    s.ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    document.body.appendChild(s.ghost);
    s.el.classList.add('nav-dragging');
    box.classList.add('nav-reordering');
    s.others = items().filter((x) => x !== s.el);
    s.mids = s.others.map((x) => { const b = x.getBoundingClientRect(); return b.top + b.height / 2; });
    if (navigator.vibrate && s.touch) navigator.vibrate(12);
    try { box.setPointerCapture(s.id); } catch { /* abaikan */ }
  }
  function paint(y) {
    s.ghost.style.transform = `translateY(${y - s.y0}px)`;
    const to = dropIndex(s.mids, y);
    s.to = to;
    s.others.forEach((x, i) => {
      // item yang dilewati bergeser memberi tempat
      const shift = i >= to && i < s.from ? s.h : i < to && i >= s.from ? -s.h : 0;
      x.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }
  function finish(ok) {
    clearTimeout(s.timer);
    const st = s; s = null;
    if (!st.on) return;
    swallow = true; setTimeout(() => { swallow = false; }, 300);
    st.ghost.remove();
    st.el.classList.remove('nav-dragging');
    box.classList.remove('nav-reordering');
    st.others.forEach((x) => { x.style.transform = ''; });
    if (ok && st.to != null && st.to !== st.from) move(st.el.dataset.view.slice(3), st.to);
  }

  box.addEventListener('pointerdown', (e) => {
    if (s || (e.pointerType === 'mouse' && e.button !== 0) || !canDrag()) return;
    const el = e.target.closest('.nav-item[data-view^="pl:"]');
    if (!el) return;
    const all = items();
    s = { el, id: e.pointerId, y0: e.clientY, x0: e.clientX, from: all.indexOf(el), on: false, touch: e.pointerType !== 'mouse', to: null };
    if (s.touch) s.timer = setTimeout(() => { if (s && !s.on) { start(); paint(s.y0); } }, 350);
  });
  box.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dy = e.clientY - s.y0; const dx = e.clientX - s.x0;
    if (!s.on) {
      if (s.touch) { if (Math.hypot(dx, dy) > 8) { clearTimeout(s.timer); s = null; } return; } // menggulir
      if (Math.abs(dy) < 6) return;
      start();
    }
    e.preventDefault();
    paint(e.clientY);
  });
  box.addEventListener('pointerup', (e) => { if (s && e.pointerId === s.id) finish(true); });
  box.addEventListener('pointercancel', (e) => { if (s && e.pointerId === s.id) finish(false); });
  box.addEventListener('touchmove', (e) => { if (s && s.on) e.preventDefault(); }, { passive: false }); // jangan menggulir sambil menarik
  box.addEventListener('contextmenu', (e) => { if (s) e.preventDefault(); });
  box.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('keydown', (e) => { if (s && s.on && e.key === 'Escape') finish(false); });
}
