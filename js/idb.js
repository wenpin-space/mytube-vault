// Penyimpanan file besar di perangkat (gambar latar & suara sendiri) lewat IndexedDB.
// LocalStorage terlalu kecil untuk file; IndexedDB bisa puluhan MB.

const DB = 'mytube_vault_files';
const STORE = 'files';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB tidak tersedia di browser ini.')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Gagal membuka penyimpanan file.'));
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const req = fn(st);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error || new Error('Gagal menyimpan file (penyimpanan penuh?).'));
  }));
}

export const putFile = (key, value) => tx('readwrite', (s) => s.put(value, key));
export const getFile = (key) => tx('readonly', (s) => s.get(key));
export const deleteFile = (key) => tx('readwrite', (s) => s.delete(key));
export const listKeys = () => tx('readonly', (s) => s.getAllKeys());
