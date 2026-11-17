// Penyimpanan utama di IndexedDB (v44). LocalStorage hanya ±5 MB dan menulisnya memblokir halaman;
// IndexedDB bisa ratusan MB. Bila IndexedDB tidak tersedia (mis. mode privat lama), nilai disimpan di
// memori saja dan store tetap memakai cadangan localStorage.

const DB = 'mytube_vault';
const ST = 'kv';
let dbp = null;
const mem = new Map();

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB tidak tersedia')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(ST);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB diblokir tab lain'));
    });
    dbp.catch(() => {});
  }
  return dbp;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(ST, mode);
    const req = fn(t.objectStore(ST));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error || new Error('Gagal menyimpan (penyimpanan penuh?)'));
    t.onabort = () => reject(t.error || new Error('Penyimpanan dibatalkan'));
  }));
}

/** true bila IndexedDB bisa dipakai di browser ini. */
export async function kvAvailable() {
  try { await open(); return true; } catch { return false; }
}
export async function kvGet(key) {
  try { return await run('readonly', (s) => s.get(key)); } catch { return mem.get(key); }
}
export async function kvSet(key, value) {
  try { await run('readwrite', (s) => s.put(value, key)); return true; } catch (e) { mem.set(key, value); throw e; }
}
export async function kvDel(key) {
  mem.delete(key);
  try { await run('readwrite', (s) => s.delete(key)); } catch { /* abaikan */ }
}
