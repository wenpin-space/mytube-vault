// State aplikasi + penyimpanan lokal (LocalStorage).
//
// Tiga bagian state:
//   data  → playlist & library video. INILAH yang di-sync ke GitHub Gist.
//   cloud → info koneksi Gist (gistId, status sync). Lokal saja.
//   ui    → view aktif, mode sort, tema. Lokal saja.
// Token GitHub & passphrase disimpan di key terpisah dan TIDAK pernah ikut backup.

import { uid, nowISO } from './utils.js';
import { isValidId } from './parser.js';

const STATE_KEY = 'mytube_vault_state_v1';
const SNAPSHOT_KEY = 'mytube_vault_snapshot_v1';
const TOKEN_KEY = 'mytube_vault_gh_token';
export const PASS_KEY = 'mytube_vault_passphrase';
export const VAULT_FILE = 'mytube-vault.json';
const SMART_VIEWS = ['all', 'favorites', 'unwatched'];

export const SORT_MODES = [
  ['manual', 'Urutan manual'],
  ['addedNewest', 'Terbaru ditambah'],
  ['addedOldest', 'Terlama ditambah'],
  ['titleAZ', 'Judul A–Z'],
  ['titleZA', 'Judul Z–A'],
  ['favoriteFirst', 'Favorit dulu'],
  ['unwatchedFirst', 'Belum ditonton dulu'],
  ['watchedFirst', 'Sudah ditonton dulu'],
];

// ---------- token ----------
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* abaikan */ } }

// ---------- default & normalisasi ----------
export function defaultSettings() {
  return {
    player: { shuffle: false, repeat: 'all', autoNext: true, autoMarkWatched: true, backgroundPlay: true },
    sync: { autoSync: true, debounceMs: 2000, encryptionEnabled: false },
  };
}

function newPlaylist(name, t = nowISO()) {
  return { id: uid('pl'), name, createdAt: t, updatedAt: t, items: [] };
}

export function createDefaultData() {
  const t = nowISO();
  return { version: 1, updatedAt: t, videos: {}, playlists: [newPlaylist('Playlist Utama', t)], settings: defaultSettings() };
}

export function defaultCloud() {
  return {
    provider: 'github_gist',
    connected: false,
    gistId: null,
    fileName: VAULT_FILE,
    login: null,
    lastSyncedAt: null,
    lastRemoteUpdatedAt: null, // updatedAt data yang terakhir kita lihat/kirim di Gist
    pendingChanges: false,
    lastError: null,
  };
}

export function isDataEmpty(d) {
  return !d || (Object.keys(d.videos || {}).length === 0 && (d.playlists || []).every((p) => !(p.items || []).length));
}

const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const iso = (v, fallback) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);

function normVideo(id, v = {}, t = nowISO()) {
  return {
    youtubeId: id,
    title: typeof v.title === 'string' && v.title.trim() ? v.title.trim().slice(0, 300) : null,
    channel: str(v.channel ?? v.author, 200),
    duration: Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null,
    favorite: !!v.favorite,
    watched: !!v.watched,
    tags: Array.isArray(v.tags) ? v.tags.filter((x) => typeof x === 'string').slice(0, 30) : [],
    firstAddedAt: iso(v.firstAddedAt ?? v.addedAt, t),
    updatedAt: iso(v.updatedAt, t),
  };
}

/**
 * Validasi + rapikan data dari mana pun (LocalStorage, Gist, file import).
 * Juga menerima "model sederhana" lama (playlists[].videos[] berisi metadata).
 */
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Format data tidak dikenali.');
  if (!Array.isArray(raw.playlists)) throw new Error('Data tidak berisi daftar playlist.');
  const t = nowISO();
  const s = defaultSettings();
  const rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const settings = {
    player: { ...s.player, ...(rs.player || {}) },
    sync: { ...s.sync, ...(rs.sync || {}) },
  };
  if (!['off', 'one', 'all'].includes(settings.player.repeat)) settings.player.repeat = 'all';
  settings.player.shuffle = !!settings.player.shuffle;
  settings.sync.debounceMs = Math.min(60000, Math.max(500, Number(settings.sync.debounceMs) || 2000));
  settings.sync.encryptionEnabled = !!settings.sync.encryptionEnabled;

  const d = { version: 1, updatedAt: iso(raw.updatedAt, t), videos: {}, playlists: [], settings };

  const srcVideos = raw.videos && typeof raw.videos === 'object' && !Array.isArray(raw.videos) ? raw.videos : {};
  for (const [key, v] of Object.entries(srcVideos)) {
    const id = (v && v.youtubeId) || key;
    if (isValidId(id)) d.videos[id] = normVideo(id, v || {}, t);
  }

  const usedIds = new Set();
  for (const p of raw.playlists) {
    if (!p || typeof p !== 'object') continue;
    let id = typeof p.id === 'string' && p.id ? p.id.slice(0, 80) : uid('pl');
    if (usedIds.has(id)) id = uid('pl');
    usedIds.add(id);
    const pl = {
      id,
      name: str(p.name, 100).trim() || 'Tanpa nama',
      createdAt: iso(p.createdAt, t),
      updatedAt: iso(p.updatedAt, t),
      items: [],
    };
    const src = Array.isArray(p.items) ? p.items : Array.isArray(p.videos) ? p.videos : [];
    const itemIds = new Set();
    const inPlaylist = new Set();
    for (const it of src) {
      if (!it || typeof it !== 'object' || !isValidId(it.youtubeId)) continue;
      const vid = it.youtubeId;
      if (inPlaylist.has(vid)) continue; // satu video sekali per playlist
      inPlaylist.add(vid);
      if (!d.videos[vid]) d.videos[vid] = normVideo(vid, it, t);
      let itemId = typeof it.itemId === 'string' && it.itemId ? it.itemId : uid('it');
      if (itemIds.has(itemId)) itemId = uid('it');
      itemIds.add(itemId);
      pl.items.push({ itemId, youtubeId: vid, addedAt: iso(it.addedAt, t), note: str(it.note, 500) });
    }
    d.playlists.push(pl);
  }
  if (!d.playlists.length) d.playlists.push(newPlaylist('Playlist Utama', t));
  return d;
}

// ---------- store ----------
const listeners = new Set();

export const store = {
  data: null,
  cloud: null,
  ui: null,
  isFresh: false,

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(type, detail) {
    for (const fn of listeners) {
      try { fn(type, detail); } catch (e) { console.error(e); }
    }
  },

  load() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { parsed = null; }
    this.data = null;
    if (parsed && parsed.data) {
      try { this.data = normalizeData(parsed.data); } catch (e) { console.warn('Data lokal rusak, mulai baru', e); }
    }
    this.isFresh = !this.data;
    if (!this.data) this.data = createDefaultData();
    this.cloud = { ...defaultCloud(), ...(parsed && parsed.cloud ? parsed.cloud : {}) };
    this.ui = {
      view: `pl:${this.data.playlists[0].id}`, sort: {}, theme: 'auto', bannerDismissed: false, stageLarge: false,
      ...(parsed && parsed.ui ? parsed.ui : {}),
    };
    if (!this.ui.sort || typeof this.ui.sort !== 'object') this.ui.sort = {};
    this.ensureViewValid();
    if (this.cloud.connected && !getToken()) this.cloud = defaultCloud();
    if (this.isFresh) this.persist();
  },

  persist() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ schemaVersion: 1, data: this.data, cloud: this.cloud, ui: this.ui }));
      return true;
    } catch (e) {
      console.error(e);
      this.emit('storage-error', e);
      return false;
    }
  },

  /** Dipanggil setiap data berubah → simpan lokal → sync manager menjadwalkan push. */
  commit(reason = 'change') {
    this.data.updatedAt = nowISO();
    this.cloud.pendingChanges = true;
    this.persist();
    this.emit('change', { reason });
  },
  saveUi() { this.persist(); this.emit('ui'); },
  saveCloud() { this.persist(); this.emit('cloud'); },

  // ---------- snapshot (jaring pengaman sebelum data ditimpa) ----------
  snapshot() {
    if (isDataEmpty(this.data)) return;
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: nowISO(), data: this.data })); } catch { /* penuh: lewati */ }
  },
  getSnapshot() {
    try {
      const s = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
      if (!s || !s.data) return null;
      return { savedAt: s.savedAt, data: normalizeData(s.data) };
    } catch { return null; }
  },

  /**
   * Ganti seluruh data.
   * fromCloud=true → updatedAt dipertahankan persis (penting untuk deteksi konflik), tidak memicu push.
   * fromCloud=false (restore/import) → dianggap perubahan baru, pengaturan sync perangkat ini dipertahankan.
   */
  replaceData(newData, { fromCloud = false } = {}) {
    const next = normalizeData(newData);
    this.snapshot();
    if (!fromCloud) next.settings.sync = { ...this.data.settings.sync };
    this.data = next;
    this.ensureViewValid();
    if (fromCloud) {
      this.persist();
      this.emit('replace', { fromCloud: true });
    } else {
      this.commit('replace');
    }
  },

  /** Gabungkan backup ke data sekarang tanpa menghapus apa pun. */
  mergeData(raw) {
    const inc = normalizeData(raw);
    this.snapshot();
    let addedVideos = 0;
    let addedItems = 0;
    let addedPlaylists = 0;
    for (const [id, v] of Object.entries(inc.videos)) {
      const cur = this.data.videos[id];
      if (!cur) { this.data.videos[id] = v; addedVideos++; continue; }
      if (!cur.title && v.title) cur.title = v.title;
      if (!cur.channel && v.channel) cur.channel = v.channel;
      if (!cur.duration && v.duration) cur.duration = v.duration;
      cur.favorite = cur.favorite || v.favorite;
      cur.watched = cur.watched || v.watched;
    }
    for (const p of inc.playlists) {
      const target = this.getPlaylist(p.id) ||
        this.data.playlists.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (!target) { this.data.playlists.push(p); addedPlaylists++; addedItems += p.items.length; continue; }
      const have = new Set(target.items.map((i) => i.youtubeId));
      for (const it of p.items) {
        if (have.has(it.youtubeId)) continue;
        target.items.push({ ...it, itemId: uid('it') });
        have.add(it.youtubeId);
        addedItems++;
      }
      target.updatedAt = nowISO();
    }
    this.commit('merge');
    return { addedVideos, addedItems, addedPlaylists };
  },

  // ---------- view ----------
  getPlaylist(id) { return this.data.playlists.find((p) => p.id === id) || null; },
  currentPlaylist() {
    const v = this.ui.view;
    return v.startsWith('pl:') ? this.getPlaylist(v.slice(3)) : null;
  },
  ensureViewValid() {
    const v = (this.ui && this.ui.view) || '';
    const valid = v.startsWith('pl:') ? !!this.getPlaylist(v.slice(3)) : SMART_VIEWS.includes(v);
    if (!valid) this.ui.view = `pl:${this.data.playlists[0].id}`;
  },
  setView(view) { this.ui.view = view; this.ensureViewValid(); this.saveUi(); },

  /** Entri untuk view aktif. index = posisi asli di playlist (untuk reorder manual). */
  viewEntries(view = this.ui.view) {
    if (view.startsWith('pl:')) {
      const p = this.getPlaylist(view.slice(3));
      if (!p) return [];
      return p.items
        .map((it, index) => ({
          key: it.itemId, itemId: it.itemId, playlistId: p.id, index,
          youtubeId: it.youtubeId, addedAt: it.addedAt, video: this.data.videos[it.youtubeId],
        }))
        .filter((e) => e.video);
    }
    let vids = Object.values(this.data.videos);
    if (view === 'favorites') vids = vids.filter((v) => v.favorite);
    if (view === 'unwatched') vids = vids.filter((v) => !v.watched);
    vids.sort((a, b) => a.firstAddedAt.localeCompare(b.firstAddedAt));
    return vids.map((v, index) => ({
      key: `v:${v.youtubeId}`, itemId: null, playlistId: null, index,
      youtubeId: v.youtubeId, addedAt: v.firstAddedAt, video: v,
    }));
  },

  // ---------- playlist ----------
  createPlaylist(name, { switchView = true } = {}) {
    const p = newPlaylist(String(name).trim().slice(0, 100) || 'Playlist baru');
    this.data.playlists.push(p);
    if (switchView) this.ui.view = `pl:${p.id}`;
    this.commit('playlist-create');
    return p;
  },
  renamePlaylist(id, name) {
    const p = this.getPlaylist(id);
    if (!p) return;
    p.name = String(name).trim().slice(0, 100) || p.name;
    p.updatedAt = nowISO();
    this.commit('playlist-rename');
  },
  deletePlaylist(id) {
    this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
    if (!this.data.playlists.length) this.data.playlists.push(newPlaylist('Playlist Utama'));
    this.ensureViewValid();
    this.commit('playlist-delete');
  },
  clearPlaylist(id) {
    const p = this.getPlaylist(id);
    if (!p || !p.items.length) return;
    p.items = [];
    p.updatedAt = nowISO();
    this.commit('playlist-clear');
  },

  // ---------- video & item ----------
  /** Video baru masuk library global; item ditambahkan ke playlist bila belum ada. */
  addVideos(ids, playlistId) {
    const p = this.getPlaylist(playlistId);
    if (!p) return { added: 0, skipped: 0, newIds: [] };
    const t = nowISO();
    const existing = new Set(p.items.map((i) => i.youtubeId));
    let added = 0;
    let skipped = 0;
    const newIds = [];
    for (const id of ids) {
      if (!isValidId(id)) continue;
      if (!this.data.videos[id]) {
        this.data.videos[id] = normVideo(id, { firstAddedAt: t }, t);
        newIds.push(id);
      }
      if (existing.has(id)) { skipped++; continue; }
      existing.add(id);
      p.items.push({ itemId: uid('it'), youtubeId: id, addedAt: t, note: '' });
      added++;
    }
    if (added || newIds.length) {
      p.updatedAt = t;
      this.commit('add');
    }
    return { added, skipped, newIds };
  },
  updateVideo(id, patch) {
    const v = this.data.videos[id];
    if (!v) return;
    Object.assign(v, patch, { updatedAt: nowISO() });
    this.commit('video-update');
  },
  toggleFavorite(id) {
    const v = this.data.videos[id];
    if (v) this.updateVideo(id, { favorite: !v.favorite });
  },
  toggleWatched(id) {
    const v = this.data.videos[id];
    if (v) this.updateVideo(id, { watched: !v.watched });
  },
  removeItem(playlistId, itemId) {
    const p = this.getPlaylist(playlistId);
    if (!p) return;
    const before = p.items.length;
    p.items = p.items.filter((i) => i.itemId !== itemId);
    if (p.items.length !== before) {
      p.updatedAt = nowISO();
      this.commit('remove');
    }
  },
  /** Untuk tombol "Urungkan". */
  restoreItem(playlistId, item, index) {
    const p = this.getPlaylist(playlistId);
    if (!p || !item || p.items.some((i) => i.youtubeId === item.youtubeId)) return;
    p.items.splice(Math.min(Math.max(0, index), p.items.length), 0, item);
    p.updatedAt = nowISO();
    this.commit('restore-item');
  },
  /** Hapus total dari library dan semua playlist. */
  deleteVideo(id) {
    delete this.data.videos[id];
    for (const p of this.data.playlists) {
      const n = p.items.length;
      p.items = p.items.filter((i) => i.youtubeId !== id);
      if (p.items.length !== n) p.updatedAt = nowISO();
    }
    this.commit('delete-video');
  },
  /** Urutan manual: mengubah array items (data asli). */
  moveItem(playlistId, from, to) {
    const p = this.getPlaylist(playlistId);
    if (!p) return;
    const n = p.items.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    const [it] = p.items.splice(from, 1);
    p.items.splice(to, 0, it);
    p.updatedAt = nowISO();
    this.commit('reorder');
  },
  moveToPlaylist(fromId, itemId, toId) {
    const from = this.getPlaylist(fromId);
    const to = this.getPlaylist(toId);
    if (!from || !to || from === to) return false;
    const it = from.items.find((i) => i.itemId === itemId);
    if (!it) return false;
    from.items = from.items.filter((i) => i.itemId !== itemId);
    if (!to.items.some((i) => i.youtubeId === it.youtubeId)) {
      to.items.push({ ...it, itemId: uid('it'), addedAt: nowISO() });
    }
    from.updatedAt = nowISO();
    to.updatedAt = nowISO();
    this.commit('move');
    return true;
  },

  // ---------- pengaturan ----------
  setPlayerSetting(key, value) {
    if (this.data.settings.player[key] === value) return;
    this.data.settings.player[key] = value;
    this.commit('settings');
  },
  setSyncSetting(key, value) {
    if (this.data.settings.sync[key] === value) return;
    this.data.settings.sync[key] = value;
    this.commit('settings');
  },

  storageSize() {
    try { return new Blob([localStorage.getItem(STATE_KEY) || '']).size; } catch { return 0; }
  },
  clearAll() {
    for (const k of [STATE_KEY, SNAPSHOT_KEY, TOKEN_KEY, PASS_KEY]) {
      try { localStorage.removeItem(k); } catch { /* abaikan */ }
    }
  },
};

export const STORAGE_KEY = STATE_KEY;
