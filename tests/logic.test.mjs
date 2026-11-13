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

test('antrean ikut berubah saat playlist sumber ditambah/dikurangi', async () => {
  const { Player } = await import('../js/player.js');
  const e = (k) => ({ key: k, youtubeId: `${k}`.padEnd(11, 'x') });
  const keysOf = (p) => p.order.map((qi) => p.queue[qi].key);

  // urutan normal: lagu baru di akhir playlist → di akhir antrean
  const p = new Player('x');
  p.loadCurrent = async () => {};
  await p.playList([e('a'), e('b'), e('c')], 1); // sedang memutar b
  p.syncQueue([e('a'), e('b'), e('c'), e('d')]);
  assert.deepEqual(keysOf(p), ['a', 'b', 'c', 'd']);
  assert.equal(p.current.key, 'b');
  // disisipkan di tengah playlist → posisi di antrean mengikuti
  p.syncQueue([e('a'), e('b'), e('x'), e('c'), e('d')]);
  assert.deepEqual(keysOf(p), ['a', 'b', 'x', 'c', 'd']);
  // dihapus dari playlist → keluar dari antrean; lagu yang sedang diputar tidak diganggu
  p.syncQueue([e('a'), e('x'), e('d')]);
  assert.deepEqual(keysOf(p), ['a', 'b', 'x', 'd']);
  assert.equal(p.current.key, 'b');
  // lagu tambahan manual ("Tambah ke antrean") tidak ikut terhapus
  p.addToQueue(e('m'));
  p.syncQueue([e('a'), e('x'), e('d')]);
  assert.ok(keysOf(p).includes('m'));
  // next() sekarang benar-benar sampai ke lagu baru
  p.next(); assert.equal(p.current.key, 'x');

  // acak: lagu baru masuk ke bagian yang belum diputar
  const s = new Player('y');
  s.loadCurrent = async () => {};
  s.shuffle = true;
  await s.playList([e('a'), e('b'), e('c')], 0);
  const cur = s.current.key;
  s.syncQueue([e('a'), e('b'), e('c'), e('n')]);
  const ks = keysOf(s);
  assert.equal(ks.length, 4);
  assert.ok(ks.indexOf('n') > ks.indexOf(cur), 'lagu baru setelah lagu sekarang');
});

test('tag: rapikan, hitung, tambah/hapus massal, cari #tag', async () => {
  const { cleanTags } = await import('../js/store.js');
  const { filterEntries } = await import('../js/utils.js');
  assert.deepEqual(cleanTags(['#Lofi', ' lofi ', 'Kerja  malam', '', 5, '##chill']), ['Lofi', 'Kerja malam', 'chill']);
  mem.clear();
  store.load();
  const pl = store.data.playlists[0];
  store.addVideos(['tttttttttt1', 'tttttttttt2', 'tttttttttt3'], pl.id);
  store.setTags('tttttttttt1', ['Lofi', 'kerja']);
  assert.equal(store.addTagMany(['tttttttttt2', 'tttttttttt3'], '#lofi'), 2);
  const tags = store.allTags();
  assert.deepEqual(tags.map((t) => [t.key, t.count]), [['kerja', 1], ['lofi', 3]]);
  store.setView('tag:lofi');
  assert.equal(store.viewEntries().length, 3);
  assert.equal(filterEntries(store.viewEntries('all'), '#ker').length, 1);
  assert.equal(filterEntries(store.viewEntries('all'), 'lofi').length, 3, 'tag ikut dicari tanpa #');
  store.deleteTag('LOFI');
  assert.deepEqual(store.allTags().map((t) => t.key), ['kerja']);
  assert.ok(!store.ui.view.startsWith('tag:lofi'), 'view tag yang hilang kembali ke playlist');
  // tag ikut normalisasi & merge
  const n = normalizeData(JSON.parse(JSON.stringify(store.data)));
  assert.deepEqual(n.videos.tttttttttt1.tags, ['kerja']);
});

test('parser: ID playlist YouTube', async () => {
  const { extractPlaylistId } = await import('../js/parser.js');
  assert.equal(extractPlaylistId('https://www.youtube.com/playlist?list=PLabcdefghij123'), 'PLabcdefghij123');
  assert.equal(extractPlaylistId(`https://youtube.com/watch?v=${ID}&list=PLxyzxyzxyz99`), 'PLxyzxyzxyz99');
  assert.equal(extractPlaylistId('music.youtube.com/playlist?list=OLAK5uy_abcdefghijk'), 'OLAK5uy_abcdefghijk');
  assert.equal(extractPlaylistId(`https://youtu.be/${ID}`), null);
  assert.equal(extractPlaylistId('https://evil.com/playlist?list=PLabcdefghij123'), null);
});

test('link berbagi: encode → decode utuh, input jahat ditolak', async () => {
  const { buildSharePayload, encodeShare, decodeShare } = await import('../js/share.js');
  const pl = { name: 'Lagu Fokus', items: [{ youtubeId: ID }, { youtubeId: 'aaaaaaaaaa1' }] };
  const videos = { [ID]: { title: 'Never Gonna', channel: 'Rick' }, aaaaaaaaaa1: { title: '心太软', channel: 'X' } };
  const code = await encodeShare(buildSharePayload(pl, videos));
  assert.equal(code[0], 'z', 'terkompresi');
  const back = await decodeShare(code);
  assert.equal(back.name, 'Lagu Fokus');
  assert.deepEqual(back.videos.map((v) => [v.id, v.title]), [[ID, 'Never Gonna'], ['aaaaaaaaaa1', '心太软']]);
  const evil = 'j' + Buffer.from(JSON.stringify({ v: 1, n: '<b>x</b>', i: ['bad', ID, ID, '"><img>'], t: [{}, 'ok'] })).toString('base64url');
  const d = await decodeShare(evil);
  assert.deepEqual(d.videos.map((v) => v.id), [ID], 'ID tidak valid & duplikat dibuang');
  await assert.rejects(decodeShare('jAAAA'));
  await assert.rejects(decodeShare('x' + code.slice(1)));
});

test('statistik: ringkasan dari data & log', async () => {
  const { computeStats } = await import('../js/stats.js');
  const data = {
    playlists: [{}, {}],
    videos: {
      a: { youtubeId: 'a', title: 'A', channel: 'Ch1', playCount: 5, duration: 200, favorite: true, tags: ['lofi'] },
      b: { youtubeId: 'b', title: 'B', channel: 'Ch1', playCount: 2, duration: 100, tags: [] },
      c: { youtubeId: 'c', title: 'C', channel: 'Ch2', playCount: 0, duration: 0, tags: ['lofi'] },
    },
  };
  const now = new Date(2026, 10, 3, 21, 0, 0);
  const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const raw = { plays: [{ id: 'a', at: new Date(2026, 10, 3, 21, 5).getTime() }, { id: 'a', at: new Date(2026, 10, 2, 21, 30).getTime() }, { id: 'b', at: new Date(2026, 10, 2, 8, 0).getTime() }],
    daily: { [k(now)]: 600, [k(yesterday)]: 1200, '2026-01-01': 9999 } };
  const s = computeStats(data, raw, now);
  assert.equal(s.totalPlays, 7);
  assert.equal(s.week, 1800);
  assert.equal(s.days.length, 14);
  assert.equal(s.days[13].seconds, 600);
  assert.equal(s.peakHour, 21);
  assert.deepEqual(s.top.map((v) => v.youtubeId), ['a', 'b']);
  assert.deepEqual(s.channels, [{ name: 'Ch1', plays: 7 }]);
  assert.equal(s.tags[0].name, 'lofi');
});

test('lirik: bersihkan judul, parse LRC, baris aktif, pilih hasil terbaik', async () => {
  const { cleanTitle, guessArtistTrack, parseLrc, lineAt, bestMatch } = await import('../js/lyrics.js');
  assert.equal(cleanTitle('丫蛋蛋 - 大田後生仔【動態歌詞/Lyrics Video】'), '丫蛋蛋 - 大田後生仔');
  assert.equal(cleanTitle('Rick Astley - Never Gonna Give You Up (Official Music Video)'), 'Rick Astley - Never Gonna Give You Up');
  assert.deepEqual(guessArtistTrack('Mayday五月天 "乾杯Cheers" - Jason Chen x KHS'), { artist: 'Mayday五月天 "乾杯Cheers"', track: 'Jason Chen x KHS' });
  assert.deepEqual(guessArtistTrack('家後 (Cover)', '卡布卡布'), { artist: '卡布卡布', track: '家後' });
  const lines = parseLrc('[ar:x]\n[00:01.50]satu\n[00:05.00][00:20.00]reff\n[00:10.123]dua\n');
  assert.deepEqual(lines.map((l) => [l.t, l.text]), [[1.5, 'satu'], [5, 'reff'], [10.123, 'dua'], [20, 'reff']]);
  assert.equal(lineAt(lines, 0.5), -1);
  assert.equal(lineAt(lines, 6), 1);
  assert.equal(lineAt(lines, 25), 3);
  const best = bestMatch([{ id: 1, plainLyrics: 'x', duration: 182 }, { id: 2, syncedLyrics: '[00:01]a', duration: 240 }, { id: 3, syncedLyrics: '[00:01]a', duration: 181 }, { id: 4 }], 182);
  assert.equal(best.id, 3);
  assert.equal(bestMatch([{ id: 9 }]), null);
});

test('tambah: banyak link di satu baris (berspasi atau menempel) terbaca semua', () => {
  const r = parseMany('https://youtu.be/dQw4w9WgXcQhttps://youtu.be/9bZkkPVEQC0 https://www.youtube.com/watch?v=kJQP7kiw5Fk');
  assert.deepEqual(r.valid, ['dQw4w9WgXcQ', '9bZkkPVEQC0', 'kJQP7kiw5Fk']);
});

test('pencarian beberapa kata + filter cepat', async () => {
  const { filterEntries, quickFilter } = await import('../js/utils.js');
  const mk = (id, v) => ({ key: id, youtubeId: id, video: { youtubeId: id, title: '', channel: '', tags: [], ...v } });
  const es = [
    mk('a', { title: 'Lofi beats to study', channel: 'Chill', duration: 200, tags: ['lofi'] }),
    mk('b', { title: 'Study with me', channel: 'Lofi Girl', duration: 3600, favorite: true, playCount: 3 }),
    mk('c', { title: 'Rock anthem', channel: 'Band', duration: 250, watched: true }),
  ];
  assert.deepEqual(filterEntries(es, 'study lofi').map((e) => e.key), ['a', 'b']);
  assert.deepEqual(filterEntries(es, 'lofi #lo').map((e) => e.key), ['a']);
  assert.deepEqual(quickFilter(es, 'short').map((e) => e.key), ['a', 'c']);
  assert.deepEqual(quickFilter(es, 'long').map((e) => e.key), ['b']);
  assert.deepEqual(quickFilter(es, 'unwatched').map((e) => e.key), ['a', 'b']);
  assert.deepEqual(quickFilter(es, 'never').map((e) => e.key), ['a', 'c']);
  assert.deepEqual(quickFilter(es, 'fav').map((e) => e.key), ['b']);
  assert.deepEqual(quickFilter(es, 'tag:lofi').map((e) => e.key), ['a']);
  assert.equal(quickFilter(es, '').length, 3);
});

test('antrean: geser urutan, hapus & kosongkan tidak dimasukkan lagi oleh sync', async () => {
  const { Player } = await import('../js/player.js');
  const e = (k) => ({ key: k, youtubeId: `${k}`.padEnd(11, 'x') });
  const keysOf = (p) => p.order.map((qi) => p.queue[qi].key);
  const p = new Player('z');
  p.loadCurrent = async () => {};
  await p.playList([e('a'), e('b'), e('c'), e('d')], 0);
  p.moveInQueue(3, 1);
  assert.deepEqual(keysOf(p), ['a', 'd', 'b', 'c']);
  p.moveInQueue(0, 2); // lagu sekarang tidak boleh dipindah
  assert.deepEqual(keysOf(p), ['a', 'd', 'b', 'c']);
  p.removeAt(2); // hapus b
  p.syncQueue([e('a'), e('b'), e('c'), e('d'), e('n')]);
  assert.deepEqual(keysOf(p), ['a', 'd', 'n', 'c'], 'b tidak kembali, lagu baru n masuk setelah d');
  p.clearUpcoming();
  p.syncQueue([e('a'), e('b'), e('c'), e('d'), e('n'), e('z')]);
  assert.deepEqual(keysOf(p), ['a', 'z'], 'hanya lagu yang benar-benar baru');
});

test('command palette: skor fuzzy', async () => {
  const { fuzzyScore } = await import('../js/palette.js');
  assert.ok(fuzzyScore('Playlist Utama', 'utama') > fuzzyScore('Playlist Utama', 'pltm'));
  assert.ok(fuzzyScore('Playlist Utama', 'pltm') > 0);
  assert.equal(fuzzyScore('Favorit', 'xyz'), -1);
  assert.ok(fuzzyScore('Musik fokus kerja', 'kerja fokus') > 0);
  assert.ok(fuzzyScore('Statistik', 'stat') > fuzzyScore('Antrean statis', 'stat'));
});

test('warna lagu: ambil warna hidup, abaikan hitam/putih', async () => {
  const { pickColor, toAccent } = await import('../js/tint.js');
  const px = [];
  for (let i = 0; i < 60; i++) px.push(0, 0, 0, 255); // bar hitam
  for (let i = 0; i < 20; i++) px.push(250, 250, 250, 255); // putih
  for (let i = 0; i < 20; i++) px.push(30, 120, 220, 255); // biru
  const [r, g, b] = pickColor(px);
  assert.ok(b > r && b > g, 'biru dominan');
  const [ar, ag, ab] = toAccent([30, 120, 220], true);
  assert.ok(ab > ar && ab > ag);
  const lum = (ar + ag + ab) / 3;
  assert.ok(lum > 110, 'cukup terang untuk tema gelap');
  assert.deepEqual(pickColor([0, 0, 0, 255]), [0, 0, 0]);
});

test('lirik: geser waktu (offset) dari ketukan baris', async () => {
  const { parseLrc, lineAt, offsetFromTap } = await import('../js/lyrics.js');
  const lines = parseLrc('[00:05.00]satu\n[00:10.00]dua\n[00:15.00]tiga');
  // MV punya intro 8 detik: baris "dua" (10 dtk di audio) terdengar di detik 18 video
  const off = offsetFromTap(18.04, 10);
  assert.equal(off, 8);
  assert.equal(lines[lineAt(lines, 18 - off)].text, 'dua');
  assert.equal(lineAt(lines, 12 - off), -1, 'sebelum baris pertama selama intro');
  assert.equal(offsetFromTap(3, 5), -2);
});

test('versi audio: durasi ISO, ranking Topic/Official Audio, tukar di playlist', async () => {
  const { parseIsoDuration, rankAudioCandidates } = await import('../js/sources.js');
  assert.equal(parseIsoDuration('PT3M5S'), 185);
  assert.equal(parseIsoDuration('PT1H2M'), 3720);
  assert.equal(parseIsoDuration('xx'), 0);
  const items = [
    { id: 'MVvideo0001', title: 'JENNIE - Less than a Lover (Official Video)', channel: 'JennieRubyJaneVEVO', duration: 218 },
    { id: 'TOPIC000001', title: 'Less than a Lover', channel: 'JENNIE - Topic', duration: 181 },
    { id: 'AUDIO000001', title: 'JENNIE - Less than a Lover (Official Audio)', channel: 'JENNIE', duration: 182 },
    { id: 'SPED0000001', title: 'Less than a Lover (sped up)', channel: 'fan', duration: 150 },
    { id: 'OTHER000001', title: 'Mantra', channel: 'JENNIE - Topic', duration: 136 },
  ];
  const r = rankAudioCandidates(items, { lyricDuration: 181, track: 'Less than a Lover', excludeId: 'MVvideo0001' });
  assert.deepEqual(r.slice(0, 2).map((x) => x.id), ['TOPIC000001', 'AUDIO000001']);
  assert.ok(!r.some((x) => x.id === 'MVvideo0001'), 'video sekarang tidak ikut');
  assert.ok(r.find((x) => x.id === 'SPED0000001').score < 0);
  assert.ok(r.find((x) => x.id === 'OTHER000001').score < r[1].score);

  store.replaceData(normalizeData({ playlists: [
    { id: 'p1', name: 'A', items: [{ youtubeId: 'dQw4w9WgXcQ' }, { youtubeId: '9bZkkPVEQC0' }, { youtubeId: 'kJQP7kiw5Fk' }] },
    { id: 'p2', name: 'B', items: [{ youtubeId: '9bZkkPVEQC0' }, { youtubeId: 'TOPIC000001' }] },
  ], videos: {} }));
  const n = store.replaceInPlaylists('9bZkkPVEQC0', 'TOPIC000001', { title: 'Less than a Lover', channel: 'JENNIE - Topic', duration: 181 });
  assert.equal(n, 2);
  assert.deepEqual(store.getPlaylist('p1').items.map((i) => i.youtubeId), ['dQw4w9WgXcQ', 'TOPIC000001', 'kJQP7kiw5Fk']);
  assert.deepEqual(store.getPlaylist('p2').items.map((i) => i.youtubeId), ['TOPIC000001'], 'tidak dobel');
  assert.ok(store.data.videos['9bZkkPVEQC0'], 'MV tetap di library');
  assert.equal(store.data.videos.TOPIC000001.duration, 181);
  store.replaceInPlaylists('dQw4w9WgXcQ', 'AUDIO000001', {}, 'after');
  assert.deepEqual(store.getPlaylist('p1').items.map((i) => i.youtubeId).slice(0, 2), ['dQw4w9WgXcQ', 'AUDIO000001']);
});

test('v18: rekomendasi, cek kesehatan, terjemahan, mulai cepat, filter', async () => {
  const { recommend } = await import('../js/recommend.js');
  const now = Date.parse('2026-11-05T10:00:00Z');
  const ago = (d) => new Date(now - d * 86400000).toISOString();
  const V = (id, o) => ({ youtubeId: id, title: id, channel: 'X', tags: [], playCount: 0, favorite: false, lastPlayedAt: null, firstAddedAt: ago(30), ...o });
  const vids = [
    V('fav', { favorite: true, channel: 'A', playCount: 2, lastPlayedAt: ago(3) }),
    V('often', { channel: 'A', playCount: 20, lastPlayedAt: ago(40) }),
    V('justnow', { channel: 'A', playCount: 20, lastPlayedAt: ago(0.1) }),
    V('newA', { channel: 'A' }),
    V('random', { channel: 'Z' }),
    V('dead', { channel: 'A', playCount: 9, unavailable: 'gone' }),
  ];
  const r = recommend(vids, { now });
  const ids = r.map((x) => x.video.youtubeId);
  assert.ok(!ids.includes('dead'), 'video dihapus tidak direkomendasikan');
  assert.ok(ids.indexOf('often') < ids.indexOf('random'));
  assert.ok(ids.indexOf('newA') < ids.indexOf('random'), 'channel favorit didahulukan');
  assert.ok(ids.indexOf('often') < ids.indexOf('justnow'), 'yang baru diputar turun');
  assert.equal(r.find((x) => x.video.youtubeId === 'often').reason, 'Lama tidak kamu putar');
  assert.deepEqual(recommend(vids, { now }).map((x) => x.video.youtubeId), ids, 'stabil dalam satu hari');

  const { classifyApiItems } = await import('../js/health.js');
  assert.deepEqual(classifyApiItems(['a', 'b', 'c', 'd'], [
    { id: 'a', status: { privacyStatus: 'public', embeddable: true } },
    { id: 'b', status: { privacyStatus: 'private' } },
    { id: 'c', status: { privacyStatus: 'public', embeddable: false } },
  ]), { a: null, b: 'gone', c: 'embed', d: 'gone' });

  store.replaceData(normalizeData({ playlists: [{ id: 'p', name: 'P', items: [{ youtubeId: 'dQw4w9WgXcQ' }] }], videos: { dQw4w9WgXcQ: { title: 't', unavailable: 'weird' } } }));
  assert.equal(store.data.videos.dQw4w9WgXcQ.unavailable, null);
  store.setAvailability({ dQw4w9WgXcQ: 'gone' });
  assert.equal(normalizeData(JSON.parse(JSON.stringify(store.data))).videos.dQw4w9WgXcQ.unavailable, 'gone', 'ikut tersimpan/sinkron');

  const { quickFilter } = await import('../js/utils.js');
  const es = [{ youtubeId: 'a', addedAt: new Date().toISOString(), video: { unavailable: 'gone' } }, { youtubeId: 'b', addedAt: '2020-01-01T00:00:00Z', video: {} }];
  assert.deepEqual(quickFilter(es, 'new').map((e) => e.youtubeId), ['a']);
  assert.deepEqual(quickFilter(es, 'unavail').map((e) => e.youtubeId), ['a']);

  const { detectLang, chunkLines, translateLines } = await import('../js/lyrics.js');
  assert.equal(detectLang('I love you, and you love me\nthe night is young'), 'en');
  assert.equal(detectLang('小幸运 我听见雨滴落在青青草地 我听见远方下课钟声响起'), 'zh-CN');
  assert.equal(detectLang('사랑해요 당신을 정말 사랑해요'), 'ko');
  assert.equal(detectLang('aku cinta kamu yang selalu ada di hati'), 'id');
  assert.deepEqual(chunkLines(['aaaa', 'bbbb', 'cccc'], 10).map((g) => g.length), [2, 1]);
  const calls = [];
  globalThis.fetch = async (url) => {
    const q = new URL(url).searchParams.get('q');
    calls.push(q);
    return { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: q.split('\n').map((l) => `ID:${l}`).join('\n') } }) };
  };
  assert.deepEqual(await translateLines(['hello', '', 'world', 'hello'], 'en'), ['ID:hello', '', 'ID:world', 'ID:hello']);
  assert.equal(calls.length, 1, 'satu permintaan untuk beberapa baris');

  const { quickstartSteps } = await import('../js/onboard.js');
  const st = quickstartSteps({ videos: 2, played: false, apiKey: true });
  assert.deepEqual(st.map((s) => s.done), [true, false, true, false, false]);
});

test('diagnosis error YouTube API', async () => {
  const { explainYtError } = await import('../js/sources.js');
  const disabled = { error: { code: 403, message: 'YouTube Data API v3 has not been used in project 123 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }], details: [{ reason: 'SERVICE_DISABLED', metadata: { activationUrl: 'https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=123' } }] } };
  const d = explainYtError(403, disabled);
  assert.equal(d.code, 'disabled');
  assert.ok(d.message.includes('project=123'));
  assert.equal(explainYtError(403, { error: { message: 'Requests from referer https://x.github.io/ are blocked.', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } }).code, 'referrer');
  assert.equal(explainYtError(403, { error: { message: 'Requests to this API youtube.googleapis.com method youtube.api.v3.V3DataSearchService.List are blocked.', details: [{ reason: 'API_KEY_SERVICE_BLOCKED' }] } }).code, 'restricted');
  assert.equal(explainYtError(400, { error: { message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } }).code, 'invalid');
  assert.equal(explainYtError(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }).code, 'quota');
  assert.equal(explainYtError(500, {}).code, 'other');
});

test('Lobby: noise, scene, Pomodoro, sapaan', async () => {
  const { fillNoise, fillClicks, SOUNDS } = await import('../js/ambient.js');
  for (const type of ['white', 'pink', 'brown']) {
    const a = fillNoise(new Float32Array(44100), type);
    const peak = a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    assert.ok(peak > 0.01 && peak <= 1.5, `${type} dalam batas (${peak})`);
    assert.ok(a.every(Number.isFinite));
  }
  const c = fillClicks(new Float32Array(8000), 8000, { count: 20 });
  assert.ok(c.some((x) => x !== 0));
  assert.ok(SOUNDS.length >= 12 && new Set(SOUNDS.map((s) => s.id)).size === SOUNDS.length);

  const { ridge, SCENES } = await import('../js/scenes.js');
  const r = ridge(33);
  assert.equal(r.length, 33);
  assert.ok(Math.min(...r) === 0 && Math.max(...r) === 1);
  assert.deepEqual(SCENES.map((s) => s.id), ['room']);

  const { greeting, pomodoroNext, FOCUS_PRESETS, SLEEP_PRESETS } = await import('../js/lobby.js');
  assert.equal(greeting(7), 'Selamat pagi');
  assert.equal(greeting(13), 'Selamat siang');
  assert.equal(greeting(17), 'Selamat sore');
  assert.equal(greeting(22), 'Selamat malam');
  let st = { phase: 'work', remaining: 0, sessions: 0 };
  const seq = [];
  for (let i = 0; i < 8; i++) { st = pomodoroNext(st); seq.push(st.phase); }
  assert.deepEqual(seq, ['break', 'work', 'break', 'work', 'break', 'work', 'long', 'work']);
  assert.equal(st.sessions, 4);
  assert.ok(FOCUS_PRESETS.every(([w, b, l]) => w > b && l > b), 'durasi fokus masuk akal');
  assert.ok(SLEEP_PRESETS.length && SLEEP_PRESETS.every((m) => m > 0));
});

test('Kamar santai: waktu otomatis & suara ikut suasana', async () => {
  const { resolveTime, roomSoundMix, LOCATIONS, WEATHERS } = await import('../js/room.js');
  const { SOUNDS } = await import('../js/ambient.js');
  assert.equal(resolveTime('auto', 7), 'morning');
  assert.equal(resolveTime('auto', 12), 'day');
  assert.equal(resolveTime('auto', 17), 'dusk');
  assert.equal(resolveTime('auto', 23), 'night');
  assert.equal(resolveTime('dusk', 3), 'dusk');
  const m1 = roomSoundMix({ loc: 'beach', weather: 'clear', time: 'day' });
  assert.ok(m1.waves > 0 && m1.seagulls > 0);
  const m2 = roomSoundMix({ loc: 'forest', weather: 'storm', time: 'night' });
  assert.ok(m2.heavyrain && m2.thunder && !m2.crickets && !m2.birds && !m2.owl);
  const m3 = roomSoundMix({ loc: 'ricefield', weather: 'clear', time: 'night' });
  assert.ok(m3.crickets && m3.stream && !m3.birds);
  for (const l of LOCATIONS) for (const w of WEATHERS) for (const t of ['morning', 'day', 'dusk', 'night']) {
    const m = roomSoundMix({ loc: l.id, weather: w.id, time: t });
    assert.ok(Object.keys(m).every((k) => SOUNDS.some((s) => s.id === k)), `${l.id}/${w.id}/${t}`);
    assert.ok(Object.values(m).every((v) => v > 0 && v <= 1));
  }
});

test('v29: timer tidur bersama (label, akhir lagu, tambah waktu, memelan, batal)', async () => {
  const { createSleepTimer, sleepLabel, SLEEP_PRESETS } = await import('../js/sleep.js');
  assert.equal(sleepLabel({}), '');
  assert.equal(sleepLabel({ track: true }), '⏾ akhir lagu');
  assert.equal(sleepLabel({ end: 1000 + 14.2 * 60000 }, 1000), '⏾ 15 mnt');
  assert.deepEqual(SLEEP_PRESETS, [15, 30, 45, 60, 90]);
  const player = { vol: 80, isPlaying: true, stopAfterCurrent: false, paused: false, volume() { return this.vol; }, setVolume(v) { this.vol = v; }, pause() { this.paused = true; this.isPlaying = false; } };
  const amb = { master: 0.8, stopped: false, setMaster(v) { this.master = v; }, stopAll() { this.stopped = true; } };
  const toasts = [];
  const t = createSleepTimer({ player, amb, getMaster: () => 0.8, toast: (m) => toasts.push(m) });
  let changes = 0; t.onChange(() => changes++);
  t.set('track');
  assert.ok(t.active && t.endOfTrack && player.stopAfterCurrent);
  t.trackEnded();
  assert.ok(!t.active && amb.stopped);
  t.set(15);
  assert.ok(t.active && !t.endOfTrack && t.remaining() > 14 * 60);
  t.add(15);
  assert.ok(t.remaining() > 29 * 60);
  t.set(0);
  assert.ok(!t.active && !player.stopAfterCurrent);
  assert.ok(changes >= 4 && toasts.some((m) => /dimatikan/.test(m)));
});

test('v30: cuaca nyata — kode WMO, waktu dari matahari, kelompok lukisan', async () => {
  const w = await import('../js/weather.js');
  const { paintWeather } = await import('../js/room.js');
  assert.deepEqual([0, 1, 2, 3, 45, 51, 61, 65, 80, 71, 86, 95, 99].map(w.wmoToWeather),
    ['clear', 'clear', 'cloudy', 'cloudy', 'fog', 'rain', 'rain', 'rain', 'rain', 'snow', 'snow', 'storm', 'storm']);
  assert.equal(w.describeWmo(61), 'hujan ringan');
  assert.equal(w.describeWmo(95), 'badai petir');
  // terbit 05:58 (358), terbenam 18:02 (1082)
  const t = (h, m) => w.timeFromSun(h * 60 + m, 358, 1082);
  assert.deepEqual([t(4, 0), t(5, 30), t(8, 0), t(12, 0), t(16, 40), t(18, 30), t(19, 0), t(23, 0)],
    ['night', 'morning', 'morning', 'day', 'dusk', 'dusk', 'night', 'night']);
  assert.equal(w.timeFromSun(600, null, null), null);
  assert.equal(w.minutesToNextTime(12 * 60, 358, 1082), 1082 - 90 - 720);
  assert.equal(w.minutesToNextTime(23 * 60, 358, 1082), 1440 - 1380 + 318);
  // jam lokal dari selisih zona waktu: 05:00 UTC + 7 jam = 12:00
  assert.equal(w.localMinutes(25200, Date.UTC(2026, 10, 9, 5, 0)), 720);
  const wx = w.parseForecast({ utc_offset_seconds: 25200, current: { temperature_2m: 27.6, weather_code: 63 }, daily: { sunrise: ['2026-11-09T05:58'], sunset: ['2026-11-09T18:02'] } }, 1);
  assert.deepEqual(wx, { at: 1, code: 63, temp: 28, offset: 25200, sunrise: 358, sunset: 1082 });
  assert.deepEqual(w.liveScene(wx, Date.UTC(2026, 10, 9, 5, 0)), { weather: 'rain', time: 'day' });
  assert.equal(w.liveScene(null), null);
  assert.throws(() => w.parseForecast({}));
  assert.equal(w.round2(1.13014), 1.13);
  // berawan/hujan/badai/kabut memakai satu lukisan "mendung" (tidak melukis ulang saat cuaca berganti)
  assert.deepEqual(['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow'].map(paintWeather), ['clear', 'grey', 'grey', 'grey', 'grey', 'snow']);
});

test('v31: kafe — menu, suara, minum seteguk, antar pesanan baru', async () => {
  const cafe = await import('../js/cafe.js');
  const { roomSoundMix } = await import('../js/room.js');
  const { SOUNDS } = await import('../js/ambient.js');
  // setiap menu punya sprite yang dilukis
  for (const d of cafe.DRINKS) assert.ok(cafe.CAFE_SPRITES[d.vessel] && cafe.CAFE_SPRITE_DRAW[d.vessel], d.id);
  for (const f of cafe.FOODS) assert.ok(cafe.CAFE_SPRITES[f.id] && cafe.CAFE_SPRITE_DRAW[f.id], f.id);
  assert.deepEqual(Object.keys(cafe.CAFE_SPRITES).sort(), Object.keys(cafe.CAFE_SPRITE_DRAW).sort());
  // suara di dalam kafe: obrolan + cuaca luar lebih pelan, tanpa burung/jangkrik
  const m = roomSoundMix({ place: 'cafe', loc: 'forest', weather: 'rain', time: 'day' });
  assert.ok(m.cafe > 0 && m.rain > 0 && m.rain < 0.6 && !m.birds && !m.stream);
  for (const w of ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']) {
    const k = roomSoundMix({ place: 'cafe', weather: w, time: 'night' });
    assert.ok(Object.keys(k).every((id) => SOUNDS.some((s) => s.id === id)) && Object.values(k).every((v) => v > 0 && v <= 1), w);
  }
  // animasi meja kita
  let clinks = 0; let placed = 0;
  const a = cafe.createCafeAnimator({ onClink: () => clinks++, onPlaced: () => placed++ });
  a.update({ serial: 1, drink: 'latte', food: 'croissant', drinkLeft: 1, foodLeft: 1 }, 0);
  let tb = a.tableState(0);
  assert.equal(tb.drink, 'latte'); assert.equal(tb.level, 1); assert.equal(tb.arm, null);
  // isi berkurang 1/6 → cangkir terangkat (seteguk), lalu kembali dengan isi baru
  a.update({ serial: 1, drink: 'latte', food: 'croissant', drinkLeft: 5 / 6, foodLeft: 0.7 }, 10);
  tb = a.tableState(11.5);
  assert.ok(tb.cupDy < -100 && tb.cupAlpha < 0.2, 'cangkir sedang diangkat');
  tb = a.tableState(14);
  assert.equal(tb.cupDy, 0); assert.ok(Math.abs(tb.level - 5 / 6) < 1e-9); assert.equal(tb.foodLeft, 0.7);
  // pesanan baru → lengan pelayan mengambil yang lama lalu mengantar yang baru
  a.update({ serial: 2, drink: 'matcha', food: 'sando', drinkLeft: 1, foodLeft: 1 }, 20);
  assert.ok(a.busyDelivering);
  assert.ok(a.tableState(20.6).arm, 'lengan masuk');
  assert.equal(a.tableState(20.6).drink, 'latte');
  let sawMatchaCarried = false;
  for (let t = 20; t < 30; t += 0.02) { const s2 = a.tableState(t); if (s2.carry && s2.carry.id === 'matcha') sawMatchaCarried = true; }
  tb = a.tableState(40);
  assert.ok(sawMatchaCarried);
  assert.equal(tb.drink, 'matcha'); assert.equal(tb.food, 'sando'); assert.equal(tb.level, 1); assert.equal(tb.arm, null);
  assert.ok(!a.busyDelivering && placed === 1 && clinks >= 2);
});

test('v32: pengunjung kafe — jumlah ikut waktu, siklus lengkap, kursi tidak bentrok', async () => {
  const v = await import('../js/visitors.js');
  assert.ok(v.crowdTarget('day') > v.crowdTarget('night'));
  assert.ok(v.crowdTarget('day', true) <= 3);
  assert.ok(v.depthScale(794) > v.depthScale(650));
  let s = 11; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let bells = 0;
  const fake = (look) => ({ look, ready: false, n: 0, step() { this.n++; if (this.n > 3) this.ready = true; return this.ready; } });
  const cr = v.createCrowd({ onBell: () => bells++ }, rnd, fake);
  const seen = new Set(); let max = 0; let pairSat = false;
  for (let t = 0; t < 900; t += 0.05) {
    cr.step(0.05, { time: 'day', weather: 'rain', phone: false, L: {} });
    const ps = cr.people();
    max = Math.max(max, ps.length);
    const seats = ps.filter((p) => p.state === 'sit').map((p) => `${p.seat.kind}${p.seat.i}`);
    assert.equal(new Set(seats).size, seats.length, 'dua orang di satu kursi');
    for (const p of ps) {
      seen.add(p.state);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= -0.2 && p.alpha <= 1);
      if (p.pair && p.state === 'sit') pairSat = true;
    }
  }
  for (const st of ['sit', 'enter', 'queue', 'order', 'pickup', 'toSeat', 'sitDown', 'standUp', 'leave']) assert.ok(seen.has(st), st);
  // inverse kinematics: tangan sampai di target yang terjangkau
  const k = v.ik(0, 0, 40, 40, 44, 42);
  assert.ok(Math.hypot(k.hx - 40, k.hy - 40) < 1e-6);
  assert.ok(Math.abs(Math.hypot(k.ex, k.ey) - 44) < 1e-6);
  assert.ok(max <= v.crowdTarget('day') + 1 && bells > 3 && pairSat);
});

test('v34: langkah tidak meluncur, lutut ke depan, minum & makan bertahap', async () => {
  const v = await import('../js/visitors.js');
  // satu langkah penuh (fase π) = badan maju 2 × setengah langkah
  assert.ok(Math.abs(v.stepPhase(52, 1) - Math.PI) < 1e-9);
  assert.ok(v.stepPhase(10, 0.5) > v.stepPhase(10, 1)); // langkah pendek saat pelan → fase lebih cepat
  const k = v.ik(0, -120, 20, 0, 62, 63, 'fwd');
  assert.ok(k.ex > 0 && Math.hypot(k.hx - 20, k.hy) < 1e-6); // lutut menekuk ke depan, telapak tepat di lantai
  let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const fake = (look) => ({ look, ready: true, step() { return true; } });
  const cr = v.createCrowd({}, rnd, fake);
  const kinds = new Set(); let bitten = false; let placed = false;
  for (let t = 0; t < 1200; t += 0.05) {
    cr.step(0.05, { time: 'day', weather: 'clear', phone: false, L: {} });
    for (const p of cr.people()) {
      if (p.act) { kinds.add(p.act.kind); assert.ok(p.act.q >= 0 && p.act.q <= 1); assert.equal(p.state, 'sit'); }
      if (p.food && p.food.left < 1 && p.state === 'sit') bitten = true;
      if (p.cupOnTable && !p.cupInHand) placed = true;
      if (p.food) assert.ok(p.food.left >= 0 && p.food.left <= 1);
    }
  }
  for (const k2 of ['place', 'sip', 'eat']) assert.ok(kinds.has(k2), k2);
  assert.ok(bitten && placed);
});

test('v35: barista menyapa, membuat kopi, menaruh cangkir; pengunjung mengambilnya', async () => {
  const v = await import('../js/visitors.js');
  let s = 11; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const fake = (look) => ({ look, ready: true, step() { return true; } });
  const cr = v.createCrowd({}, rnd, fake);
  const modes = new Set(); const served = new Set(); let had = false; let smiled = false;
  for (let t = 0; t < 900; t += 0.05) {
    cr.step(0.05, { time: 'day', weather: 'clear', phone: false, L: {} });
    const b = cr.barista; modes.add(b.mode);
    assert.ok(b.orders >= 0 && b.orders < 6);
    if (b.counterCup) had = true;
    if (b.f.happy > 0.6) smiled = true;
    for (const p of cr.people()) if (p.cupInHand && p.state === 'toSeat') served.add(p.id);
    assert.ok(b.x >= 100 && b.x <= 240);
  }
  for (const m of ['greet', 'brew', 'serve', 'wipe', 'walk']) assert.ok(modes.has(m), m);
  assert.ok(had && smiled && served.size > 3, `${had} ${smiled} ${served.size}`);
  assert.equal(cr.barista.ch.look.apron, '3c4f5f');
});

test('v36: pindah banyak lagu sekaligus, ke nomor tertentu, geser satu langkah, urungkan', () => {
  mem.clear();
  store.load();
  const pid = store.data.playlists[0].id;
  const ids = 'abcdefghij'.split('').map((ch) => ch.repeat(11));
  store.addVideos(ids, pid);
  const order = () => store.getPlaylist(pid).items.map((i) => i.youtubeId[0]).join('');
  const item = (ch) => store.getPlaylist(pid).items.find((i) => i.youtubeId[0] === ch).itemId;
  assert.equal(order(), 'abcdefghij');
  // c, f, h ke paling atas — urutan di antara mereka tetap
  const before = store.moveItems(pid, ['h', 'c', 'f'].map(item), 0);
  assert.equal(order(), 'cfhabdegij');
  store.setOrder(pid, before); // urungkan
  assert.equal(order(), 'abcdefghij');
  // satu lagu (nomor 9 → nomor 2)
  store.moveItems(pid, [item('i')], 1);
  assert.equal(order(), 'aibcdefghj');
  // ke paling bawah (angka kebesaran dibatasi)
  store.moveItems(pid, [item('a'), item('b')], 999);
  assert.equal(order(), 'icdefghjab');
  assert.equal(store.moveItems(pid, [item('a'), item('b')], 999), null); // sudah di sana
  // kumpulkan c & g di posisi c
  store.moveItems(pid, [item('c'), item('g')], 1);
  assert.equal(order(), 'icgdefhjab');
  // geser satu langkah: blok berdempetan ikut bersama, yang sudah paling atas diam
  assert.ok(store.nudgeItems(pid, [item('d'), item('e')], -1));
  assert.equal(order(), 'icdegfhjab');
  assert.ok(store.nudgeItems(pid, [item('i'), item('f')], -1));
  assert.equal(order(), 'icdefghjab');
  assert.ok(store.nudgeItems(pid, [item('b')], 1) === false);
});

test('v38: potong awal/akhir — simpan & normalisasi, isian dialog, player berhenti di titik akhir', async () => {
  const { normTrim } = await import('../js/store.js');
  const { parseClock } = await import('../js/utils.js');
  const { readTrimInput, trimmedDuration } = await import('../js/trim.js');
  const { cutPercents } = await import('../js/seekbar.js');
  const { Player } = await import('../js/player.js');
  const settle = () => new Promise((r) => setTimeout(r, 0));

  // normalisasi
  assert.deepEqual(normTrim([12.4, 200.6]), [12, 201]);
  assert.equal(normTrim([0, 0]), null);
  assert.equal(normTrim(null), null);
  assert.deepEqual(normTrim([30, 20]), [30, 0], 'akhir sebelum mulai diabaikan');
  assert.deepEqual(normTrim([10, 240], 240), [10, 0], 'akhir = durasi sama saja tidak dipotong');
  assert.equal(normTrim([500, 0], 240), null, 'mulai di luar lagu diabaikan');

  // waktu yang diketik
  assert.equal(parseClock('1:23'), 83);
  assert.equal(parseClock('1:02:03'), 3723);
  assert.equal(parseClock('45'), 45);
  assert.equal(parseClock(''), 0);
  assert.ok(Number.isNaN(parseClock('abc')));
  assert.ok(Number.isNaN(parseClock('1:75')));
  assert.deepEqual(readTrimInput('0:20', '3:10', 240), { start: 20, end: 190 });
  assert.deepEqual(readTrimInput('', '', 240), { start: 0, end: 0 });
  assert.deepEqual(readTrimInput('0:20', '9:00', 240), { start: 20, end: 0 }, 'akhir melewati durasi = tidak dipotong');
  assert.ok(readTrimInput('2:00', '1:00', 240).error);
  assert.ok(readTrimInput('5:00', '', 240).error);
  assert.ok(readTrimInput('x', '', 240).error);
  assert.equal(trimmedDuration([20, 190], 240), 170);
  assert.equal(trimmedDuration([20, 0], 240), 220);
  assert.equal(trimmedDuration(null, 240), 240);
  assert.deepEqual(cutPercents([24, 180], 240), { a: 10, b: 25 });
  assert.deepEqual(cutPercents(null, 240), { a: 0, b: 0 });

  // store: tersimpan, ikut normalizeData (sync/impor), bisa dihapus
  mem.clear();
  store.load();
  const pid = store.data.playlists[0].id;
  const A = 'A'.repeat(11); const B = 'B'.repeat(11); const C = 'C'.repeat(11);
  store.addVideos([A, B, C], pid);
  store.updateVideo(A, { duration: 240 });
  assert.deepEqual(store.setTrim(A, 20, 190), [20, 190]);
  assert.deepEqual(store.getTrim(A), [20, 190]);
  assert.deepEqual(normalizeData(JSON.parse(JSON.stringify(store.data))).videos[A].trim, [20, 190]);
  assert.equal('trim' in store.data.videos[B], false, 'lagu tanpa potongan tidak membawa field trim');
  assert.equal(store.setTrim(B, 0, 0), null);

  // player dengan YouTube tiruan
  const S = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  globalThis.YT = { PlayerState: S };
  const mk = () => {
    const p = new Player('trim');
    const yt = {
      t: 0, loads: [], paused: 0,
      loadVideoById(a) { const o = typeof a === 'string' ? { videoId: a } : a; this.loads.push(o); this.t = o.startSeconds || 0; p.onState({ data: S.PLAYING }); },
      seekTo(t) { this.t = t; },
      playVideo() { p.onState({ data: S.PLAYING }); },
      pauseVideo() { this.paused++; p.onState({ data: S.PAUSED }); },
      getCurrentTime() { return this.t; }, getDuration() { return 240; },
      getPlaybackRate() { return 1; }, setPlaybackRate() {}, getVideoData() { return {}; },
    };
    p.yt = yt; p.ready = Promise.resolve();
    p.trimLookup = (id) => store.getTrim(id);
    return { p, yt };
  };
  const entries = [A, B, C].map((id) => ({ key: `k${id[0]}`, youtubeId: id }));

  let { p, yt } = mk();
  await p.playList(entries, 0);
  assert.deepEqual(yt.loads.at(-1), { videoId: A, startSeconds: 20 }, 'mulai dari titik potong awal');
  assert.equal(p.startAt, 0, 'melewati intro bukan "melanjutkan" (tanpa toast)');
  yt.t = 100;
  assert.equal(p.checkTrim(), false);
  p.trimPaused = true; yt.t = 191;
  assert.equal(p.checkTrim(), false, 'dialog potong terbuka: tidak diakhiri');
  p.trimPaused = false;
  const events = [];
  p.on((type) => events.push(type));
  assert.equal(p.checkTrim(), true);
  await settle();
  assert.ok(events.includes('ended'), 'dihitung selesai (ditandai ditonton, statistik)');
  assert.equal(p.current.youtubeId, B, 'lanjut ke lagu berikutnya');
  assert.deepEqual(yt.loads.at(-1), { videoId: B });

  // Sebelumnya (prev) pada lagu yang dipotong: kembali ke titik mulai, bukan 0
  p.prev(); await settle();
  assert.equal(p.current.youtubeId, A);
  yt.t = 60; p.prev();
  assert.equal(yt.t, 20);

  // ulang satu lagu: berputar di dalam rentang
  p.repeat = 'one'; yt.t = 190.2;
  assert.equal(p.checkTrim(), true);
  assert.equal(p.current.youtubeId, A);
  assert.equal(yt.t, 20);
  assert.equal(p.state, 'playing');

  // lagu terakhir, tanpa ulang: video dijeda di titik akhir; Putar mengulang dari titik mulai
  ({ p, yt } = mk());
  p.repeat = 'off';
  await p.playList([entries[0]], 0);
  yt.t = 195;
  assert.equal(p.checkTrim(), true);
  assert.equal(yt.paused, 1);
  assert.equal(p.state, 'ended');
  p.toggle();
  assert.equal(yt.t, 20);
  assert.equal(p.state, 'playing');

  // posisi tersimpan (video panjang) setelah titik akhir → mulai dari titik potong awal
  ({ p, yt } = mk());
  p.resumeLookup = () => 188;
  await p.playList([entries[0]], 0);
  assert.deepEqual(yt.loads.at(-1), { videoId: A, startSeconds: 20 });
  p.resumeLookup = () => 90;
  await p.playList([entries[0]], 0);
  assert.deepEqual(yt.loads.at(-1), { videoId: A, startSeconds: 90 });
  assert.equal(p.startAt, 90, 'benar-benar melanjutkan → toast "Melanjutkan dari"');

  // tanpa potongan perilaku lama tidak berubah
  ({ p, yt } = mk());
  await p.playList([entries[1], entries[2]], 0);
  assert.deepEqual(yt.loads.at(-1), { videoId: B });
  yt.t = 239; assert.equal(p.checkTrim(), false);
  p.onState({ data: S.ENDED }); await settle();
  assert.equal(p.current.youtubeId, C);
});

test('v38: "Apa yang baru" — versi sekarang di atas, sisanya dilipat', async () => {
  const { splitChanges, APP_VERSION } = await import('../js/onboard.js');
  const { now, older } = splitChanges();
  assert.ok(now.length >= 1 && now.every((c) => c[3] === APP_VERSION));
  assert.ok(older.length >= 1 && older.every((c) => c[3] !== APP_VERSION));
  assert.ok(now.length + older.length <= 15, 'daftar CHANGES tetap ringkas');
  const legacy = splitChanges([['a', 'A', 'x'], ['b', 'B', 'y']], 'v99');
  assert.equal(legacy.now.length, 1);
  assert.equal(legacy.older.length, 1);
});

test('v39: lanjutkan sesi terakhir — potret, bersihkan lagu yang dihapus, kedaluwarsa, pulihkan player', async () => {
  const { snapshotSession, readSession } = await import('../js/session.js');
  const { Player } = await import('../js/player.js');
  const ids = 'abcdef'.split('').map((c) => c.repeat(11));
  const p = new Player('sess');
  const loads = [];
  p.yt = { loadVideoById: (o) => loads.push(o), getCurrentTime: () => 0, getPlaybackRate: () => 1, setPlaybackRate() {} };
  p.ready = Promise.resolve();
  p.queue = ids.map((y) => ({ key: `k-${y[0]}`, youtubeId: y }));
  p.order = [2, 0, 4, 1, 5];            // acak; lagu ke-3 (d) sudah dibuang dari antrean
  p.pos = 1;                            // sedang memutar "a"
  p.queue.push({ key: 'm', youtubeId: ids[3], manual: true });
  p.order.push(6);
  const now = Date.parse('2026-11-12T10:00:00Z');
  const snap = snapshotSession(p, { time: 83.7, source: { view: 'pl:x', sort: 'manual', query: '' }, now });
  assert.equal(snap.t, 83);
  assert.equal(snap.queue.length, 6, 'hanya lagu yang masih di antrean');
  assert.equal(snap.queue[snap.order[snap.pos]].y, ids[0]);
  assert.equal(snap.queue.at(-1).m, 1, 'tanda "ditambah manual" ikut tersimpan');
  assert.equal(snapshotSession(new Player('x')), null);

  // utuh
  const all = readSession(JSON.stringify(snap), { now: now + 3600e3 });
  assert.deepEqual(all.order.map((i) => all.queue[i].youtubeId[0]), ['c', 'a', 'e', 'b', 'f', 'd']);
  assert.equal(all.queue[all.order[all.pos]].youtubeId, ids[0]);
  assert.equal(all.t, 83);
  assert.equal(all.queue.at(-1).manual, true);
  assert.deepEqual(all.source, { view: 'pl:x', sort: 'manual', query: '' });

  // lagu "e" dihapus dari library → keluar dari antrean, posisi tetap di "a"
  const noE = readSession(snap, { now, exists: (y) => y !== ids[4] });
  assert.deepEqual(noE.order.map((i) => noE.queue[i].youtubeId[0]), ['c', 'a', 'b', 'f', 'd']);
  assert.equal(noE.queue[noE.order[noE.pos]].youtubeId[0], 'a');
  assert.equal(noE.t, 83);

  // lagu terakhir ("a") sudah dihapus → lanjut dari lagu berikutnya yang masih ada, dari awal
  const noA = readSession(snap, { now, exists: (y) => y !== ids[0] && y !== ids[4] });
  assert.equal(noA.queue[noA.order[noA.pos]].youtubeId[0], 'b');
  assert.equal(noA.t, 0);

  // semua hilang / kedaluwarsa / rusak
  assert.equal(readSession(snap, { now, exists: () => false }), null);
  assert.equal(readSession(snap, { now: now + 15 * 86400e3 }), null);
  assert.equal(readSession('{oops', { now }), null);
  assert.equal(readSession({ v: 2 }, { now }), null);

  // pulihkan
  await p.restore(all);
  assert.equal(p.current.youtubeId, ids[0]);
  assert.equal(p.order.length, 6);
  assert.deepEqual(loads.at(-1), { videoId: ids[0], startSeconds: 83 });
  assert.equal(p.startAt, 83, 'toast "Melanjutkan dari 1:23" muncul');
  p.next();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.current.youtubeId, ids[4], 'lagu berikutnya sesuai urutan acak yang tersimpan');
});

test('v39: tag otomatis dari judul — tidak salah tangkap judul lagu, terapkan & urungkan', async () => {
  const { tagsFromTitle, applyAutoTags } = await import('../js/autotag.js');
  const cases = [
    ["Live While We're Young - One Direction", []],
    ['Tulus - Hati-Hati di Jalan (Live at Java Jazz 2023)', ['live']],
    ['Mahalini - Sial | Live Session', ['live']],
    ['Evaluasi - Hindia - Live', ['live']],
    ['SIAL - MAHALINI (COVER BY ARIEF)', ['cover']],
    ['Cover Me - Bruce Springsteen', []],
    ['Golden Hour - JVKE (Remix)', ['remix']],
    ['Remix to Ignition - R. Kelly', []],
    ['Sorai - Nadin Amizah (Acoustic Version)', ['acoustic']],
    ['Night Dancer - imase [Official Lyric Video]', ['lyrics']],
    ['Komang - Raim Laode (Slowed + Reverb)', ['slowed']],
    ['YOASOBI - Idol (Sped Up)', ['sped up']],
    ['Lemon - Kenshi Yonezu (Piano Instrumental)', ['instrumental']],
    ['Monokrom - Tulus Karaoke', ['karaoke']],
    ['lofi hip hop radio - beats to relax/study to', ['lofi']],
    ['', []],
  ];
  for (const [t, want] of cases) assert.deepEqual(tagsFromTitle(t).sort(), want.sort(), t);

  mem.clear();
  store.load();
  const pid = store.data.playlists[0].id;
  const A = 'L'.repeat(11); const B = 'M'.repeat(11); const C = 'N'.repeat(11);
  store.addVideos([A, B, C], pid);
  store.updateVideo(A, { title: 'Tulus - Hati-Hati di Jalan (Live)', tags: ['indo', 'LIVE'] });
  store.updateVideo(B, { title: 'Sial (Acoustic Cover)', tags: ['indo'] });
  store.updateVideo(C, { title: 'Hati-Hati di Jalan' });
  const r = applyAutoTags(store, [A, B, C]);
  assert.equal(r.videos, 1, 'A sudah punya "LIVE" (beda huruf saja), C tidak punya keterangan');
  assert.deepEqual(store.data.videos[B].tags, ['indo', 'cover', 'acoustic']);
  assert.deepEqual(store.data.videos[A].tags, ['indo', 'LIVE']);
  r.undo();
  assert.deepEqual(store.data.videos[B].tags, ['indo']);
});

test('v39: dekorasi musiman menurut tanggal & jendela lirik panel Sedang diputar', async () => {
  const { seasonFor } = await import('../js/seasons.js');
  const at = (iso) => { const [y, m, d] = iso.split('-').map(Number); return seasonFor(new Date(y, m - 1, d, 20)); };
  assert.equal(at('2026-11-12'), null);
  assert.deepEqual(at('2026-12-01'), { id: 'natal', peak: false });
  assert.deepEqual(at('2026-12-25'), { id: 'natal', peak: true });
  assert.deepEqual(at('2026-12-31'), { id: 'tahunbaru', peak: true });
  assert.equal(at('2027-01-03'), null);
  assert.deepEqual(at('2027-02-06'), { id: 'imlek', peak: true });
  assert.equal(at('2027-02-21').id, 'imlek', 'sampai Cap Go Meh');
  assert.equal(at('2027-02-22'), null);
  assert.deepEqual(at('2027-03-10'), { id: 'lebaran', peak: true });
  assert.equal(at('2027-03-07').id, 'lebaran');
  assert.equal(at('2027-03-18'), null);
  assert.deepEqual(at('2027-08-17'), { id: 'merdeka', peak: true });
  assert.equal(at('2029-02-13').id, 'imlek', 'Imlek & Lebaran berdekatan: yang paling dekat dengan hari H');
  assert.equal(at('2029-02-14').id, 'lebaran');

  globalThis.window.matchMedia = globalThis.window.matchMedia || (() => ({ matches: false, addEventListener() {} }));
  const { lyricWindow } = await import('../js/nowpanel.js');
  assert.deepEqual(lyricWindow(0, -1), [0, 0]);
  assert.deepEqual(lyricWindow(40, -1), [0, 7]);
  assert.deepEqual(lyricWindow(40, 10), [8, 15]);
  assert.deepEqual(lyricWindow(40, 39), [37, 40]);
});

test('v41: judul bersih — tempelan promosi dibuang, versi & judul asli aman', async () => {
  const { cleanTitle, titleOf, setCleanTitles } = await import('../js/titles.js');
  const c = (t) => cleanTitle(t);
  assert.equal(c('Tulus - Hati-Hati di Jalan (Official Music Video)'), 'Tulus - Hati-Hati di Jalan');
  assert.equal(c('Song Name [HD]'), 'Song Name');
  assert.equal(c('Song (Official Video) [4K]'), 'Song');
  assert.equal(c('Song | Official Audio'), 'Song');
  assert.equal(c('Artist - Song - Official Video'), 'Artist - Song');
  assert.equal(c("BTS (방탄소년단) 'Dynamite' Official MV"), "BTS (방탄소년단) 'Dynamite'");
  assert.equal(c('[MV] IU(아이유) _ Celebrity'), 'IU(아이유) _ Celebrity');
  assert.equal(c('Artist - Song【Official Video】'), 'Artist - Song');
  assert.equal(c('Mahalini - Sial (Video Lirik)'), 'Mahalini - Sial');
  // yang bukan tempelan tetap
  assert.equal(c('Song (Live at Wembley)'), 'Song (Live at Wembley)');
  assert.equal(c('Artist - Song (Sped Up)'), 'Artist - Song (Sped Up)');
  assert.equal(c('Artist - Song (Remastered 2011)'), 'Artist - Song (Remastered 2011)');
  assert.equal(c('Video Killed the Radio Star'), 'Video Killed the Radio Star');
  assert.equal(c('Audio'), 'Audio', 'judul yang hanya berisi kata tempelan tidak dikosongkan');
  assert.equal(titleOf({ title: 'A (Official Video)' }), 'A');
  setCleanTitles(false);
  assert.equal(titleOf({ title: 'A (Official Video)' }), 'A (Official Video)');
  setCleanTitles(true);
  assert.equal(titleOf({ title: null }), null);
});

test('v41: lagu ganda — kunci lagu, kelompok, gabung dengan Urungkan', async () => {
  const { songKey, findDuplicates, similarTo } = await import('../js/dupes.js');
  assert.equal(songKey('The Weeknd - Blinding Lights (Official Video)', 'TheWeekndVEVO'), songKey('Blinding Lights', 'The Weeknd - Topic'));
  assert.equal(songKey('Ed Sheeran - Perfect (feat. Beyoncé) [Official Video]', 'x'), songKey('Ed Sheeran - Perfect ft. Beyonce', 'Ed Sheeran'));
  assert.notEqual(songKey('The Weeknd - Blinding Lights (Live)', ''), songKey('The Weeknd - Blinding Lights', ''), 'versi live bukan lagu yang sama');
  assert.notEqual(songKey('Hello', 'Adele - Topic'), songKey('Hello', 'Lionel Richie - Topic'), 'judul sama, artis beda');
  assert.equal(songKey(null, 'x'), '');

  const A = 'aaaaaaaaaa1'; const B = 'bbbbbbbbbb2'; const C = 'cccccccccc3'; const D = 'dddddddddd4';
  store.replaceData({
    playlists: [
      { id: 'p1', name: 'Satu', items: [{ itemId: 'i1', youtubeId: A }, { itemId: 'i2', youtubeId: C }, { itemId: 'i3', youtubeId: B }] },
      { id: 'p2', name: 'Dua', items: [{ itemId: 'j1', youtubeId: B }, { itemId: 'j2', youtubeId: D }] },
    ],
    videos: {
      [A]: { title: 'Tulus - Gajah (Official Music Video)', channel: 'TULUS', playCount: 3, tags: ['indo'] },
      [B]: { title: 'Gajah', channel: 'Tulus - Topic', playCount: 5, favorite: true, tags: ['santai'] },
      [C]: { title: 'Lain - Lagu', channel: 'x' },
      [D]: { title: 'Tulus - Gajah (Live)', channel: 'TULUS' },
    },
  });
  const g = findDuplicates(store.data.videos, store.data.playlists);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, [B, A], 'yang ada di lebih banyak playlist disarankan disimpan');
  assert.deepEqual(similarTo(store.data.videos, A), [B]);

  const cp = store.checkpoint();
  assert.equal(store.mergeVideos(B, [A]), 1);
  assert.equal(store.data.videos[A], undefined);
  const v = store.data.videos[B];
  assert.equal(v.playCount, 8);
  assert.equal(v.favorite, true);
  assert.deepEqual([...v.tags].sort(), ['indo', 'santai']);
  // p1 sudah berisi B → item A dibuang (B tetap di posisinya); p2 tidak berubah
  assert.deepEqual(store.getPlaylist('p1').items.map((i) => i.youtubeId), [C, B]);
  assert.deepEqual(store.getPlaylist('p2').items.map((i) => i.youtubeId), [B, D]);
  store.restoreCheckpoint(cp);
  assert.ok(store.data.videos[A]);
  assert.deepEqual(store.getPlaylist('p1').items.map((i) => i.youtubeId), [A, C, B]);
  assert.equal(store.data.videos[B].playCount, 5);

  // gabung ke video yang belum ada di playlist: posisi item lama dipakai
  store.mergeVideos(A, [B]);
  assert.deepEqual(store.getPlaylist('p2').items.map((i) => i.youtubeId), [A, D]);
});

test('v41: Urungkan umum (checkpoint), pindah playlist, filter gabungan, pratinjau banyak link', async () => {
  const { quickFilter, toggleFilter } = await import('../js/utils.js');
  const { classifyLinks, idsToAdd } = await import('../js/addpreview.js');
  const A = 'aaaaaaaaaa1'; const B = 'bbbbbbbbbb2'; const C = 'cccccccccc3';
  store.replaceData({
    playlists: [
      { id: 'p1', name: 'Satu', items: [{ itemId: 'i1', youtubeId: A }, { itemId: 'i2', youtubeId: B }] },
      { id: 'p2', name: 'Dua', items: [] }, { id: 'p3', name: 'Tiga', items: [{ itemId: 'k1', youtubeId: C }] },
    ],
    videos: { [A]: { title: 'A', tags: ['lofi'], duration: 200 }, [B]: { title: 'B', tags: ['lofi'], playCount: 2, duration: 700 }, [C]: { title: 'C' } },
  });
  // hapus dari library lalu urungkan: judul yang dimuat sementara itu tidak hilang
  const cp = store.checkpoint();
  store.deleteVideo(A);
  store.data.videos[B].title = 'B baru';
  store.restoreCheckpoint(cp);
  assert.ok(store.data.videos[A]);
  assert.deepEqual(store.getPlaylist('p1').items.map((i) => i.youtubeId), [A, B]);
  // hapus playlist lalu urungkan (view ikut kembali)
  store.setView('pl:p3');
  const cp2 = store.checkpoint();
  store.deletePlaylist('p3');
  assert.notEqual(store.ui.view, 'pl:p3');
  store.restoreCheckpoint(cp2, { restoreView: true });
  assert.equal(store.ui.view, 'pl:p3');

  // urutan playlist
  const before = store.movePlaylistTo('p3', 0);
  assert.deepEqual(store.data.playlists.map((p) => p.id), ['p3', 'p1', 'p2']);
  assert.equal(store.movePlaylistTo('p3', 0), null, 'sudah di posisi itu');
  store.setPlaylistOrder(before);
  assert.deepEqual(store.data.playlists.map((p) => p.id), ['p1', 'p2', 'p3']);
  const { dropIndex } = await import('../js/navdrag.js');
  assert.equal(dropIndex([10, 30, 50], 5), 0);
  assert.equal(dropIndex([10, 30, 50], 35), 2);
  assert.equal(dropIndex([10, 30, 50], 99), 3);

  // filter gabungan: semua harus cocok; kelompok durasi saling menggantikan
  const ents = store.viewEntries('all');
  assert.deepEqual(quickFilter(ents, ['tag:lofi', 'never']).map((e) => e.youtubeId), [A]);
  assert.deepEqual(quickFilter(ents, ['tag:lofi', 'long']).map((e) => e.youtubeId), [B]);
  assert.equal(quickFilter(ents, 'tag:lofi').length, 2, 'satu id (string) tetap didukung');
  assert.deepEqual(toggleFilter(['short', 'never'], 'long'), ['never', 'long']);
  assert.deepEqual(toggleFilter(['never'], 'never'), []);

  // pratinjau banyak link
  const text = `https://youtu.be/${A}\nhttps://youtu.be/${C} https://youtu.be/${C}\nhttps://youtu.be/zzzzzzzzzz9 https://www.youtube.com/playlist?list=PLabcdefghijk https://example.com/x/y`;
  const res = classifyLinks(text, { videos: store.data.videos, inTarget: new Set([A]) });
  assert.deepEqual(res.rows.map((r) => r.status), ['here', 'lib', 'new']);
  assert.equal(res.dup, 1);
  assert.deepEqual(res.lists, ['PLabcdefghijk']);
  assert.equal(res.invalid.length, 1);
  assert.deepEqual(idsToAdd(res), [C, 'zzzzzzzzzz9']);
  assert.deepEqual(idsToAdd(res, { skipLibrary: true }), ['zzzzzzzzzz9']);
});

test('v41: gestur & kontrol media — batas geser, WAV sunyi', async () => {
  const { swipeResult, damp } = await import('../js/swipe.js');
  assert.equal(swipeResult(90), 'right'); assert.equal(swipeResult(-90), 'left'); assert.equal(swipeResult(40), null);
  assert.equal(damp(100), 100); assert.equal(damp(-232), -(132 + 25));
  const { silentWav } = await import('../js/mediasession.js');
  const buf = silentWav(6, 8000);
  const dv = new DataView(buf);
  assert.equal(buf.byteLength, 44 + 48000);
  assert.equal(String.fromCharCode(...new Uint8Array(buf, 0, 4)), 'RIFF');
  assert.equal(dv.getUint32(24, true), 8000);
  assert.ok(new Uint8Array(buf, 44).every((x) => x === 128), 'isinya hening');
});
