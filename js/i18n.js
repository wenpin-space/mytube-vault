// Bahasa tampilan (Indonesia / English).
// Cara kerja: semua teks ditulis dalam bahasa Indonesia di kode; saat bahasa Inggris dipilih, penerjemah
// DOM mengganti teks & atribut (title, aria-label, placeholder) memakai kamus di i18n-en.js — termasuk
// teks yang muncul belakangan (toast, dialog, menu). Konten milik pengguna (judul lagu, nama playlist,
// lirik) ditandai translate="no" sehingga tidak ikut diubah.


const KEY = 'mytube_vault_lang';
const hasLS = () => { try { return typeof localStorage !== 'undefined'; } catch { return false; } };

function detect() {
  if (!hasLS()) return 'id';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'id' || saved === 'en') return saved;
    // pengguna lama tetap bahasa Indonesia; pengguna baru mengikuti bahasa browser
    const existing = !!localStorage.getItem('mytube_vault_state_v1');
    const nav = (typeof navigator !== 'undefined' && navigator.language) || 'id';
    const l = existing || /^(id|ms)\b/i.test(nav) ? 'id' : 'en';
    localStorage.setItem(KEY, l);
    return l;
  } catch { return 'id'; }
}

export const LANG = detect();
export const LANGUAGES = [['id', 'Bahasa Indonesia'], ['en', 'English']];
/** Locale untuk format tanggal/angka. */
export const locale = () => (LANG === 'en' ? 'en-US' : 'id-ID');

export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* abaikan */ }
  location.reload();
}

// ---------------------------------------------------------------- kamus
// Kamus (±80 KB) hanya dimuat bila bahasa Inggris dipakai: pengguna berbahasa Indonesia tidak perlu memuatnya.
const exact = new Map();
const patterns = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let dictReady = false;
export function useDictionary(EN) {
  exact.clear();
  patterns.length = 0;
  for (const [k, v] of Object.entries(EN)) {
    if (!/\{\d+\}/.test(k)) { exact.set(k, v); continue; }
    const order = [];
    const re = esc(k).replace(/\\\{(\d+)\\\}/g, (_, n) => { order.push(Number(n)); return '([\\s\\S]*?)'; });
    patterns.push({ re: new RegExp(`^${re}$`), order, out: v, weight: k.replace(/\{\d+\}/g, '').length });
  }
  patterns.sort((a, b) => b.weight - a.weight);
  dictReady = true;
}

const SINGULAR = { videos: 'video', songs: 'song', minutes: 'minute', playlists: 'playlist', links: 'link', days: 'day', weeks: 'week', months: 'month', years: 'year', favorites: 'favorite', lyrics: 'lyric', 'invalid links': 'invalid link', 'more songs': 'more song' };
const fixPlural = (s) => s.replace(/(^|[^\d.,])1 (videos|songs|minutes|playlists|links|days|weeks|months|years|favorites|invalid links|more songs)\b/g, (m, pre, w) => `${pre}1 ${SINGULAR[w]}`).replace(/\bplayed 1 times\b/, 'played once');

function translateCore(core) {
  const hit = exact.get(core);
  if (hit != null) return hit;
  for (const p of patterns) {
    const m = p.re.exec(core);
    if (!m) continue;
    const vals = p.order.map((_, i) => m[i + 1]);
    const byIndex = {};
    p.order.forEach((n, i) => { const v = vals[i]; byIndex[n] = exact.has(v) ? exact.get(v) : v.includes(', ') ? v.split(', ').map((x) => exact.get(x) ?? x).join(', ') : v; });
    return fixPlural(p.out.replace(/\{(\d+)\}/g, (_, n) => (byIndex[n] != null ? byIndex[n] : '')));
  }
  if (core.includes(' · ')) {
    const parts = core.split(' · ');
    const out = parts.map((x) => translateCore(x) ?? x);
    if (out.some((x, i) => x !== parts[i])) return out.join(' · ');
  }
  // sapaan + nama panggilan: "Selamat malam, Vinz"
  const g = /^(Selamat (?:pagi|siang|sore|malam))(, .+)$/.exec(core);
  if (g) return exact.get(g[1]) + g[2];
  return null;
}

/** Terjemahkan satu teks (untuk prompt(), notifikasi, dll.). */
const cache = new Map();
export function tr(s) {
  if (LANG !== 'en' || !dictReady || typeof s !== 'string') return s;
  if (cache.has(s)) return cache.get(s);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  let out = s;
  if (m[2] && /[A-Za-z]/.test(m[2])) { const t = translateCore(m[2]); if (t != null) out = m[1] + t + m[3]; }
  if (cache.size > 6000) cache.clear();
  cache.set(s, out);
  if (out !== s) cache.set(out, out); // hasil terjemahan tidak diterjemahkan ulang
  return out;
}

// ---------------------------------------------------------------- penerjemah DOM
const ATTRS = ['title', 'aria-label', 'placeholder'];
const SKIP = 'script,style,textarea,code,[translate="no"],[contenteditable="true"]';

function inSkip(node) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return !el || !!el.closest(SKIP);
}
// pengaman: kalau aplikasi terus menulis ulang teks yang sama, berhenti menerjemahkan node itu
const churn = new WeakMap();
function guard(node, v, t) {
  // hanya putaran cepat (puluhan perubahan dalam 1 detik) yang dianggap macet; render ulang biasa tetap diterjemahkan
  const now = Date.now();
  let c = churn.get(node);
  if (!c || now - c.t0 > 1000) { c = { n: 0, t0: now }; churn.set(node, c); }
  c.n++;
  if (c.n === 30 && typeof console !== 'undefined') console.warn('[i18n] teks terus berubah, dilewati sebentar:', v, '→', t);
  return c.n < 30;
}
function doText(node) {
  if (inSkip(node)) return;
  const v = node.data;
  const t = tr(v);
  if (t !== v && guard(node, v, t)) node.data = t;
}
function doAttrs(el) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const t = tr(v); if (t !== v && guard(el, v, t)) el.setAttribute(a, t); }
  }
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || root.closest(SKIP)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n = tw.nextNode();
  while (n) { if (n.nodeType === 3) doText(n); else doAttrs(n); n = tw.nextNode(); }
}

export async function startTranslator() {
  if (LANG !== 'en' || typeof document === 'undefined') return;
  if (!dictReady) useDictionary((await import('./i18n-en.js')).EN);
  document.documentElement.lang = 'en';
  walk(document.body);
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // native prompt/confirm/alert
  const wrap = (fn) => (msg, ...rest) => fn.call(window, tr(String(msg ?? '')), ...rest);
  window.prompt = wrap(window.prompt); window.confirm = wrap(window.confirm); window.alert = wrap(window.alert);
}
