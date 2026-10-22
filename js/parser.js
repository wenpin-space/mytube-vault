// Mengubah berbagai bentuk link YouTube menjadi video ID (11 karakter).

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PATH_MARKERS = ['shorts', 'embed', 'live', 'v', 'e'];

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

function isYouTubeHost(host) {
  return host === 'youtu.be' ||
    host === 'youtube.com' || host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
}

/**
 * Didukung:
 *  youtube.com/watch?v=ID, m./music./www., youtu.be/ID,
 *  /shorts/ID, /embed/ID, /live/ID, /v/ID, youtube-nocookie.com/embed/ID
 * Opsi allowBareId: terima ID polos ("dQw4w9WgXcQ") — dipakai di input tunggal.
 */
export function extractYouTubeId(input, { allowBareId = false } = {}) {
  if (input == null) return null;
  let text = String(input).trim();
  if (!text) return null;
  if (allowBareId && isValidId(text)) return text;

  if (!/^https?:\/\//i.test(text)) {
    // "youtu.be/xxx" atau "www.youtube.com/..." tanpa skema
    if (!/^(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(text)) return null;
    text = `https://${text}`;
  }

  let url;
  try { url = new URL(text); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (!isYouTubeHost(host)) return null;

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1];
    return isValidId(id) ? id : null;
  }

  const v = url.searchParams.get('v');
  if (isValidId(v)) return v;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && PATH_MARKERS.includes(parts[0].toLowerCase()) && isValidId(parts[1])) {
    return parts[1];
  }
  return null;
}

/**
 * Multi-paste: pecah teks berdasarkan spasi/baris/koma, parse tiap token,
 * buang duplikat. Token yang bukan link diabaikan dari hitungan "tidak valid"
 * kecuali terlihat seperti URL.
 */
export function parseMany(text) {
  const tokens = String(text || '').split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set();
  const valid = [];
  const invalid = [];
  let duplicates = 0;
  for (const token of tokens) {
    const id = extractYouTubeId(token);
    if (!id) {
      if (/^https?:\/\/|\.\w{2,}\//i.test(token)) invalid.push(token);
      continue;
    }
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    valid.push(id);
  }
  return { valid, invalid, duplicates };
}
