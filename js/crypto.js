// Enkripsi opsional untuk isi Gist: PBKDF2-SHA256 → AES-GCM 256 (WebCrypto).

const enc = new TextEncoder();
const dec = new TextDecoder();
export const PBKDF2_ITERATIONS = 250000;

function subtle() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) {
    const e = new Error('Enkripsi butuh halaman dibuka lewat HTTPS atau localhost.');
    e.code = 'NO_CRYPTO';
    throw e;
  }
  return s;
}

export function toBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromBase64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Setiap enkripsi memakai salt & IV acak baru. */
export async function encryptJSON(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return {
    crypto: {
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      cipher: 'AES-GCM-256',
      salt: toBase64(salt),
      iv: toBase64(iv),
    },
    payload: toBase64(ct),
  };
}

export async function decryptJSON(info, payload, passphrase) {
  subtle();
  try {
    const key = await deriveKey(passphrase, fromBase64(info.salt), Number(info.iterations) || PBKDF2_ITERATIONS);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(info.iv) }, key, fromBase64(payload));
    return JSON.parse(dec.decode(pt));
  } catch {
    // AES-GCM gagal verifikasi tag = passphrase salah (atau data rusak)
    const e = new Error('Passphrase salah atau data backup rusak.');
    e.code = 'WRONG_PASSPHRASE';
    throw e;
  }
}
