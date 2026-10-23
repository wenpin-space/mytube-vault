// Unit test logika inti (tanpa browser): node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

// ---- shim lingkungan browser minimal ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
globalThis.window = globalThis;
globalThis.window.addEventListener = () => {};
globalThis.document = { addEventListener: () => {}, visibilityState: 'visible' };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const { extractYouTubeId, parseMany } = await import('../js/parser.js');
const { store, normalizeData, setToken } = await import('../js/store.js');
const { buildEnvelope, parseEnvelope, openEnvelope } = await import('../js/envelope.js');
const { sync, extractGistId } = await import('../js/sync.js');
const { sortEntries } = await import('../js/utils.js');

const ID = 'dQw4w9WgXcQ';

test('parser: semua bentuk link', () => {
  const ok = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://music.youtube.com/watch?v=${ID}&feature=share`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
  ];
  for (const u of ok) assert.equal(extractYouTubeId(u), ID, u);
  const bad = ['https://google.com/watch?v=' + ID, 'https://www.youtube.com/playlist?list=PL1', 'hello', '', 'https://youtu.be/short', 'https://evil-youtube.com/watch?v=' + ID];
  for (const u of bad) assert.equal(extractYouTubeId(u), null, u);
  assert.equal(extractYouTubeId(ID), null);
  assert.equal(extractYouTubeId(ID, { allowBareId: true }), ID);
});

test('parser: multi-paste membuang duplikat & menghitung yang tidak valid', () => {
  const r = parseMany(`https://youtu.be/${ID}\nhttps://www.youtube.com/watch?v=${ID}, https://youtu.be/aaaaaaaaaaa https://google.com/x catatan`);
  assert.deepEqual(r.valid, [ID, 'aaaaaaaaaaa']);
  assert.equal(r.duplicates, 1);
  assert.equal(r.invalid.length, 1);
});

test('normalizeData: migrasi model sederhana lama', () => {
  const d = normalizeData({
    playlists: [{ id: 'p1', name: 'Musik', videos: [
      { id: 'video_001', youtubeId: ID, title: 'Lagu A', favorite: true, addedAt: '2026-06-15T10:00:00Z' },
      { id: 'video_002', youtubeId: 'bad' },
      { id: 'video_003', youtubeId: ID },
    ] }],
  });
  assert.equal(d.playlists[0].items.length, 1, 'duplikat & ID buruk dibuang');
  assert.equal(d.videos[ID].title, 'Lagu A');
  assert.equal(d.videos[ID].favorite, true);
  assert.throws(() => normalizeData({ foo: 1 }));
});

test('store: tambah, duplikat, urutan manual, pindah, undo', () => {
  mem.clear();
  store.load();
  const pid = store.data.playlists[0].id;
  let r = store.addVideos([ID, 'aaaaaaaaaaa', 'bbbbbbbbbbb'], pid);
  assert.equal(r.added, 3);
  r = store.addVideos([ID], pid);
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 1);
  store.moveItem(pid, 2, 0);
  assert.deepEqual(store.getPlaylist(pid).items.map((i) => i.youtubeId), ['bbbbbbbbbbb', ID, 'aaaaaaaaaaa']);
  // sort otomatis tidak mengubah data
  store.updateVideo(ID, { title: 'Zeta' });
  store.updateVideo('aaaaaaaaaaa', { title: 'Alpha' });
  const sorted = sortEntries(store.viewEntries(), 'titleAZ').map((e) => e.youtubeId);
  assert.deepEqual(sorted.slice(0, 2), ['aaaaaaaaaaa', ID]);
  assert.equal(store.getPlaylist(pid).items[0].youtubeId, 'bbbbbbbbbbb');
  // pindah ke playlist lain
  const p2 = store.createPlaylist('Belajar');
  const it = store.getPlaylist(pid).items[0];
  store.moveToPlaylist(pid, it.itemId, p2.id);
  assert.equal(store.getPlaylist(pid).items.length, 2);
  assert.equal(store.getPlaylist(p2.id).items[0].youtubeId, 'bbbbbbbbbbb');
  // hapus + urungkan
  const removed = store.getPlaylist(pid).items[0];
  store.removeItem(pid, removed.itemId);
  store.restoreItem(pid, removed, 0);
  assert.equal(store.getPlaylist(pid).items[0].itemId, removed.itemId);
  // persist & load ulang
  store.load();
  assert.equal(store.data.playlists.length, 2);
  assert.equal(Object.keys(store.data.videos).length, 3);
});

test('envelope: plain & terenkripsi, passphrase salah ditolak', async () => {
  const data = normalizeData({ updatedAt: '2026-10-01T00:00:00.000Z', playlists: [{ name: 'X', items: [{ youtubeId: ID }] }] });
  const plain = parseEnvelope(await buildEnvelope(data));
  assert.equal(plain.encrypted, false);
  assert.equal(plain.updatedAt, data.updatedAt);
  const encText = await buildEnvelope(data, 'rahasia-banget');
  assert.ok(!encText.includes(ID), 'isi tidak boleh terbaca');
  const enc = parseEnvelope(encText);
  assert.equal(enc.updatedAt, data.updatedAt, 'updatedAt tetap terbaca untuk deteksi konflik');
  const opened = await openEnvelope(enc, 'rahasia-banget');
  assert.equal(opened.playlists[0].items[0].youtubeId, ID);
  await assert.rejects(openEnvelope(enc, 'salah'), (e) => e.code === 'WRONG_PASSPHRASE');
  assert.throws(() => parseEnvelope('{"hello":1}'));
});

test('extractGistId', () => {
  assert.equal(extractGistId('https://gist.github.com/vinz/0123456789abcdef0123456789abcdef'), '0123456789abcdef0123456789abcdef');
  assert.equal(extractGistId('aa5a315d61ae9438b18d'), 'aa5a315d61ae9438b18d');
  assert.equal(extractGistId('bukan-id'), null);
});

// ---- Sync dengan GitHub API tiruan ----
function fakeGitHub() {
  const gist = { id: 'abcdef0123456789abcd', files: {}, history: [] };
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${url.replace('https://api.github.com', '')}`);
    const json = (status, body, headers = {}) => ({
      ok: status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body,
    });
    if (url.endsWith('/user')) return json(200, { login: 'vinz' }, { 'x-oauth-scopes': 'gist' });
    if (url.includes(`/gists/${gist.id}`) && method === 'GET') {
      return json(200, { id: gist.id, files: Object.fromEntries(Object.entries(gist.files).map(([k, v]) => [k, { content: v, truncated: false }])) });
    }
    if (url.includes(`/gists/${gist.id}`) && method === 'PATCH') {
      const body = JSON.parse(opts.body);
      for (const [k, v] of Object.entries(body.files)) gist.files[k] = v.content;
      gist.history.push(Date.now());
      return json(200, { id: gist.id });
    }
    if (url.endsWith('/gists') && method === 'POST') {
      const body = JSON.parse(opts.body);
      for (const [k, v] of Object.entries(body.files)) gist.files[k] = v.content;
      return json(201, { id: gist.id });
    }
    return json(404, { message: 'Not Found' });
  };
  return { gist, calls };
}

test('sync: buat gist, push, perangkat lain mengubah → auto-pull, konflik → dialog', async () => {
  mem.clear();
  store.load();
  const gh = fakeGitHub();
  sync.setStatus = function setStatus(s, m = '') { this.status = s; this.message = m; };
  await sync.connectToken('ghp_test');
  store.addVideos([ID], store.data.playlists[0].id);
  await sync.createGist();
  assert.equal(store.cloud.connected, true);
  assert.equal(store.cloud.pendingChanges, false);
  const env0 = parseEnvelope(gh.gist.files['mytube-vault.json']);
  assert.equal(env0.updatedAt, store.data.updatedAt);

  // perubahan lokal → push
  store.addVideos(['aaaaaaaaaaa'], store.data.playlists[0].id);
  await sync.push();
  assert.equal(sync.status, 'saved');
  assert.equal(Object.keys(parseEnvelope(gh.gist.files['mytube-vault.json']).data.videos).length, 2);

  // perangkat lain menulis versi baru, lokal tidak punya perubahan → ambil cloud
  const other = JSON.parse(JSON.stringify(store.data));
  other.videos.bbbbbbbbbbb = { youtubeId: 'bbbbbbbbbbb' };
  other.playlists[0].items.push({ itemId: 'x1', youtubeId: 'bbbbbbbbbbb' });
  other.updatedAt = '2030-01-01T00:00:00.000Z';
  gh.gist.files['mytube-vault.json'] = await buildEnvelope(normalizeData(other));
  await sync.check();
  assert.equal(Object.keys(store.data.videos).length, 3, 'data cloud diterapkan');
  assert.equal(store.cloud.lastRemoteUpdatedAt, '2030-01-01T00:00:00.000Z');

  // konflik: lokal berubah DAN cloud berubah
  store.addVideos(['ccccccccccc'], store.data.playlists[0].id);
  other.updatedAt = '2030-02-01T00:00:00.000Z';
  gh.gist.files['mytube-vault.json'] = await buildEnvelope(normalizeData(other));
  let asked = false;
  sync.resolveConflict = async () => { asked = true; return 'local'; };
  await sync.push();
  assert.equal(asked, true, 'user ditanya');
  const after = parseEnvelope(gh.gist.files['mytube-vault.json']);
  assert.ok(after.data.videos.ccccccccccc, 'versi lokal yang dipilih terkirim');
  assert.equal(sync.status, 'saved');

  // enkripsi
  sync.passphrase = null;
  sync.enableEncryption('passphrase-panjang', false);
  clearTimeout(sync._timer);
  await sync.push();
  const encEnv = parseEnvelope(gh.gist.files['mytube-vault.json']);
  assert.equal(encEnv.encrypted, true);
  const dec = await openEnvelope(encEnv, 'passphrase-panjang');
  assert.ok(dec.videos.ccccccccccc);

  // offline → pending, tidak ada request
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  const n = gh.calls.length;
  store.addVideos(['ddddddddddd'], store.data.playlists[0].id);
  await sync.push();
  assert.equal(sync.status, 'offline');
  assert.equal(gh.calls.length, n);
  assert.equal(store.cloud.pendingChanges, true);
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  await sync.check();
  assert.equal(store.cloud.pendingChanges, false);
  const final = await openEnvelope(parseEnvelope(gh.gist.files['mytube-vault.json']), 'passphrase-panjang');
  assert.ok(final.videos.ddddddddddd, 'perubahan offline terkirim saat online');
  clearTimeout(sync._timer);
  clearTimeout(sync._retry);
});

test('sync: token tanpa scope gist ditolak', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: (k) => (k === 'x-oauth-scopes' ? 'repo' : null) }, json: async () => ({ login: 'x' }) });
  await assert.rejects(sync.connectToken('ghp_x'), /scope "gist"/);
  setToken('');
});

test('riwayat, operasi banyak item, kelola playlist, posisi', async () => {
  const tick = () => new Promise((r) => setTimeout(r, 3));
  mem.clear();
  store.load();
  const A = 'aaaaaaaaaa1', B = 'bbbbbbbbbb2', C = 'cccccccccc3';
  const main = store.data.playlists[0];
  store.addVideos([A, B, C], main.id);

  // riwayat
  store.recordPlay(B); await tick();
  store.recordPlay(A); await tick();
  store.recordPlay(B);
  let h = store.viewEntries('history');
  assert.deepEqual(h.map((e) => e.youtubeId), [B, A], 'terbaru diputar di atas');
  assert.equal(store.data.videos[B].playCount, 2);
  // riwayat ikut tersimpan & lolos normalisasi (dipakai sync/import)
  const n = normalizeData(JSON.parse(JSON.stringify(store.data)));
  assert.equal(n.videos[B].playCount, 2);
  assert.ok(n.videos[B].lastPlayedAt);
  store.clearHistory();
  assert.equal(store.viewEntries('history').length, 0);

  // hapus banyak + urungkan (urutan kembali seperti semula)
  const items = main.items.map((i) => i.itemId);
  const removed = store.removeItems(main.id, [items[0], items[2]]);
  assert.deepEqual(main.items.map((i) => i.youtubeId), [B]);
  store.restoreItems(main.id, removed);
  assert.deepEqual(main.items.map((i) => i.youtubeId), [A, B, C]);

  // favorit banyak
  assert.equal(store.setFavoriteMany([A, C], true), 2);
  assert.equal(store.viewEntries('favorites').length, 2);

  // pindah banyak ke playlist lain
  const other = store.createPlaylist('Lain', { switchView: false });
  store.addVideos([C], other.id);
  const moved = store.moveItemsToPlaylist(main.id, main.items.filter((i) => i.youtubeId !== B).map((i) => i.itemId), other.id);
  assert.equal(moved, 2);
  assert.deepEqual(main.items.map((i) => i.youtubeId), [B]);
  assert.deepEqual(other.items.map((i) => i.youtubeId), [C, A], 'yang sudah ada tidak dobel');

  // duplikat & urutkan playlist
  const copy = store.duplicatePlaylist(other.id);
  assert.equal(copy.name, 'Lain (salinan)');
  assert.deepEqual(copy.items.map((i) => i.youtubeId), [C, A]);
  assert.notEqual(copy.items[0].itemId, other.items[0].itemId);
  const names = () => store.data.playlists.map((p) => p.name);
  assert.deepEqual(names(), ['Playlist Utama', 'Lain', 'Lain (salinan)']);
  store.movePlaylist(copy.id, -1);
  assert.deepEqual(names(), ['Playlist Utama', 'Lain (salinan)', 'Lain']);
  store.movePlaylist(main.id, -1); // sudah paling atas: tidak berubah
  assert.equal(names()[0], 'Playlist Utama');

  // hapus banyak dari library
  store.deleteVideos([A, C]);
  assert.deepEqual(Object.keys(store.data.videos), [B]);
  assert.ok(store.data.playlists.every((p) => p.items.every((i) => i.youtubeId === B)));

  // posisi terakhir: lokal saja, tidak masuk data yang disinkronkan
  store.setPosition(B, 125.7);
  assert.equal(store.getPosition(B), 125);
  assert.ok(!JSON.stringify(store.data).includes('125'));
  store.setPosition(B, 0);
  assert.equal(store.getPosition(B), 0);
});
