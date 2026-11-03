// Link berbagi playlist tanpa server: isi playlist (ID + judul) dikompres dan disimpan di bagian #share=… link.
// Siapa pun yang punya link bisa melihat daftar lagunya; tidak ada data yang dikirim ke server mana pun.

import { isValidId } from './parser.js';

const MAX_VIDEOS = 300;
const PREFIX = '#share=';

function b64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** Bangun payload ringkas dari playlist + library. */
export function buildSharePayload(playlist, videos) {
  const items = playlist.items.slice(0, MAX_VIDEOS);
  return {
    v: 1,
    n: playlist.name,
    i: items.map((it) => it.youtubeId),
    t: items.map((it) => ((videos[it.youtubeId] && videos[it.youtubeId].title) || '').slice(0, 90)),
    c: items.map((it) => ((videos[it.youtubeId] && videos[it.youtubeId].channel) || '').slice(0, 40)),
    truncated: playlist.items.length > MAX_VIDEOS ? playlist.items.length : undefined,
  };
}

export async function encodeShare(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (canCompress()) return `z${b64urlEncode(await pipe(json, new CompressionStream('deflate-raw')))}`;
  return `j${b64urlEncode(json)}`;
}

/** Validasi ketat: data dari link orang lain tidak dipercaya begitu saja. */
export async function decodeShare(code) {
  const kind = code[0];
  let bytes = b64urlDecode(code.slice(1));
  if (kind === 'z') {
    if (!canCompress()) throw new Error('Browser ini belum mendukung link berbagi terkompresi.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'j') throw new Error('Format link tidak dikenali.');
  if (bytes.length > 2_000_000) throw new Error('Isi link terlalu besar.');
  const p = JSON.parse(new TextDecoder().decode(bytes));
  if (!p || p.v !== 1 || !Array.isArray(p.i)) throw new Error('Isi link tidak valid.');
  const name = typeof p.n === 'string' && p.n.trim() ? p.n.trim().slice(0, 100) : 'Playlist dibagikan';
  const videos = [];
  const seen = new Set();
  p.i.slice(0, MAX_VIDEOS).forEach((id, k) => {
    if (!isValidId(id) || seen.has(id)) return;
    seen.add(id);
    const title = Array.isArray(p.t) && typeof p.t[k] === 'string' ? p.t[k].slice(0, 300) : '';
    const channel = Array.isArray(p.c) && typeof p.c[k] === 'string' ? p.c[k].slice(0, 200) : '';
    videos.push({ id, title, channel });
  });
  if (!videos.length) throw new Error('Link ini tidak berisi video.');
  return { name, videos, truncated: Number(p.truncated) || 0 };
}

export function shareUrl(code) {
  return `${location.origin}${location.pathname}${PREFIX}${code}`;
}

/** Kode share dari URL sekarang (lalu dibersihkan dari address bar). */
export function takeShareFromUrl() {
  if (!location.hash.startsWith(PREFIX)) return null;
  const code = location.hash.slice(PREFIX.length);
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* abaikan */ }
  return code || null;
}
