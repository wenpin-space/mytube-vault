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
  assert.ok(SCENES.some((s) => s.id === 'city') && SCENES.some((s) => s.id === 'custom'));

  const { greeting, pomodoroNext, MODES } = await import('../js/lobby.js');
  assert.equal(greeting(7), 'Selamat pagi');
  assert.equal(greeting(13), 'Selamat siang');
  assert.equal(greeting(17), 'Selamat sore');
  assert.equal(greeting(22), 'Selamat malam');
  let st = { phase: 'work', remaining: 0, sessions: 0 };
  const seq = [];
  for (let i = 0; i < 8; i++) { st = pomodoroNext(st); seq.push(st.phase); }
  assert.deepEqual(seq, ['break', 'work', 'break', 'work', 'break', 'work', 'long', 'work']);
  assert.equal(st.sessions, 4);
  assert.ok(MODES.every((m) => SCENES.some((s) => s.id === m.scene)), 'tiap mode punya latar');
  assert.ok(MODES.every((m) => Object.keys(m.mix).every((k) => SOUNDS.some((s) => s.id === k))), 'tiap mode memakai suara yang ada');
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
  assert.ok(m1.waves > 0 && m1.birds > 0);
  const m2 = roomSoundMix({ loc: 'forest', weather: 'storm', time: 'night' });
  assert.ok(m2.rain && m2.thunder && !m2.crickets && !m2.birds);
  const m3 = roomSoundMix({ loc: 'ricefield', weather: 'clear', time: 'night' });
  assert.ok(m3.crickets && m3.stream && !m3.birds);
  for (const l of LOCATIONS) for (const w of WEATHERS) for (const t of ['morning', 'day', 'dusk', 'night']) {
    const m = roomSoundMix({ loc: l.id, weather: w.id, time: t });
    assert.ok(Object.keys(m).every((k) => SOUNDS.some((s) => s.id === k)), `${l.id}/${w.id}/${t}`);
    assert.ok(Object.values(m).every((v) => v > 0 && v <= 1));
  }
});
