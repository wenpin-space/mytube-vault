// Panel yang bisa digeser: video melayang (tempel ke pojok) dan urutan antrean. Dipisah dari main.js (v39).

const $ = (id) => document.getElementById(id);

// ---------- player mengambang: geser ke pojok mana pun (desktop/tablet lebar) ----------
export function enableStageFloat({ store }) {
  const stage = $('stage');
  const bar = stage.querySelector('.stage-bar');
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || window.innerWidth <= 860) return;
    const r = stage.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, x0: e.clientX, y0: e.clientY };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    drag.moved = true;
    stage.classList.add('dragging');
    const w = stage.offsetWidth;
    const h = stage.offsetHeight;
    const x = Math.max(0, Math.min(window.innerWidth - w, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(window.innerHeight - h, e.clientY - drag.dy));
    Object.assign(stage.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('dragging');
    stage.style.left = ''; stage.style.top = ''; stage.style.right = ''; stage.style.bottom = '';
    if (!d.moved) {
      if (store.ui.stageMin !== false) { store.ui.stageMin = false; store.saveUi(); } // ketuk bilah saat diminimize = tampilkan lagi
      return;
    }
    // Tempel ke pojok terdekat.
    const cx = e.clientX < window.innerWidth / 2 ? 'l' : 'r';
    const cy = e.clientY < window.innerHeight / 2 ? 't' : 'b';
    store.ui.stageCorner = cy + cx;
    store.saveUi();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}

// ---------- toast di pojok kanan bawah, tepat di atas video melayang ----------
export function trackStageSpace() {
  const stage = $('stage');
  const update = () => {
    const cs = getComputedStyle(stage);
    const visible = !stage.hidden && cs.position === 'fixed' && cs.opacity !== '0' && cs.visibility !== 'hidden' && !document.body.classList.contains('np-open') && !document.body.classList.contains('np-side-on');
    document.body.style.setProperty('--stage-space', visible ? `${stage.offsetHeight + 12}px` : '0px');
  };
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(stage);
  new MutationObserver(update).observe(stage, { attributes: true, attributeFilter: ['hidden', 'class'] });
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  update();
}

// ---------- geser untuk mengubah urutan antrean (mouse & sentuh) ----------
export function enableQueueDrag({ player }) {
  const box = $('queue-list');
  let d = null;
  const clear = () => box.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  box.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.q-grip');
    if (!grip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = grip.closest('.q-row');
    e.preventDefault();
    try { grip.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
    d = { row, from: Number(row.dataset.pos), target: null, after: false };
    row.classList.add('dragging');
    if (navigator.vibrate && e.pointerType !== 'mouse') navigator.vibrate(10);
  });
  box.addEventListener('pointermove', (e) => {
    if (!d) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el && el.closest('.q-upcoming .q-row');
    clear();
    if (row && row !== d.row && box.contains(row)) {
      const r = row.getBoundingClientRect();
      d.after = e.clientY > r.top + r.height / 2;
      d.target = row;
      row.classList.add(d.after ? 'drop-after' : 'drop-before');
    } else d.target = null;
    const b = box.getBoundingClientRect();
    if (e.clientY < b.top + 40) box.scrollTop -= 12;
    else if (e.clientY > b.bottom - 40) box.scrollTop += 12;
  });
  const end = (commit) => {
    if (!d) return;
    const { row, from, target, after } = d;
    d = null;
    row.classList.remove('dragging');
    clear();
    if (!commit || !target) return;
    let to = Number(target.dataset.pos) + (after ? 1 : 0);
    if (to > from) to--;
    player.moveInQueue(from, to);
  };
  box.addEventListener('pointerup', () => end(true));
  box.addEventListener('pointercancel', () => end(false));
}
