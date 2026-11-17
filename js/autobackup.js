// Backup otomatis berkala (v44).
// 1) Seminggu sekali salinan data disimpan diam-diam di perangkat (IndexedDB, 4 salinan terakhir).
// 2) Pengingat untuk mengunduh file backup (data browser bisa terhapus saat "hapus data situs"),
//    bawaan tiap 7 hari, atau 30 hari bila sudah tersinkron ke Gist. Bisa diatur / dimatikan di Setelan.

import { kvGet, kvSet } from './kv.js';
import { buildEnvelope } from './envelope.js';
import { downloadText, todayStamp } from './utils.js';

const KEY = 'auto-backups';
const KEEP = 4;
const DAY = 86400000;

export async function listAutoBackups() {
  try { const l = await kvGet(KEY); return Array.isArray(l) ? l : []; } catch { return []; }
}

/** Simpan salinan bila yang terakhir sudah ≥ 7 hari (atau force). Hasil: true bila dibuat. */
export async function makeAutoBackup(store, { force = false, now = Date.now() } = {}) {
  const list = await listAutoBackups();
  const last = list[0];
  if (!force && last && now - Date.parse(last.savedAt) < 7 * DAY) return false;
  const vids = Object.keys(store.data.videos).length;
  if (!vids && !store.data.playlists.some((p) => p.items.length)) return false;
  const entry = { savedAt: new Date(now).toISOString(), videos: vids, playlists: store.data.playlists.length, json: JSON.stringify(store.data) };
  try { await kvSet(KEY, [entry, ...list].slice(0, KEEP)); return true; } catch { return false; }
}

/** Interval pengingat (hari): pilihan pengguna, atau 7 / 30 (bila Gist aktif). 0 = mati. */
export function reminderDays(store) {
  const v = store.ui.backupEvery;
  if (v === 0 || v === 7 || v === 30) return v;
  return store.cloud && store.cloud.connected ? 30 : 7;
}
/** Sudah waktunya mengingatkan unduh file backup? */
export function backupDue(store, now = Date.now()) {
  const days = reminderDays(store);
  if (!days) return false;
  const last = Date.parse(store.ui.lastBackupFileAt || store.ui.firstSeenAt || '') || 0;
  const snooze = Date.parse(store.ui.backupSnoozeUntil || '') || 0;
  return now > snooze && now - last >= days * DAY;
}

/** Unduh file backup (format sama dengan file Gist) dan catat waktunya. */
export async function downloadBackup(store) {
  const text = await buildEnvelope(store.data, null);
  downloadText(`mytube-vault-backup-${todayStamp()}.json`, text);
  store.ui.lastBackupFileAt = new Date().toISOString();
  store.saveUiQuiet();
}
