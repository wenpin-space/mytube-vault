// Geser baris lagu di HP (v41): ke kanan = Putar berikutnya, ke kiri = Tambah ke playlist.
// Hanya untuk sentuhan; gulir ke atas/bawah tetap milik browser (baris memakai touch-action: pan-y).

const START = 14;      // px geser mendatar sebelum dianggap menggeser (bukan mengetuk/menggulir)
const COMMIT = 84;     // px untuk menjalankan aksi
const MAX = 132;       // batas geser (sisanya diperlambat)

/** Arah & apakah sudah melewati batas: 'right' | 'left' | null. Murni, untuk diuji. */
export function swipeResult(dx, commit = COMMIT) {
  if (dx >= commit) return 'right';
  if (dx <= -commit) return 'left';
  return null;
}
/** Geser yang terlihat: penuh sampai batas, lalu melambat. */
export function damp(dx, max = MAX) {
  const a = Math.abs(dx);
  const v = a <= max ? a : max + (a - max) * 0.25;
  return Math.sign(dx) * v;
}

/**
 * actions: { right: {icon, label, run(row)}, left: {...} }
 * enabled(): false saat mode pilih, tampilan kisi, atau sedang menarik baris.
 */
export function enableSwipe(list, { enabled, actions, icon }) {
  let s = null;
  let swallowClick = false;

  const under = document.createElement('div');
  under.className = 'swipe-under';
  under.hidden = true;

  function begin(row) {
    const r = row.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    under.style.top = `${r.top - lr.top}px`;
    under.style.left = `${r.left - lr.left}px`;
    under.style.width = `${r.width}px`;
    under.style.height = `${r.height}px`;
    under.innerHTML = `<span class="sw-act right">${icon(actions.right.icon)}<span>${actions.right.label}</span></span><span class="sw-act left"><span>${actions.left.label}</span>${icon(actions.left.icon)}</span>`;
    if (under.parentNode !== list) list.appendChild(under);
    under.hidden = false;
    row.classList.add('swiping');
  }
  function paint(dx) {
    const v = damp(dx);
    s.row.style.transform = `translateX(${v}px)`;
    under.dataset.dir = dx > 0 ? 'right' : 'left';
    under.classList.toggle('armed', !!swipeResult(dx));
    if (!!swipeResult(dx) !== s.armed) { s.armed = !!swipeResult(dx); if (s.armed && navigator.vibrate) navigator.vibrate(8); }
  }
  function end(commit) {
    if (!s) return;
    const { row, dx, swiping } = s;
    s = null;
    if (!swiping) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 350);
    const dir = commit ? swipeResult(dx) : null;
    row.style.transition = 'transform .2s ease';
    row.style.transform = '';
    setTimeout(() => {
      row.style.transition = '';
      row.classList.remove('swiping');
      under.hidden = true;
      under.classList.remove('armed');
    }, 210);
    if (dir) setTimeout(() => actions[dir].run(row), 60);
  }

  list.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || s || !enabled()) return;
    const row = e.target.closest('.vrow');
    if (!row || e.target.closest('.grip, .idx-edit, input')) return;
    s = { row, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, swiping: false, armed: false };
  });
  list.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.swiping) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; } // menggulir
      if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      s.swiping = true;
      s.x = e.clientX - Math.sign(dx) * 2; // mulai halus, tanpa loncatan
      begin(s.row);
      try { list.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
      list.dispatchEvent(new CustomEvent('swipe-start')); // batalkan tekan-lama
    }
    s.dx = e.clientX - s.x;
    paint(s.dx);
  });
  list.addEventListener('pointerup', (e) => { if (s && e.pointerId === s.id) end(true); });
  list.addEventListener('pointercancel', (e) => { if (s && e.pointerId === s.id) end(false); });
  // klik sintetis setelah jari diangkat jangan sampai mengenai baris atau dialog yang baru terbuka
  document.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
}
