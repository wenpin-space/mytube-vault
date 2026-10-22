// Format file backup — dipakai untuk Gist DAN export/import manual.
//
// Tanpa enkripsi:
//   { "app": "mytube-vault", "version": 1, "encrypted": false, "updatedAt": "...", "data": { ... } }
// Dengan enkripsi:
//   { "app": "mytube-vault", "version": 1, "encrypted": true, "updatedAt": "...",
//     "crypto": { kdf, iterations, cipher, salt, iv }, "payload": "<base64>" }
//
// updatedAt sengaja tidak dienkripsi supaya deteksi konflik bisa jalan tanpa passphrase.

import { encryptJSON, decryptJSON } from './crypto.js';

export const APP_ID = 'mytube-vault';

export async function buildEnvelope(data, passphrase = null) {
  const base = { app: APP_ID, version: 1, updatedAt: data.updatedAt };
  if (passphrase) {
    const { crypto, payload } = await encryptJSON(data, passphrase);
    return JSON.stringify({ ...base, encrypted: true, crypto, payload }, null, 2);
  }
  // Diformat rapi supaya diff di riwayat revisi Gist enak dibaca.
  return JSON.stringify({ ...base, encrypted: false, data }, null, 2);
}

export function parseEnvelope(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('File bukan JSON yang valid.'); }
  if (!obj || typeof obj !== 'object') throw new Error('File ini tidak terlihat sebagai backup MyTube Vault.');

  const looksLikeEnvelope = obj.app === APP_ID || ('encrypted' in obj && ('data' in obj || 'payload' in obj));
  if (looksLikeEnvelope) {
    if (obj.encrypted) {
      if (!obj.payload || !obj.crypto || !obj.crypto.salt || !obj.crypto.iv) {
        throw new Error('Backup terenkripsi tidak lengkap.');
      }
      return { encrypted: true, updatedAt: String(obj.updatedAt || ''), crypto: obj.crypto, payload: obj.payload };
    }
    if (!obj.data || typeof obj.data !== 'object') throw new Error('Backup tidak berisi data.');
    return { encrypted: false, updatedAt: String(obj.updatedAt || obj.data.updatedAt || ''), data: obj.data };
  }
  // Data mentah / model lama (langsung { playlists: [...] })
  if (Array.isArray(obj.playlists)) {
    return { encrypted: false, updatedAt: String(obj.updatedAt || ''), data: obj, legacy: true };
  }
  throw new Error('File ini tidak terlihat sebagai backup MyTube Vault.');
}

export async function openEnvelope(env, passphrase) {
  if (!env.encrypted) return env.data;
  return decryptJSON(env.crypto, env.payload, passphrase);
}

export function summarize(data) {
  if (!data) return null;
  return {
    playlists: Array.isArray(data.playlists) ? data.playlists.length : 0,
    videos: data.videos ? Object.keys(data.videos).length : 0,
    updatedAt: data.updatedAt || null,
  };
}
