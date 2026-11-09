// Pengunjung Kafe: masuk lewat pintu (lonceng), antre & memesan di konter, mengambil minuman, duduk di
// meja bar atau berdua di meja bundar (minum & mengobrol), lalu pulang. Digambar sebagai siluet lembut
// berwarna kalem yang mengikuti cahaya ruangan; jumlahnya mengikuti waktu (ramai pagi–sore, sepi malam).

import { TAU, H, M, C, DA, LI, shade } from './paintkit.js';
import { STOOLS, STOOL_SEAT } from './cafe.js';

const LANE = 794; // jalur jalan di depan bangku bar
const DOOR = { x: 1412, y: 652 };
const ORDER = { x: 292, y: 772 };
const PICKUP = { x: 196, y: 778 };
const QUEUE_X = 372;
export const CHAT = [{ x: 1104, y: 742, face: 1 }, { x: 1296, y: 742, face: -1 }];
const HEIGHT = 250; // tinggi orang berdiri (ruang virtual) pada skala 1
const SPEED = 74;

/** Skala menurut jarak: makin ke bawah (dekat kita) makin besar. */
export const depthScale = (y) => 0.8 + Math.max(0, Math.min(1, (y - 640) / 160)) * 0.28;
/** Berapa banyak pengunjung yang pas untuk waktu ini (dibatasi di HP). */
export function crowdTarget(time, phone = false) {
  const n = { morning: 3, day: 4, dusk: 4, night: 2 }[time] ?? 3;
  return phone ? Math.min(n, 3) : n;
}

const LOOKS = {
  skin: ['f0c9a5', 'e0b48f', 'c99772', 'a8774f', '8a5e3c'],
  hair: ['2a211c', '3b2a20', '5a3d2b', '1d1d22', '7a5236', 'b08a5a'],
  top: ['d9c7a8', '7d8f7a', 'b86b56', '4d6275', 'e7ddd0', '8c7aa0', 'c9a46a', '58676b'],
  bottom: ['3a3f48', '5c5146', '2d3a4a', '7a6a58', '44403b'],
  coat: ['6b5a4a', '3f4d5c', '7a4a3a', '55604f'],
};
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
function look(r, rainy) {
  return {
    skin: pick(LOOKS.skin, r), hair: pick(LOOKS.hair, r), top: pick(LOOKS.top, r), bottom: pick(LOOKS.bottom, r),
    coat: rainy && r() < 0.7 ? pick(LOOKS.coat, r) : null, style: pick(['short', 'long', 'bun', 'short'], r),
    bag: r() < 0.35, umbrella: rainy, tall: 0.94 + r() * 0.12,
  };
}

// ------------------------------------------------------------------ menggambar satu orang
/**
 * p: { x, y, s, face: 'left'|'right'|'front'|'back', pose: 'walk'|'stand'|'sitBack'|'sitSide', ph, look,
 *      drink 0..1, talk 0..1, cup, alpha }
 */
export function drawPerson(c, p, L, t) {
  const lk = p.look; const s = p.s * lk.tall; const Hh = HEIGHT * s;
  const col = (h) => C(shade(L, h));
  const top = lk.coat || lk.top;
  c.save();
  c.globalAlpha = p.alpha ?? 1;
  c.translate(p.x, p.y);
  const side = p.face === 'left' || p.face === 'right';
  const dir = p.face === 'left' ? -1 : 1;
  const walking = p.pose === 'walk';
  const sw = walking ? Math.sin(p.ph) : 0;
  const bob = walking ? Math.abs(Math.sin(p.ph)) * 2.5 * s : 0;
  // bayangan di lantai
  if (p.pose !== 'sitBack') { c.fillStyle = 'rgba(30,20,10,0.22)'; c.beginPath(); c.ellipse(0, 2, 26 * s, 6 * s, 0, 0, TAU); c.fill(); }
  const hipY = p.pose === 'sitBack' || p.pose === 'sitSide' ? 0 : -Hh * 0.47 - bob;
  const shY = hipY - Hh * 0.33; const headY = shY - Hh * 0.11;
  const tw = (side ? 0.15 : 0.24) * Hh; const hw = (side ? 0.14 : 0.2) * Hh;
  c.lineCap = 'round'; c.lineJoin = 'round';
  // ---- kaki
  const leg = (dx, ang, len, w2, color) => { c.save(); c.translate(dx, hipY); c.rotate(ang); c.fillStyle = color; c.beginPath(); c.roundRect(-w2 / 2, 0, w2, len, w2 / 2); c.fill(); c.fillStyle = col('2a2622'); c.beginPath(); c.ellipse(side ? dir * w2 * 0.3 : 0, len, w2 * 0.75, w2 * 0.35, 0, 0, TAU); c.fill(); c.restore(); };
  const lw = 0.085 * Hh; const ll = Hh * 0.47;
  if (p.pose === 'sitBack') { // duduk di bangku bar, membelakangi kita: tungkai bawah ke pijakan bangku
    leg(-hw * 0.32, 0.12, Hh * 0.24, lw, col(lk.bottom)); leg(hw * 0.32, -0.12, Hh * 0.24, lw, col(lk.bottom));
  } else if (p.pose === 'sitSide') { // duduk di kursi menghadap meja: paha mendatar, betis turun
    c.fillStyle = col(lk.bottom); c.beginPath(); c.roundRect(dir > 0 ? -lw * 0.4 : -Hh * 0.22, -lw * 0.6, Hh * 0.22 + lw * 0.4, lw, lw / 2); c.fill();
    c.save(); c.translate(dir * Hh * 0.2, 0); c.fillStyle = col(lk.bottom); c.beginPath(); c.roundRect(-lw / 2, -lw * 0.3, lw, Hh * 0.2, lw / 2); c.fill();
    c.fillStyle = col('2a2622'); c.beginPath(); c.ellipse(dir * lw * 0.3, Hh * 0.2, lw * 0.75, lw * 0.35, 0, 0, TAU); c.fill(); c.restore();
  } else if (side) {
    leg(0, sw * 0.38, ll, lw, col(DA(H(lk.bottom), 0.12).map((v) => v.toString(16).padStart(2, '0')).join('')));
    leg(0, -sw * 0.38, ll, lw, col(lk.bottom));
  } else { // berjalan mendekat/menjauh: kaki bergantian naik
    const up = (k) => (walking ? Math.max(0, Math.sin(p.ph + k * Math.PI)) * 8 * s : 0);
    leg(-hw * 0.28, 0, ll - up(0), lw, col(lk.bottom)); leg(hw * 0.28, 0, ll - up(1), lw, col(lk.bottom));
  }
  // ---- badan
  const torso = () => {
    c.fillStyle = col(top);
    c.beginPath();
    c.moveTo(-tw / 2, shY + Hh * 0.02); c.quadraticCurveTo(-tw / 2 - Hh * 0.01, shY - Hh * 0.02, -tw / 2 + Hh * 0.05, shY - Hh * 0.025);
    c.lineTo(tw / 2 - Hh * 0.05, shY - Hh * 0.025); c.quadraticCurveTo(tw / 2 + Hh * 0.01, shY - Hh * 0.02, tw / 2, shY + Hh * 0.02);
    c.lineTo(hw / 2 + (lk.coat ? Hh * 0.02 : 0), hipY + (lk.coat ? Hh * 0.12 : Hh * 0.02)); c.lineTo(-hw / 2 - (lk.coat ? Hh * 0.02 : 0), hipY + (lk.coat ? Hh * 0.12 : Hh * 0.02)); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.beginPath(); c.moveTo(side ? -dir * tw / 2 : tw / 2, shY + Hh * 0.02); c.lineTo(side ? -dir * hw / 2 : hw / 2, hipY + Hh * 0.02); c.lineTo(side ? -dir * hw * 0.2 : hw * 0.25, hipY + Hh * 0.02); c.lineTo(side ? -dir * tw * 0.2 : tw * 0.25, shY + Hh * 0.02); c.fill();
  };
  // ---- lengan (ayun saat jalan, terangkat saat minum, bergerak saat ngobrol)
  const aw = 0.07 * Hh; const al = Hh * 0.34;
  const arm = (sx, ang, len, front) => {
    c.save(); c.translate(sx, shY + Hh * 0.01); c.rotate(ang);
    c.fillStyle = col(top); c.beginPath(); c.roundRect(-aw / 2, 0, aw, len, aw / 2); c.fill();
    c.fillStyle = col(lk.skin); c.beginPath(); c.arc(0, len, aw * 0.42, 0, TAU); c.fill();
    if (front && p.cupInHand) { c.fillStyle = col('f1ece4'); c.beginPath(); c.roundRect(-aw * 0.55, len - aw * 1.3, aw * 1.1, aw * 1.15, 2); c.fill(); }
    c.restore();
  };
  const talkWave = (p.talk || 0) * Math.sin(t * 5.5);
  const drinkA = p.drink || 0;
  if (side) {
    if (walking || p.pose === 'stand') { arm(0, -sw * 0.45, al, false); }
    torso();
    if (p.pose === 'sitSide') {
      const raise = drinkA; // dari meja ke mulut
      arm(dir * tw * 0.15, -dir * (0.9 + raise * 1.6) + talkWave * 0.12, al * (1 - raise * 0.25), true);
    } else arm(0, sw * 0.45 - (p.cupInHand ? dir * 0.5 : 0), al, true);
  } else {
    torso();
    const lift = drinkA * 2.3;
    if (p.face === 'back') {
      arm(-tw / 2 + aw * 0.3, (walking ? sw * 0.3 : 0.08), al, false);
      arm(tw / 2 - aw * 0.3, (walking ? -sw * 0.3 : -0.08) + (p.pose === 'sitBack' ? lift : 0), al * (1 - drinkA * 0.3), false);
    } else {
      arm(-tw / 2 + aw * 0.3, (walking ? sw * 0.3 : 0.1), al, false);
      arm(tw / 2 - aw * 0.3, (walking ? -sw * 0.3 : -0.1) + (p.cupInHand ? -0.4 : 0), al, true);
    }
  }
  // tas selempang
  if (lk.bag && p.pose !== 'sitBack') { c.fillStyle = col('8a6a4a'); c.beginPath(); c.roundRect((side ? -dir : 1) * hw * 0.45 - Hh * 0.04, hipY - Hh * 0.04, Hh * 0.08, Hh * 0.09, 3); c.fill(); }
  // payung tertutup (saat hujan, hanya sambil berjalan)
  if (lk.umbrella && walking) {
    const ux = side ? -dir * tw * 0.55 : -tw * 0.55;
    c.strokeStyle = col('2a2622'); c.lineWidth = 2.2 * s; c.beginPath(); c.moveTo(ux, shY + al * 0.9); c.lineTo(ux + (side ? -dir * 4 : 0), shY + al * 0.9 + Hh * 0.3); c.stroke();
    c.fillStyle = col('3d5a7a'); c.beginPath(); c.moveTo(ux - 4 * s, shY + al * 0.95); c.lineTo(ux + 4 * s, shY + al * 0.95); c.lineTo(ux + (side ? -dir * 3 : 0), shY + al * 0.9 + Hh * 0.27); c.fill();
  }
  // ---- kepala
  const hr = Hh * 0.072;
  const nod = (p.talk || 0) * Math.sin(t * 3.1) * hr * 0.12 + (p.pose === 'sitBack' ? -drinkA * hr * 0.15 : 0);
  c.fillStyle = col(lk.skin); c.fillRect(-hr * 0.35, headY + hr * 0.6, hr * 0.7, hr * 0.7);
  c.save(); c.translate(0, headY + nod);
  c.fillStyle = col(lk.skin); c.beginPath(); c.ellipse(0, 0, hr * (side ? 0.92 : 0.86), hr, 0, 0, TAU); c.fill();
  c.fillStyle = col(lk.hair);
  if (p.face === 'back') { // rambut menutupi kepala bagian belakang
    c.beginPath(); c.ellipse(0, -hr * 0.05, hr * 0.92, hr * 1.04, 0, 0, TAU); c.fill();
    if (lk.style === 'long') { c.beginPath(); c.roundRect(-hr * 0.85, 0, hr * 1.7, hr * 1.9, hr * 0.6); c.fill(); }
  } else if (side) {
    c.beginPath(); c.ellipse(-dir * hr * 0.15, -hr * 0.25, hr * 0.95, hr * 0.8, 0, Math.PI * 0.95, Math.PI * 2.05); c.fill();
    c.beginPath(); c.ellipse(-dir * hr * 0.55, -hr * 0.05, hr * 0.5, hr * 0.75, 0, 0, TAU); c.fill();
    if (lk.style === 'long') { c.beginPath(); c.roundRect(-dir * hr * 0.95 - hr * 0.35, 0, hr * 0.7, hr * 1.8, hr * 0.3); c.fill(); }
  } else {
    c.beginPath(); c.ellipse(0, -hr * 0.3, hr * 0.94, hr * 0.78, 0, Math.PI, TAU); c.fill(); c.fillRect(-hr * 0.94, -hr * 0.32, hr * 0.22, hr * 0.7); c.fillRect(hr * 0.72, -hr * 0.32, hr * 0.22, hr * 0.7);
    if (lk.style === 'long') { c.fillRect(-hr * 0.98, -hr * 0.1, hr * 0.3, hr * 1.6); c.fillRect(hr * 0.68, -hr * 0.1, hr * 0.3, hr * 1.6); }
  }
  if (lk.style === 'bun') { c.beginPath(); c.arc(p.face === 'back' || !side ? 0 : -dir * hr * 0.6, -hr * 1.05, hr * 0.42, 0, TAU); c.fill(); }
  c.restore();
  // gelembung obrolan kecil
  if ((p.talk || 0) > 0.5) {
    const a = Math.max(0, Math.sin(t * 1.3)) * 0.55;
    if (a > 0.05) {
      c.fillStyle = `rgba(255,252,245,${a})`; c.beginPath(); c.roundRect(dir * hr * 0.6 - hr * 0.7, headY - hr * 2.6, hr * 1.4, hr * 0.85, hr * 0.4); c.fill();
      c.fillStyle = `rgba(80,70,60,${a})`; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(dir * hr * 0.6 + i * hr * 0.32, headY - hr * 2.18, hr * 0.09, 0, TAU); c.fill(); }
    }
  }
  c.restore();
}

// ------------------------------------------------------------------ keramaian
/**
 * Pengatur pengunjung. step(dt, {time, weather, phone}) memajukan semuanya; people() untuk digambar.
 * hooks.onBell() saat pintu dibuka (masuk/keluar).
 */
export function createCrowd(hooks = {}, rnd = Math.random) {
  const people = [];
  let nextSpawn = 2; let seeded = false; let id = 0; let clock = 0;
  const seatTaken = (kind, i) => people.some((p) => p.seat && p.seat.kind === kind && p.seat.i === i);
  const freeStools = () => STOOLS.map((_, i) => i).filter((i) => !seatTaken('stool', i));
  const chatFree = () => !seatTaken('chat', 0) && !seatTaken('chat', 1);
  const seatPos = (seat) => (seat.kind === 'stool' ? { x: STOOLS[seat.i], y: STOOL_SEAT + 2 } : { x: CHAT[seat.i].x, y: CHAT[seat.i].y });

  function make(seat, ctx, { sitting = false, pair = null } = {}) {
    const rainy = ctx.weather === 'rain' || ctx.weather === 'storm' || ctx.weather === 'snow';
    const p = { id: ++id, look: look(rnd, rainy), seat, pair, path: [], state: 'enter', t: 0, x: DOOR.x, y: DOOR.y, face: 'front', pose: 'walk', ph: rnd() * 6, alpha: 0, drink: 0, talk: 0, cupInHand: false, stay: 50 + rnd() * 90, nextSip: 6 + rnd() * 8 };
    if (sitting) { const sp = seatPos(seat); Object.assign(p, { state: 'sit', x: sp.x, y: sp.y, alpha: 1, t: rnd() * 40, cup: true }); p.pose = seat.kind === 'stool' ? 'sitBack' : 'sitSide'; p.face = seat.kind === 'stool' ? 'back' : (CHAT[seat.i].face > 0 ? 'right' : 'left'); }
    else p.path = [{ x: DOOR.x, y: LANE }];
    people.push(p);
    return p;
  }
  function spawn(ctx) {
    const target = crowdTarget(ctx.time, ctx.phone);
    if (people.length >= target) return;
    if (chatFree() && rnd() < 0.4 && people.length + 2 <= target + 1) {
      const a = make({ kind: 'chat', i: 0 }, ctx); const b = make({ kind: 'chat', i: 1 }, ctx);
      a.pair = b.id; b.pair = a.id; b.delay = 1.4; b.alpha = 0;
      if (hooks.onBell) hooks.onBell();
      return;
    }
    const fs = freeStools();
    if (!fs.length) return;
    make({ kind: 'stool', i: fs[Math.floor(rnd() * fs.length)] }, ctx);
    if (hooks.onBell) hooks.onBell();
  }
  /** Saat Lobby dibuka: kafe sudah berisi beberapa orang yang sedang duduk. */
  function seed(ctx) {
    seeded = true;
    const n = Math.max(0, crowdTarget(ctx.time, ctx.phone) - 1);
    if (n >= 3 && chatFree() && rnd() < 0.6) { const a = make({ kind: 'chat', i: 0 }, ctx, { sitting: true }); const b = make({ kind: 'chat', i: 1 }, ctx, { sitting: true }); a.pair = b.id; b.pair = a.id; b.stay = a.stay; }
    while (people.length < n) { const fs = freeStools(); if (!fs.length) break; make({ kind: 'stool', i: fs[Math.floor(rnd() * fs.length)] }, ctx, { sitting: true }); }
  }

  /** Jalan menyusuri titik-titik path; true kalau sudah sampai. */
  function walk(p, dt) {
    if (!p.path.length) return true;
    const tg = p.path[0]; const dx = tg.x - p.x; const dy = tg.y - p.y; const d = Math.hypot(dx, dy);
    const v = SPEED * depthScale(p.y) * dt;
    p.pose = 'walk'; p.ph += dt * 7.5;
    p.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy > 0 ? 'front' : 'back');
    if (d <= v) { p.x = tg.x; p.y = tg.y; p.path.shift(); return !p.path.length; }
    p.x += (dx / d) * v; p.y += (dy / d) * v;
    return false;
  }
  const orderBusy = (me) => people.some((q) => q !== me && (q.state === 'order' || q.state === 'toOrder'));

  function step(dt, ctx) {
    if (!seeded) seed(ctx);
    clock += dt;
    nextSpawn -= dt;
    if (nextSpawn <= 0) { spawn(ctx); nextSpawn = 9 + rnd() * 16; }
    for (const p of [...people]) {
      p.t += dt;
      if (p.delay > 0) { p.delay -= dt; continue; }
      switch (p.state) {
        case 'enter':
          p.alpha = Math.min(1, p.alpha + dt * 2);
          if (walk(p, dt)) { p.state = 'toQueue'; p.path = [{ x: QUEUE_X + (p.pair && p.seat.i === 1 ? 46 : 0), y: LANE }]; }
          break;
        case 'toQueue':
          if (walk(p, dt)) { p.pose = 'stand'; p.face = 'left'; p.state = 'queue'; }
          break;
        case 'queue':
          if (!orderBusy(p)) { p.state = 'toOrder'; p.path = [{ x: ORDER.x, y: ORDER.y }]; }
          break;
        case 'toOrder':
          if (walk(p, dt)) { p.state = 'order'; p.t = 0; p.pose = 'stand'; p.face = 'back'; p.wait = 3.5 + rnd() * 2.5; }
          break;
        case 'order':
          if (p.t > p.wait) { p.state = 'toPickup'; p.path = [{ x: PICKUP.x, y: PICKUP.y }]; }
          break;
        case 'toPickup':
          if (walk(p, dt)) { p.state = 'pickup'; p.t = 0; p.pose = 'stand'; p.face = 'back'; p.wait = 3 + rnd() * 3; }
          break;
        case 'pickup':
          if (p.t > p.wait) { p.cupInHand = true; const sp = seatPos(p.seat); p.state = 'toSeat'; p.path = [{ x: PICKUP.x + 60, y: LANE }, { x: sp.x, y: LANE }, { x: sp.x, y: sp.y + (p.seat.kind === 'stool' ? 96 : 50) }]; }
          break;
        case 'toSeat':
          if (walk(p, dt)) { const sp = seatPos(p.seat); p.x = sp.x; p.y = sp.y; p.state = 'sit'; p.t = 0; p.cupInHand = false; p.cup = true; p.pose = p.seat.kind === 'stool' ? 'sitBack' : 'sitSide'; p.face = p.seat.kind === 'stool' ? 'back' : (CHAT[p.seat.i].face > 0 ? 'right' : 'left'); }
          break;
        case 'sit': {
          // minum sesekali; berdua: bergantian bicara
          p.nextSip -= dt;
          if (p.nextSip <= 0 && !p.sipT) { p.sipT = 2.6; p.nextSip = 9 + rnd() * 10; }
          if (p.sipT > 0) { p.sipT -= dt; const k = 1 - Math.abs(1 - 2 * (1 - p.sipT / 2.6)); p.drink = Math.min(1, k * 1.6); if (p.sipT <= 0) { p.sipT = 0; p.drink = 0; } }
          const mate = p.pair ? people.find((q) => q.id === p.pair) : null;
          if (mate && mate.state === 'sit') { const turn = Math.floor(clock / 4.5) % 2 === p.seat.i; p.talk += ((turn && !p.sipT ? 1 : 0.15) - p.talk) * Math.min(1, dt * 3); } else p.talk += (0 - p.talk) * Math.min(1, dt * 3);
          const leader = !mate || p.seat.i === 0;
          if (leader && p.t > p.stay && !p.sipT) {
            [p, mate].filter(Boolean).forEach((q, k) => { q.state = 'leave'; q.delay = k * 0.9; q.talk = 0; q.drink = 0; const sp = seatPos(q.seat); q.path = [{ x: sp.x, y: LANE }, { x: DOOR.x, y: LANE }, { x: DOOR.x, y: DOOR.y }]; q.seat = { ...q.seat, leaving: true }; });
          }
          break;
        }
        case 'leave':
          if (walk(p, dt)) { p.state = 'exit'; }
          else if (Math.hypot(p.x - DOOR.x, p.y - DOOR.y) < 40) p.alpha = Math.max(0, p.alpha - dt * 2.5);
          break;
        case 'exit':
          p.alpha -= dt * 3;
          if (p.alpha <= 0) people.splice(people.indexOf(p), 1);
          break;
        default: break;
      }
      p.s = depthScale(p.state === 'sit' ? (p.seat.kind === 'stool' ? 748 : 790) : p.y);
    }
  }
  const sorted = () => [...people].filter((p) => !(p.delay > 0)).sort((a, b) => sortY(a) - sortY(b));
  const sortY = (p) => (p.state === 'sit' ? (p.seat.kind === 'stool' ? 748 : 790) : p.y);
  return { step, people: sorted, get count() { return people.length; }, seat: seatPos };
}
