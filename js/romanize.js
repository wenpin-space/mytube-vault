// Romanisasi lirik (v44): cara baca huruf Mandarin (pinyin), Jepang (kana → romaji), dan Korea (hangul).
// Pinyin memakai tabel js/pinyin-data.js (±100 KB, dimuat hanya saat dibutuhkan). Hasilnya perkiraan:
// huruf Mandarin berbunyi ganda dipilih dari kata yang dikenal atau bacaan paling umum, dan kanji pada
// lirik Jepang dibiarkan apa adanya (cara bacanya bergantung konteks).

const HAN = /[一-鿿]/;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힣]/;
/** Apakah teks punya huruf yang bisa diromanisasi. */
export const needsRomanize = (text) => HAN.test(text) || KANA.test(text) || HANGUL.test(text);

// ---------- Korea (Revised Romanization, disederhanakan) ----------
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
// akhiran yang "pindah" ke suku kata berikutnya bila suku itu diawali ㅇ (mis. 음악 → eumak)
const LINK = { 1: 'g', 2: 'kk', 4: 'n', 7: 'd', 8: 'r', 16: 'm', 17: 'b', 19: 's', 20: 'ss', 22: 'j', 23: 'ch', 24: 'k', 25: 't', 26: 'p', 27: '' };
export function romanizeHangul(s) {
  const cs = [...s];
  const parts = cs.map((c) => {
    const code = c.charCodeAt(0) - 0xac00;
    return code < 0 || code > 11171 ? null : { cho: Math.floor(code / 588), jung: Math.floor((code % 588) / 28), jong: code % 28 };
  });
  let out = '';
  for (let i = 0; i < cs.length; i++) {
    const p = parts[i];
    if (!p) { out += cs[i]; continue; }
    const prev = parts[i - 1]; const next = parts[i + 1];
    let cho = CHO[p.cho];
    if (prev && prev.jong && p.cho === 11 && prev.jong in LINK) cho = LINK[prev.jong];
    else if (prev && prev.jong === 8 && p.cho === 5) cho = 'l'; // ㄹ+ㄹ → ll
    out += cho + JUNG[p.jung];
    if (p.jong && !(next && next.cho === 11 && p.jong in LINK)) out += JONG[p.jong];
  }
  return out;
}

// ---------- Jepang (kana → Hepburn) ----------
const K = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
};
const SMALL_Y = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const SMALL_V = { ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };
const toHira = (c) => { const n = c.charCodeAt(0); return n >= 0x30a1 && n <= 0x30f6 ? String.fromCharCode(n - 0x60) : c; };
export function romanizeKana(s) {
  const cs = [...s].map(toHira);
  let out = '';
  let gem = false;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]; const n = cs[i + 1];
    if (c === 'っ') { gem = true; continue; }
    if (c === 'ー') { const v = out.match(/[aeiou]$/); if (v) out += v[0]; continue; }
    let r = K[c];
    if (r == null) { out += c; gem = false; continue; }
    if (n && SMALL_Y[n] && /i$/.test(r) && r.length > 1) { // きゃ → kya, しゃ → sha
      r = /^(shi|chi|ji)$/.test(r) ? r.slice(0, -1) + SMALL_Y[n] : r.slice(0, -1) + 'y' + SMALL_Y[n]; i++;
    } else if (n && SMALL_V[n] && r.length > 1) { r = r.replace(/[aeiou]$/, '') + SMALL_V[n]; i++; } // ファ → fa
    if (gem) { out += r.startsWith('ch') ? 't' : r[0]; gem = false; }
    if (c === 'ん' && n && /^[aiueoy]/.test(K[n] || '')) r = "n'";
    out += r;
  }
  return out;
}

// ---------- Mandarin (pinyin) ----------
let pin = null;
export async function loadPinyin() {
  if (pin) return pin;
  const { CHARS, WORDS } = await import('./pinyin-data.js');
  const chars = new Map();
  for (const part of CHARS.split('|')) {
    const i = part.indexOf(':');
    const r = part.slice(0, i);
    for (const c of part.slice(i + 1)) chars.set(c, r);
  }
  const words = new Map(WORDS.split('|').map((w) => { const i = w.indexOf(':'); return [w.slice(0, i), w.slice(i + 1).split(' ')]; }));
  pin = { chars, words };
  return pin;
}
/** Pinyin satu baris (kata yang dikenal dulu, lalu per huruf). Butuh loadPinyin() lebih dulu. */
export function pinyinLine(s, data = pin) {
  const cs = [...s];
  const out = [];
  let plain = '';
  const flush = () => { if (plain.trim()) out.push(plain.trim()); plain = ''; };
  for (let i = 0; i < cs.length;) {
    if (!HAN.test(cs[i])) { plain += cs[i]; i++; continue; }
    flush();
    let hit = null;
    for (let len = 4; len >= 2 && !hit; len--) {
      const w = cs.slice(i, i + len).join('');
      if (w.length === len && data.words.has(w)) hit = { r: data.words.get(w), len };
    }
    if (hit) { out.push(...hit.r); i += hit.len; continue; }
    out.push(data.chars.get(cs[i]) || cs[i]);
    i++;
  }
  flush();
  return out.join(' ');
}

/**
 * Romanisasi semua baris. Lirik yang memuat kana dianggap bahasa Jepang (kanji tidak diubah).
 * Hasil: array teks (string kosong bila baris itu tidak perlu diromanisasi).
 */
export async function romanizeLines(lines) {
  const all = lines.join('\n');
  const ja = KANA.test(all);
  const zh = !ja && HAN.test(all);
  if (zh) await loadPinyin();
  const one = (l) => {
    if (!needsRomanize(l)) return '';
    if (HANGUL.test(l)) return romanizeHangul(l);
    if (ja) return romanizeKana(l);
    if (zh) return pinyinLine(l);
    return '';
  };
  // baris yang tidak berubah (mis. baris kanji saja di lagu Jepang) tidak perlu cara baca
  return lines.map((l) => { const r = one(l); return r.trim() === l.trim() ? '' : r; });
}
