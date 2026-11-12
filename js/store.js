// State aplikasi + penyimpanan lokal (LocalStorage).
//
// Tiga bagian state:
//   data  → playlist & library video. INILAH yang di-sync ke GitHub Gist.
//   cloud → info koneksi Gist (gistId, status sync). Lokal saja.
//   ui    → view aktif, mode sort, tema. Lokal saja.
// Token GitHub & passphrase disimpan di key terpisah dan TIDAK pernah ikut backup.

import { recommend } from './recommend.js';
import { LANG } from './i18n.js';
const MAIN_NAME = () => (LANG === 'en' ? 'Main playlist' : 'Playlist Utama');
import { uid, nowISO } from './utils.js';
import { isValidId } from './parser.js';

const STATE_KEY = 'mytube_vault_state_v1';
const SNAPSHOT_KEY = 'mytube_vault_snapshot_v1';
const TOKEN_KEY = 'mytube_vault_gh_token';
export const PASS_KEY = 'mytube_vault_passphrase';
export const VAULT_FILE = 'mytube-vault.json';
const SMART_VIEWS = ['all', 'mix', 'favorites', 'unwatched', 'history'];
const POS_KEY = 'mytube_vault_positions_v1';

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
    player: { shuffle: false, repeat: 'all', autoNext: true, autoMarkWatched: true },
    sync: { autoSync: true, debounceMs: 2000, encryptionEnabled: false },
  };
}

function newPlaylist(name, t = nowISO()) {
  return { id: uid('pl'), name, createdAt: t, updatedAt: t, items: [] };
}

export function createDefaultData() {
  const t = nowISO();
  return { version: 1, updatedAt: t, videos: {}, playlists: [newPlaylist(MAIN_NAME(), t)], settings: defaultSettings() };
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
export const tagKey = (t) => String(t).trim().replace(/^#+/, '').toLocaleLowerCase('id');
/** Rapikan daftar tag: buang #, spasi berlebih, kosong, duplikat (tanpa beda huruf besar/kecil). */
export function cleanTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 30);
    const k = name.toLocaleLowerCase('id');
    if (!name || seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= 30) break;
  }
  return out;
}
const iso = (v, fallback) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);

/**
 * Titik potong lagu: [mulai, akhir] dalam detik utuh; 0 = sisi itu tidak dipotong.
 * Hasil null bila tidak ada potongan sama sekali (field `trim` lalu tidak disimpan).
 */
export function normTrim(raw, duration = 0) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const n = (x) => (Number.isFinite(x) && x > 0 ? Math.min(86400, Math.round(x)) : 0);
  let start = n(raw[0]);
  let end = n(raw[1]);
  if (duration > 0) {
    if (start >= duration - 1) start = 0;   // mulai di luar lagu → abaikan
    if (end >= duration) end = 0;            // akhir = akhir lagu → sama saja tidak dipotong
  }
  if (end && end <= start + 1) end = 0;
  return start || end ? [start, end] : null;
}

function normVideo(id, v = {}, t = nowISO()) {
  const trim = normTrim(v.trim);
  return {
    youtubeId: id,
    title: typeof v.title === 'string' && v.title.trim() ? v.title.trim().slice(0, 300) : null,
    channel: str(v.channel ?? v.author, 200),
    duration: Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null,
    favorite: !!v.favorite,
    watched: !!v.watched,
    tags: cleanTags(Array.isArray(v.tags) ? v.tags : []),
    playCount: Number.isFinite(v.playCount) && v.playCount > 0 ? Math.floor(v.playCount) : 0,
    lastPlayedAt: typeof v.lastPlayedAt === 'string' && !Number.isNaN(Date.parse(v.lastPlayedAt)) ? v.lastPlayedAt : null,
    unavailable: v.unavailable === 'gone' || v.unavailable === 'embed' ? v.unavailable : null,
    firstAddedAt: iso(v.firstAddedAt ?? v.addedAt, t),
    updatedAt: iso(v.updatedAt, t),
    ...(trim ? { trim } : {}),
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
  if (!d.playlists.length) d.playlists.push(newPlaylist(MAIN_NAME(), t));
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
  /** Simpan setelan tampilan tanpa memicu render ulang (dipakai Lobby: slider, pilihan suasana). */
  saveUiQuiet() {
    clearTimeout(this._uiTimer);
    this._uiTimer = setTimeout(() => { this._uiTimer = 0; this.persist(); }, 300);
    if (!this._uiFlush && typeof window !== 'undefined') {
      this._uiFlush = true;
      window.addEventListener('pagehide', () => { if (this._uiTimer) { clearTimeout(this._uiTimer); this._uiTimer = 0; this.persist(); } });
    }
  },
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
      cur.playCount = Math.max(cur.playCount || 0, v.playCount || 0);
      cur.tags = cleanTags([...cur.tags, ...v.tags]);
      if (v.lastPlayedAt && (!cur.lastPlayedAt || v.lastPlayedAt > cur.lastPlayedAt)) cur.lastPlayedAt = v.lastPlayedAt;
      if (!cur.trim && v.trim) cur.trim = v.trim;
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
    const valid = v.startsWith('pl:') ? !!this.getPlaylist(v.slice(3))
      : v.startsWith('tag:') ? this.allTags().some((t) => t.key === v.slice(4))
        : SMART_VIEWS.includes(v);
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
    if (view === 'mix') {
      return recommend(vids).map((r, index) => ({
        key: `v:${r.video.youtubeId}`, itemId: null, playlistId: null, index,
        youtubeId: r.video.youtubeId, addedAt: r.video.firstAddedAt, video: r.video, reason: r.reason,
      }));
    }
    if (view === 'favorites') vids = vids.filter((v) => v.favorite);
    if (view === 'unwatched') vids = vids.filter((v) => !v.watched);
    if (view.startsWith('tag:')) { const k = view.slice(4); vids = vids.filter((v) => v.tags.some((t) => tagKey(t) === k)); }
    if (view === 'history') {
      // Urutan "manual" untuk riwayat = terakhir diputar paling atas.
      vids = vids.filter((v) => v.lastPlayedAt).sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
    } else {
      vids.sort((a, b) => a.firstAddedAt.localeCompare(b.firstAddedAt));
    }
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
    if (!this.data.playlists.length) this.data.playlists.push(newPlaylist(MAIN_NAME()));
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
  /**
   * Tukar satu video dengan video lain di semua playlist yang memuatnya (posisi & catatan tetap).
   * mode 'replace' = ganti; 'after' = sisipkan video baru tepat setelahnya. Video lama tetap di library.
   */
  replaceInPlaylists(oldId, newId, meta = {}, mode = 'replace') {
    if (!isValidId(newId) || oldId === newId) return 0;
    const t = nowISO();
    if (!this.data.videos[newId]) this.data.videos[newId] = normVideo(newId, { firstAddedAt: t, ...meta }, t);
    else {
      const v = this.data.videos[newId];
      if (!v.title && meta.title) v.title = meta.title;
      if (!v.channel && meta.channel) v.channel = meta.channel;
      if (!v.duration && meta.duration) v.duration = meta.duration;
    }
    let n = 0;
    for (const p of this.data.playlists) {
      const i = p.items.findIndex((it) => it.youtubeId === oldId);
      if (i < 0) continue;
      const has = p.items.some((it) => it.youtubeId === newId);
      if (mode === 'after') {
        if (!has) p.items.splice(i + 1, 0, { itemId: uid('it'), youtubeId: newId, addedAt: t, note: '' });
      } else if (has) {
        p.items.splice(i, 1); // versi audio sudah ada di playlist ini → cukup buang MV-nya
      } else {
        p.items[i] = { ...p.items[i], itemId: uid('it'), youtubeId: newId, addedAt: t };
      }
      p.updatedAt = t;
      n++;
    }
    this.commit('replace-video');
    return n;
  },
  /** Tandai hasil cek kesehatan: map id → 'gone' | 'embed' | null (tersedia). */
  setAvailability(map) {
    let changed = false;
    for (const [id, st] of Object.entries(map)) {
      const v = this.data.videos[id];
      if (!v) continue;
      const val = st === 'gone' || st === 'embed' ? st : null;
      if (v.unavailable !== val) { v.unavailable = val; v.updatedAt = nowISO(); changed = true; }
    }
    if (changed) this.commit('availability');
    return changed;
  },
  updateVideo(id, patch) {
    const v = this.data.videos[id];
    if (!v) return;
    Object.assign(v, patch, { updatedAt: nowISO() });
    this.commit('video-update');
  },
  /** Simpan titik potong awal/akhir lagu (detik). Keduanya 0 → potongan dihapus. Hasil: trim yang tersimpan atau null. */
  setTrim(id, start, end) {
    const v = this.data.videos[id];
    if (!v) return null;
    const trim = normTrim([start, end], v.duration || 0);
    if (trim) v.trim = trim; else delete v.trim;
    v.updatedAt = nowISO();
    this.commit('video-update');
    return trim;
  },
  getTrim(id) {
    const v = this.data.videos[id];
    return (v && v.trim) || null;
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
  // ---------- tag ----------
  /** Semua tag beserta jumlah video, urut abjad. key = bentuk huruf kecil (untuk view & pencocokan). */
  allTags() {
    const m = new Map();
    for (const v of Object.values(this.data.videos)) {
      for (const t of v.tags) {
        const k = tagKey(t);
        const cur = m.get(k);
        if (cur) cur.count++; else m.set(k, { key: k, name: t, count: 1 });
      }
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  },
  setTags(id, tags) {
    const v = this.data.videos[id];
    if (!v) return;
    v.tags = cleanTags(tags);
    v.updatedAt = nowISO();
    this.ensureViewValid();
    this.commit('tags');
  },
  /** Ganti tag banyak video sekaligus (Map id → daftar tag), satu commit. */
  setTagsMany(map) {
    let n = 0;
    const t = nowISO();
    for (const [id, tags] of map) {
      const v = this.data.videos[id];
      if (!v) continue;
      v.tags = cleanTags(tags);
      v.updatedAt = t;
      n++;
    }
    if (n) { this.ensureViewValid(); this.commit('tags-many'); }
    return n;
  },
  addTagMany(ids, tag) {
    const name = cleanTags([tag])[0];
    if (!name) return 0;
    const k = tagKey(name);
    let n = 0;
    for (const id of ids) {
      const v = this.data.videos[id];
      if (v && !v.tags.some((t) => tagKey(t) === k)) { v.tags = cleanTags([...v.tags, name]); v.updatedAt = nowISO(); n++; }
    }
    if (n) this.commit('tags-many');
    return n;
  },
  removeTagMany(ids, tag) {
    const k = tagKey(tag);
    let n = 0;
    for (const id of ids) {
      const v = this.data.videos[id];
      if (v && v.tags.some((t) => tagKey(t) === k)) { v.tags = v.tags.filter((t) => tagKey(t) !== k); v.updatedAt = nowISO(); n++; }
    }
    if (n) { this.ensureViewValid(); this.commit('tags-many'); }
    return n;
  },
  deleteTag(tag) {
    return this.removeTagMany(Object.keys(this.data.videos), tag);
  },

  /** Catat pemutaran (untuk Riwayat). */
  recordPlay(id) {
    const v = this.data.videos[id];
    if (!v) return;
    v.playCount = (v.playCount || 0) + 1;
    v.lastPlayedAt = nowISO();
    this.commit('play');
  },
  clearHistory() {
    for (const v of Object.values(this.data.videos)) { v.lastPlayedAt = null; v.playCount = 0; }
    this.commit('history-clear');
  },

  // ---------- operasi banyak item sekaligus ----------
  /** Hapus beberapa item dari playlist. Mengembalikan data untuk Urungkan. */
  removeItems(playlistId, itemIds) {
    const p = this.getPlaylist(playlistId);
    if (!p) return [];
    const ids = new Set(itemIds);
    const removed = [];
    p.items.forEach((it, index) => { if (ids.has(it.itemId)) removed.push({ item: it, index }); });
    if (!removed.length) return [];
    p.items = p.items.filter((it) => !ids.has(it.itemId));
    p.updatedAt = nowISO();
    this.commit('remove-many');
    return removed;
  },
  restoreItems(playlistId, removed) {
    const p = this.getPlaylist(playlistId);
    if (!p || !removed.length) return;
    for (const { item, index } of [...removed].sort((a, b) => a.index - b.index)) {
      if (p.items.some((i) => i.youtubeId === item.youtubeId)) continue;
      p.items.splice(Math.min(index, p.items.length), 0, item);
    }
    p.updatedAt = nowISO();
    this.commit('restore-many');
  },
  setFavoriteMany(ids, value) {
    const t = nowISO();
    let n = 0;
    for (const id of ids) {
      const v = this.data.videos[id];
      if (v && v.favorite !== value) { v.favorite = value; v.updatedAt = t; n++; }
    }
    if (n) this.commit('favorite-many');
    return n;
  },
  setWatchedMany(ids, value) {
    const t = nowISO();
    let n = 0;
    for (const id of ids) {
      const v = this.data.videos[id];
      if (v && v.watched !== value) { v.watched = value; v.updatedAt = t; n++; }
    }
    if (n) this.commit('watched-many');
    return n;
  },
  deleteVideos(ids) {
    const set = new Set(ids);
    for (const id of set) delete this.data.videos[id];
    for (const p of this.data.playlists) {
      const n = p.items.length;
      p.items = p.items.filter((i) => !set.has(i.youtubeId));
      if (p.items.length !== n) p.updatedAt = nowISO();
    }
    this.commit('delete-many');
  },
  moveItemsToPlaylist(fromId, itemIds, toId) {
    const from = this.getPlaylist(fromId);
    const to = this.getPlaylist(toId);
    if (!from || !to || from === to) return 0;
    const ids = new Set(itemIds);
    const have = new Set(to.items.map((i) => i.youtubeId));
    const t = nowISO();
    let moved = 0;
    for (const it of from.items) {
      if (!ids.has(it.itemId)) continue;
      moved++;
      if (!have.has(it.youtubeId)) { to.items.push({ ...it, itemId: uid('it'), addedAt: t }); have.add(it.youtubeId); }
    }
    from.items = from.items.filter((i) => !ids.has(i.itemId));
    from.updatedAt = t;
    to.updatedAt = t;
    this.commit('move-many');
    return moved;
  },

  // ---------- kelola playlist ----------
  duplicatePlaylist(id) {
    const p = this.getPlaylist(id);
    if (!p) return null;
    const t = nowISO();
    const copy = { id: uid('pl'), name: `${p.name} (salinan)`.slice(0, 100), createdAt: t, updatedAt: t, items: p.items.map((it) => ({ ...it, itemId: uid('it') })) };
    this.data.playlists.splice(this.data.playlists.indexOf(p) + 1, 0, copy);
    this.ui.view = `pl:${copy.id}`;
    this.commit('playlist-duplicate');
    return copy;
  },
  movePlaylist(id, delta) {
    const arr = this.data.playlists;
    const i = arr.findIndex((p) => p.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.commit('playlist-reorder');
  },

  // ---------- posisi terakhir (hanya di perangkat ini, tidak disinkronkan) ----------
  getPosition(id) {
    try { const m = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); return m[id] ? m[id].t : 0; } catch { return 0; }
  },
  setPosition(id, seconds) {
    try {
      const m = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      if (seconds > 0) m[id] = { t: Math.floor(seconds), at: Date.now() }; else delete m[id];
      const keys = Object.keys(m);
      if (keys.length > 300) keys.sort((a, b) => m[a].at - m[b].at).slice(0, keys.length - 300).forEach((k) => delete m[k]);
      localStorage.setItem(POS_KEY, JSON.stringify(m));
    } catch { /* abaikan */ }
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
  /**
   * Pindahkan beberapa item sekaligus (urutan di antara mereka tetap) sehingga blok itu dimulai di
   * posisi `to` (0 = paling atas) pada urutan akhir. Mengembalikan urutan lama (untuk Urungkan) atau null.
   */
  moveItems(playlistId, itemIds, to) {
    const p = this.getPlaylist(playlistId);
    if (!p) return null;
    const ids = new Set(itemIds);
    const block = p.items.filter((it) => ids.has(it.itemId));
    if (!block.length) return null;
    const rest = p.items.filter((it) => !ids.has(it.itemId));
    const at = Math.max(0, Math.min(rest.length, Math.round(to)));
    const next = [...rest.slice(0, at), ...block, ...rest.slice(at)];
    if (next.every((it, i) => it === p.items[i])) return null;
    const before = p.items.map((it) => it.itemId);
    p.items = next;
    p.updatedAt = nowISO();
    this.commit('reorder-many');
    return before;
  },
  /** Geser item terpilih satu langkah (dir -1 naik, +1 turun); item terpilih yang berdempetan ikut bersama. */
  nudgeItems(playlistId, itemIds, dir) {
    const p = this.getPlaylist(playlistId);
    if (!p) return false;
    const ids = new Set(itemIds); const a = [...p.items]; let moved = false;
    const idxs = dir < 0 ? a.map((_, i) => i) : a.map((_, i) => a.length - 1 - i);
    for (const i of idxs) {
      const j = i + dir;
      if (j < 0 || j >= a.length || !ids.has(a[i].itemId) || ids.has(a[j].itemId)) continue;
      [a[i], a[j]] = [a[j], a[i]]; moved = true;
    }
    if (!moved) return false;
    p.items = a; p.updatedAt = nowISO(); this.commit('reorder');
    return true;
  },
  /** Kembalikan urutan item (hasil moveItems) — item yang sudah tidak ada dilewati, yang baru tetap di akhir. */
  setOrder(playlistId, order) {
    const p = this.getPlaylist(playlistId);
    if (!p || !order) return;
    const rank = new Map(order.map((id, i) => [id, i]));
    p.items = [...p.items].sort((a, b) => (rank.get(a.itemId) ?? 1e9) - (rank.get(b.itemId) ?? 1e9));
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
    for (const k of [STATE_KEY, SNAPSHOT_KEY, TOKEN_KEY, PASS_KEY, POS_KEY, 'mytube_vault_stats_v1', 'mytube_vault_lyrics_v1', 'mytube_vault_yt_key']) {
      try { localStorage.removeItem(k); } catch { /* abaikan */ }
    }
  },
};

export const STORAGE_KEY = STATE_KEY;
