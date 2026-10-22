// Sync manager: LocalStorage ⇄ GitHub Gist.
//
// Deteksi konflik memakai pola "3 titik":
//   L = store.data.updatedAt            (versi lokal sekarang)
//   R = updatedAt di file Gist          (versi cloud sekarang)
//   B = store.cloud.lastRemoteUpdatedAt (versi cloud saat sinkron terakhir)
//
//   R == B          → cloud tidak berubah sejak terakhir → aman push lokal
//   R == L          → sudah sama → tidak perlu apa-apa
//   R != B, lokal tidak ada perubahan pending → ambil versi cloud diam-diam
//   R != B, lokal juga berubah → KONFLIK → tanya user
//
// Ini lebih aman daripada sekadar membandingkan "siapa yang lebih baru",
// karena jam perangkat yang berbeda tidak bisa membuat data tertimpa diam-diam.

import { store, getToken, setToken, clearToken, defaultCloud, isDataEmpty, PASS_KEY } from './store.js';
import * as gh from './gist.js';
import { buildEnvelope, parseEnvelope, openEnvelope } from './envelope.js';
import { nowISO } from './utils.js';

const MIN_PUSH_GAP = 8000;     // jarak minimal antar-PATCH (batas "content creation" GitHub)
const RETRY_DELAY = 60000;
const CHECK_ON_FOCUS_AFTER = 60000;
const RETRIABLE = new Set(['NETWORK', 'RATE_LIMIT', 'SERVER']);
const listeners = new Set();

function lockedError(msg = 'Passphrase dibutuhkan untuk sinkron backup terenkripsi.') {
  const e = new Error(msg);
  e.code = 'LOCKED';
  return e;
}

export function extractGistId(input) {
  const s = String(input || '').trim().replace(/\/+$/, '');
  const m = s.match(/([0-9a-f]{20,40})(?:\.git)?(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

export const sync = {
  status: 'disabled', // disabled|pending|saving|checking|saved|offline|error|conflict|locked
  message: '',
  user: null,
  passphrase: null,

  // Diisi oleh main.js (UI):
  requestPassphrase: async () => null, // (mode, retry) => {pass, remember} | null
  resolveConflict: async () => null,   // ({remote}) => 'cloud' | 'local' | null
  notify: () => {},

  _timer: null,
  _retry: null,
  _syncing: false,
  _again: false,
  _checking: false,
  _lastCheck: 0,
  _lastPush: 0,
  _corruptOverride: false,

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setStatus(status, message = '') {
    this.status = status;
    this.message = message;
    for (const fn of listeners) {
      try { fn(status); } catch (e) { console.error(e); }
    }
  },
  get token() { return getToken(); },
  get connected() { return !!(store.cloud.connected && this.token); },

  init() {
    try { this.passphrase = localStorage.getItem(PASS_KEY) || null; } catch { this.passphrase = null; }
    this.user = store.cloud.login || null;

    store.on((type) => {
      if (type === 'change') this.schedule();
      else if (type === 'external') this.refreshStatus();
    });
    window.addEventListener('online', () => { if (this.connected) this.check(); });
    window.addEventListener('offline', () => {
      if (this.connected) this.setStatus('offline', 'Perubahan disimpan lokal dan dikirim saat online.');
    });
    document.addEventListener('visibilitychange', () => {
      if (!this.connected) return;
      if (document.visibilityState === 'visible' && Date.now() - this._lastCheck > CHECK_ON_FOCUS_AFTER) {
        this.check();
      } else if (document.visibilityState === 'hidden' && this._timer && store.cloud.pendingChanges) {
        this.push(); // kirim segera sebelum tab mungkin ditutup
      }
    });

    this.refreshStatus();
    if (this.connected) this.check();
  },

  refreshStatus() {
    const c = store.cloud;
    if (!this.connected) return this.setStatus('disabled');
    if (!navigator.onLine) return this.setStatus('offline', 'Perubahan disimpan lokal dan dikirim saat online.');
    if (c.lastError) return this.setStatus('error', c.lastError);
    if (c.pendingChanges) return this.setStatus('pending');
    return this.setStatus('saved');
  },

  /** Debounce: kumpulkan perubahan, lalu kirim sekali. */
  schedule() {
    if (!this.connected) return;
    if (this.status === 'conflict' || this.status === 'locked') return; // tunggu user menyelesaikan
    clearTimeout(this._timer);
    this._timer = null;
    const s = store.data.settings.sync;
    if (!s.autoSync) {
      this.setStatus('pending', 'Auto-sync mati — klik "Sinkron sekarang" untuk menyimpan ke cloud.');
      return;
    }
    if (!navigator.onLine) {
      this.setStatus('offline', 'Perubahan disimpan lokal dan dikirim saat online.');
      return;
    }
    this.setStatus('pending');
    const wait = Math.max(s.debounceMs, this._lastPush + MIN_PUSH_GAP - Date.now());
    this._timer = setTimeout(() => { this._timer = null; this.push(); }, wait);
  },

  async fetchRemote() {
    const c = store.cloud;
    const gist = await gh.getGist(this.token, c.gistId);
    const text = await gh.readFile(gist, c.fileName);
    if (text == null) return { gist, envelope: null };
    try {
      return { gist, envelope: parseEnvelope(text) };
    } catch (e) {
      return { gist, envelope: null, corrupt: e.message };
    }
  },

  /** Kirim data lokal ke Gist. force=true melewati cek konflik (user sudah memilih "pakai lokal"). */
  async push({ force = false } = {}) {
    const c = store.cloud;
    if (!this.connected) return;
    clearTimeout(this._timer);
    this._timer = null;
    if (!navigator.onLine) { this.setStatus('offline', 'Perubahan disimpan lokal dan dikirim saat online.'); return; }
    if (this._syncing) { this._again = true; return; }
    this._syncing = true;
    this.setStatus('saving');

    let diverged = null;
    try {
      const enc = store.data.settings.sync.encryptionEnabled;
      let remoteEnv = null;
      if (!force || (enc && !this.passphrase)) remoteEnv = (await this.fetchRemote()).envelope;

      if (!force && remoteEnv && remoteEnv.updatedAt !== c.lastRemoteUpdatedAt && remoteEnv.updatedAt !== store.data.updatedAt) {
        diverged = remoteEnv; // cloud berubah dari perangkat lain
      } else {
        if (enc && !this.passphrase) {
          // Verifikasi passphrase lewat backup yang sudah ada, supaya salah ketik
          // tidak diam-diam mengganti passphrase.
          if (remoteEnv && remoteEnv.encrypted) {
            const ok = await this.openWithPrompt(remoteEnv);
            if (!ok) throw lockedError();
          } else {
            const r = await this.requestPassphrase('new', false);
            if (!r) throw lockedError();
            this.setPassphrase(r.pass, r.remember);
          }
        }
        const sentUpdatedAt = store.data.updatedAt;
        const content = await buildEnvelope(store.data, enc ? this.passphrase : null);
        await gh.updateFile(this.token, c.gistId, c.fileName, content);
        this._lastPush = Date.now();
        c.lastRemoteUpdatedAt = sentUpdatedAt;
        c.lastSyncedAt = nowISO();
        c.lastError = null;
        c.pendingChanges = store.data.updatedAt !== sentUpdatedAt; // ada perubahan selama upload?
        store.saveCloud();
        if (c.pendingChanges) this._again = true;
        else this.setStatus('saved');
      }
    } catch (e) {
      if (e.code === 'LOCKED') this.setStatus('locked', e.message);
      else this.fail(e);
    } finally {
      this._syncing = false;
    }

    if (diverged) { this._again = false; await this.handleDivergence(diverged); return; }
    if (this._again) { this._again = false; this.schedule(); }
  },

  /** Cek kondisi cloud (saat app dibuka, kembali online, tab difokus, atau klik "Sinkron sekarang"). */
  async check() {
    const c = store.cloud;
    if (!this.connected) return;
    if (!navigator.onLine) { this.setStatus('offline', 'Perubahan disimpan lokal dan dikirim saat online.'); return; }
    if (this._checking || this._syncing) return;
    this._checking = true;
    this._lastCheck = Date.now();
    this.setStatus('checking');
    let action = null;
    let env = null;
    try {
      const r = await this.fetchRemote();
      env = r.envelope;
      if (r.corrupt) {
        const err = new Error(`Backup di Gist tidak dapat dibaca (${r.corrupt}). "Sinkron sekarang" akan menimpanya dengan data lokal; versi lama tetap ada di riwayat.`);
        err.code = 'CORRUPT';
        throw err;
      }
      if (!env) action = 'push';
      else if (env.updatedAt === store.data.updatedAt) {
        c.lastRemoteUpdatedAt = env.updatedAt;
        c.pendingChanges = false;
        action = 'none';
      } else if (env.updatedAt === c.lastRemoteUpdatedAt) {
        action = c.pendingChanges ? 'push' : 'none';
      } else {
        action = 'diverged';
      }
    } catch (e) {
      this._checking = false;
      if (e.code === 'CORRUPT') {
        // Data corrupt: izinkan "Sinkron sekarang" berikutnya menimpa
        c.lastError = e.message;
        c.lastRemoteUpdatedAt = null;
        store.saveCloud();
        this.setStatus('error', e.message);
        this._corruptOverride = true;
        return;
      }
      this.fail(e);
      return;
    }
    this._checking = false;

    if (action === 'push') {
      c.pendingChanges = true;
      store.saveCloud();
      return this.push({ force: !env });
    }
    if (action === 'none') {
      c.lastError = null;
      store.saveCloud();
      this.setStatus('saved');
      return;
    }
    if (action === 'diverged') return this.handleDivergence(env);
  },

  /** Tombol "Sinkron sekarang". */
  async syncNow() {
    if (this._corruptOverride) {
      this._corruptOverride = false;
      store.cloud.pendingChanges = true;
      return this.push({ force: true });
    }
    return this.check();
  },

  async handleDivergence(env) {
    const c = store.cloud;
    if (!c.pendingChanges || isDataEmpty(store.data)) {
      return this.applyEnvelope(env, { notify: c.lastRemoteUpdatedAt ? 'Data diperbarui dari cloud.' : 'Data dimuat dari cloud.' });
    }
    this.setStatus('conflict', 'Data di cloud berubah dari perangkat lain.');
    let choice = null;
    try { choice = await this.resolveConflict({ remote: env }); } catch (e) { console.error(e); }
    if (choice === 'cloud') return this.applyEnvelope(env, { notify: 'Memakai versi cloud.' });
    if (choice === 'local') {
      c.lastRemoteUpdatedAt = env.updatedAt;
      store.saveCloud();
      this.setStatus('pending');
      return this.push({ force: true });
    }
    this.setStatus('conflict', 'Konflik belum diselesaikan. Klik untuk memilih versi.');
  },

  /** Buka envelope (minta passphrase bila perlu). adopt=true → passphrase yang benar dipakai untuk sync. */
  async openWithPrompt(env, { adopt = true } = {}) {
    if (!env.encrypted) return env.data;
    if (this.passphrase) {
      try { return await openEnvelope(env, this.passphrase); } catch (e) { if (e.code !== 'WRONG_PASSPHRASE') throw e; }
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await this.requestPassphrase('open', attempt > 0);
      if (!r) return null;
      try {
        const data = await openEnvelope(env, r.pass);
        if (adopt) this.setPassphrase(r.pass, r.remember);
        return data;
      } catch (e) {
        if (e.code !== 'WRONG_PASSPHRASE') throw e;
      }
    }
    throw new Error('Passphrase salah 3 kali. Coba lagi nanti.');
  },

  async applyEnvelope(env, { notify } = {}) {
    let data;
    try {
      data = await this.openWithPrompt(env);
    } catch (e) {
      this.setStatus('error', e.message);
      this.notify(e.message, 'error');
      return false;
    }
    if (!data) {
      this.setStatus('locked', 'Backup cloud terenkripsi. Masukkan passphrase untuk membukanya.');
      return false;
    }
    try {
      store.replaceData(data, { fromCloud: true });
    } catch (e) {
      this.setStatus('error', `Backup cloud tidak valid: ${e.message}`);
      return false;
    }
    const c = store.cloud;
    store.data.settings.sync.encryptionEnabled = !!env.encrypted;
    c.lastRemoteUpdatedAt = env.updatedAt;
    c.lastSyncedAt = nowISO();
    c.pendingChanges = false;
    c.lastError = null;
    store.saveCloud();
    this.setStatus('saved');
    if (notify) this.notify(notify, 'success');
    return true;
  },

  /** "Tarik dari cloud" — ganti data lokal dengan versi cloud. */
  async pullReplace() {
    const r = await this.fetchRemote();
    if (!r.envelope) throw new Error(r.corrupt ? `Backup cloud tidak dapat dibaca: ${r.corrupt}` : 'Belum ada backup di Gist ini.');
    return this.applyEnvelope(r.envelope, { notify: 'Data dipulihkan dari cloud.' });
  },

  fail(e) {
    const c = store.cloud;
    const code = e && e.code;
    const msg = (e && e.message) || String(e);
    if (code === 'NETWORK' && !navigator.onLine) {
      this.setStatus('offline', 'Perubahan disimpan lokal dan dikirim saat online.');
      return;
    }
    c.lastError = msg;
    store.saveCloud();
    this.setStatus('error', msg);
    if (RETRIABLE.has(code)) {
      clearTimeout(this._retry);
      this._retry = setTimeout(() => this.check(), RETRY_DELAY);
    }
  },

  // ---------- koneksi ----------
  async connectToken(token) {
    token = String(token || '').trim();
    if (!token) throw new Error('Token masih kosong.');
    const user = await gh.getUser(token);
    setToken(token);
    this.user = user.login;
    return user;
  },

  async createGist() {
    const c = store.cloud;
    const enc = store.data.settings.sync.encryptionEnabled;
    if (enc && !this.passphrase) {
      const r = await this.requestPassphrase('new', false);
      if (!r) throw new Error('Passphrase dibutuhkan karena enkripsi aktif.');
      this.setPassphrase(r.pass, r.remember);
    }
    const content = await buildEnvelope(store.data, enc ? this.passphrase : null);
    const gist = await gh.createGist(this.token, c.fileName, content);
    Object.assign(c, {
      connected: true, gistId: gist.id, login: this.user,
      lastRemoteUpdatedAt: store.data.updatedAt, lastSyncedAt: nowISO(),
      pendingChanges: false, lastError: null,
    });
    this._lastPush = Date.now();
    store.saveCloud();
    this.setStatus('saved');
    return gist;
  },

  async listGists() {
    const list = await gh.listGists(this.token);
    const file = store.cloud.fileName;
    return list
      .map((g) => ({
        id: g.id,
        description: g.description || '',
        updatedAt: g.updated_at,
        public: !!g.public,
        files: Object.keys(g.files || {}),
        hasVault: !!(g.files && g.files[file]),
      }))
      .sort((a, b) => (Number(b.hasVault) - Number(a.hasVault)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },

  async useGist(input) {
    const id = extractGistId(input);
    if (!id) throw new Error('ID / URL Gist tidak valid.');
    const gist = await gh.getGist(this.token, id);
    const c = store.cloud;
    Object.assign(c, { connected: true, gistId: gist.id, login: this.user, lastRemoteUpdatedAt: null, lastError: null });
    if (!gist.files || !gist.files[c.fileName]) c.pendingChanges = true;
    store.saveCloud();
    await this.check();
  },

  disconnect() {
    clearTimeout(this._timer);
    clearTimeout(this._retry);
    this._timer = null;
    clearToken();
    store.cloud = defaultCloud();
    store.cloud.pendingChanges = true;
    store.saveCloud();
    this.forgetPassphrase();
    this.user = null;
    this.setStatus('disabled');
  },

  // ---------- enkripsi ----------
  setPassphrase(pass, remember) {
    this.passphrase = pass;
    try {
      if (remember) localStorage.setItem(PASS_KEY, pass);
      else localStorage.removeItem(PASS_KEY);
    } catch { /* abaikan */ }
  },
  forgetPassphrase() {
    this.passphrase = null;
    try { localStorage.removeItem(PASS_KEY); } catch { /* abaikan */ }
  },
  enableEncryption(pass, remember) {
    this.setPassphrase(pass, remember);
    if (this.status === 'locked') this.setStatus('pending');
    store.setSyncSetting('encryptionEnabled', true);
  },
  changePassphrase(pass, remember) {
    this.setPassphrase(pass, remember);
    if (this.status === 'locked') this.setStatus('pending');
    store.commit('passphrase'); // paksa backup baru terenkripsi dengan passphrase baru
  },
  disableEncryption() {
    if (this.status === 'locked') this.setStatus('pending');
    store.setSyncSetting('encryptionEnabled', false);
  },

  // ---------- riwayat ----------
  async listHistory() {
    return gh.listCommits(this.token, store.cloud.gistId);
  },
  async loadRevisionText(sha) {
    const g = await gh.getRevision(this.token, store.cloud.gistId, sha);
    const text = await gh.readFile(g, store.cloud.fileName);
    if (text == null) throw new Error('Versi ini tidak berisi file backup.');
    return text;
  },
  async loadRevision(sha) {
    return parseEnvelope(await this.loadRevisionText(sha));
  },
};
