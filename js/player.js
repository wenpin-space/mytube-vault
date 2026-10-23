// Player advanced di atas YouTube IFrame API.
//
// queue  : daftar {key, youtubeId} yang sedang diputar (salinan dari tampilan saat Play ditekan)
// order  : urutan indeks queue (identitas, atau acak saat shuffle)
// pos    : posisi sekarang di dalam order
// Mengacak hanya mengubah `order`, sehingga mematikan shuffle bisa kembali ke urutan asli.

import { shuffleArray } from './utils.js';

let apiPromise = null;

function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    const fail = (msg) => { clearTimeout(timer); apiPromise = null; s.remove(); reject(new Error(msg)); };
    // Pemblokir iklan/jaringan lambat bisa membuat script tidak pernah selesai → jangan menunggu selamanya.
    const timer = setTimeout(() => fail('Player YouTube tidak termuat (koneksi lambat atau diblokir ekstensi). Coba lagi, atau buka di YouTube.'), 12000);
    s.onerror = () => fail('Gagal memuat player YouTube. Periksa koneksi internet atau ekstensi pemblokir.');
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); if (typeof prevReady === 'function') prevReady(); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const ERRORS = {
  2: 'ID video tidak valid.',
  5: 'Video tidak bisa diputar di player HTML5.',
  100: 'Video tidak ditemukan, sudah dihapus, atau privat.',
  101: 'Pemilik video tidak mengizinkan video ini diputar di luar YouTube.',
  150: 'Pemilik video tidak mengizinkan video ini diputar di luar YouTube.',
  153: 'Player YouTube menolak halaman ini — buka aplikasi lewat http(s), bukan file://.',
};

export class Player {
  constructor(hostId = 'yt-player') {
    this.hostId = hostId;
    this.yt = null;
    this.ready = null;
    this.queue = [];
    this.order = [];
    this.pos = -1;
    this.state = 'idle'; // idle|loading|playing|paused|buffering|ended|error
    this.error = null;
    this.shuffle = false;
    this.repeat = 'all';
    this.autoNext = true;
    this.errorStreak = 0;
    this.skipTimer = null;
    this.pauseIntentAt = 0; // kapan jeda terakhir diminta oleh pengguna/aplikasi (bukan oleh YouTube)
    this.rate = 1;
    this.stopAfterCurrent = false; // timer tidur "akhir lagu ini"
    this.startAt = 0; // detik awal untuk lagu yang sedang dimuat (lanjut dari posisi terakhir)
    this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) {
    for (const fn of this.listeners) {
      try { fn(type, data); } catch (e) { console.error(e); }
    }
  }

  get current() { return this.pos >= 0 && this.pos < this.order.length ? this.queue[this.order[this.pos]] : null; }
  get isPlaying() { return this.state === 'playing' || this.state === 'buffering'; }

  configure({ shuffle, repeat, autoNext } = {}) {
    if (['off', 'one', 'all'].includes(repeat)) this.repeat = repeat;
    this.autoNext = autoNext !== false;
    if (!!shuffle !== this.shuffle) this.setShuffle(!!shuffle);
    this.emit('state');
  }

  async ensure() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const YT = await loadApi();
      await new Promise((resolve) => {
        const vars = { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, enablejsapi: 1 };
        if (location.origin && location.origin !== 'null') vars.origin = location.origin;
        this.yt = new YT.Player(this.hostId, {
          width: '100%',
          height: '100%',
          playerVars: vars,
          events: {
            onReady: () => {
              try { const f = this.yt.getIframe(); f.title = 'Player video YouTube'; f.setAttribute('allow', `${f.getAttribute('allow') || ''}; picture-in-picture`); } catch { /* abaikan */ }
              resolve();
            },
            onStateChange: (e) => this.onState(e),
            onError: (e) => this.onError(e),
          },
        });
      });
    })();
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  }

  /** Mulai memutar daftar entri dari indeks tertentu. */
  async playList(entries, startIndex = 0) {
    if (!entries.length) return;
    this.queue = entries.map((e) => ({ key: e.key, youtubeId: e.youtubeId }));
    const start = Math.min(Math.max(0, startIndex), this.queue.length - 1);
    const idx = [...this.queue.keys()];
    if (this.shuffle) {
      this.order = [start, ...shuffleArray(idx.filter((i) => i !== start))];
      this.pos = 0;
    } else {
      this.order = idx;
      this.pos = start;
    }
    this.errorStreak = 0;
    this.emit('queue');
    await this.loadCurrent();
  }

  /** startAt null → tanyakan resumeLookup (lanjut dari posisi terakhir untuk video panjang). */
  async loadCurrent(startAt = null) {
    const cur = this.current;
    if (!cur) return;
    if (startAt == null) startAt = typeof this.resumeLookup === 'function' ? (this.resumeLookup(cur.youtubeId) || 0) : 0;
    this.startAt = startAt;
    clearTimeout(this.skipTimer);
    this.error = null;
    this.state = 'loading';
    this.emit('track', cur);
    try {
      await this.ensure();
    } catch (e) {
      this.error = e.message;
      this.state = 'error';
      this.emit('error');
      return;
    }
    if (this.current !== cur) return; // user sudah pindah lagu saat API dimuat
    if (this.startAt > 0) this.yt.loadVideoById({ videoId: cur.youtubeId, startSeconds: this.startAt });
    else this.yt.loadVideoById(cur.youtubeId);
  }

  onState(e) {
    const S = window.YT.PlayerState;
    switch (e.data) {
      case S.PLAYING:
        if (this.rate !== 1) { try { if (this.yt.getPlaybackRate() !== this.rate) this.yt.setPlaybackRate(this.rate); } catch { /* abaikan */ } }
        this.state = 'playing';
        this.error = null;
        this.errorStreak = 0;
        this.emit('state');
        this.emit('playing', this.current);
        break;
      case S.PAUSED: this.state = 'paused'; this.emit('state'); break;
      case S.CUED:
      case -1: // belum mulai (mis. autoplay ditahan browser saat aplikasi di latar belakang)
        if (this.state === 'loading') this.emit('unstarted', this.current);
        break;
      case S.BUFFERING: this.state = 'buffering'; this.emit('state'); break;
      case S.ENDED:
        this.state = 'ended';
        this.emit('ended', this.current);
        if (this.stopAfterCurrent) { this.stopAfterCurrent = false; this.emit('sleep'); this.emit('state'); break; }
        if (this.repeat === 'one') { this.yt.seekTo(0, true); this.yt.playVideo(); } else if (this.autoNext) this.next(true);
        else this.emit('state');
        break;
      default: break;
    }
  }

  onError(e) {
    const cur = this.current;
    this.error = ERRORS[e.data] || `Video tidak bisa diputar (kode ${e.data}).`;
    this.state = 'error';
    this.errorStreak++;
    // Lewati otomatis, tapi jangan berputar tanpa henti kalau semua video bermasalah.
    const skipping = this.autoNext && this.order.length > 1 && this.errorStreak < this.order.length;
    this.emit('error', { skipping });
    if (skipping) {
      clearTimeout(this.skipTimer);
      this.skipTimer = setTimeout(() => {
        if (this.current === cur && this.state === 'error') this.next(true);
      }, 2500);
    }
  }

  next(auto = false) {
    if (!this.order.length) return;
    if (this.pos + 1 < this.order.length) {
      this.pos++;
    } else if (this.repeat === 'all' || this.repeat === 'one') {
      if (this.shuffle && this.order.length > 1) {
        const last = this.order[this.pos];
        const o = shuffleArray([...this.queue.keys()].filter((i) => this.order.includes(i)));
        if (o[0] === last) [o[0], o[1]] = [o[1], o[0]];
        this.order = o;
      }
      this.pos = 0;
    } else {
      if (auto) { this.state = 'ended'; this.emit('state'); } else this.emit('end-of-queue');
      return;
    }
    this.loadCurrent();
  }

  prev() {
    if (!this.order.length) return;
    if (this.time() > 3) { this.seek(0); return; }
    if (this.pos > 0) this.pos--;
    else if (this.repeat === 'all') this.pos = this.order.length - 1;
    else { this.seek(0); return; }
    this.loadCurrent();
  }

  toggle() {
    if (!this.yt || !this.current) return;
    if (this.isPlaying) { this.pauseIntentAt = Date.now(); this.yt.pauseVideo(); }
    else if (this.state === 'ended') { this.yt.seekTo(0, true); this.yt.playVideo(); } else this.yt.playVideo();
  }

  setShuffle(on) {
    this.shuffle = on;
    if (!this.order.length) { this.emit('queue'); return; }
    const curIdx = this.order[this.pos];
    const alive = [...this.queue.keys()].filter((i) => this.order.includes(i));
    if (on) {
      this.order = [curIdx, ...shuffleArray(alive.filter((i) => i !== curIdx))];
      this.pos = 0;
    } else {
      this.order = alive;
      this.pos = Math.max(0, this.order.indexOf(curIdx));
    }
    this.emit('queue');
  }

  setRepeat(mode) { this.repeat = mode; this.emit('state'); }

  setRate(rate) {
    this.rate = rate;
    try { if (this.yt) this.yt.setPlaybackRate(rate); } catch { /* abaikan */ }
    this.emit('state');
  }
  pause() { if (this.isPlaying) { this.pauseIntentAt = Date.now(); try { this.yt.pauseVideo(); } catch { /* abaikan */ } } }
  volume() { try { return this.yt ? this.yt.getVolume() : 100; } catch { return 100; } }
  setVolume(v) { try { if (this.yt) { this.yt.setVolume(Math.max(0, Math.min(100, v))); if (v > 0) this.yt.unMute(); } } catch { /* abaikan */ } }
  isMuted() { try { return !!(this.yt && this.yt.isMuted()); } catch { return false; } }
  toggleMute() { try { if (!this.yt) return false; if (this.yt.isMuted()) this.yt.unMute(); else this.yt.mute(); return !this.yt.isMuted(); } catch { return false; } }

  jumpTo(orderPos) {
    if (orderPos < 0 || orderPos >= this.order.length) return;
    this.pos = orderPos;
    this.loadCurrent();
  }

  /**
   * Samakan antrean dengan isi sumbernya (mis. playlist yang sedang diputar) setelah berubah:
   * lagu baru ikut masuk, lagu yang dihapus keluar dari "berikutnya". Lagu sekarang tidak diganggu,
   * begitu juga lagu yang ditambahkan manual lewat "Putar berikutnya"/"Tambah ke antrean".
   */
  syncQueue(entries) {
    if (!this.order.length) return false;
    const curQi = this.order[this.pos];
    const want = new Map(entries.map((e, i) => [e.key, i]));
    let changed = false;

    // 1) keluarkan lagu sumber yang sudah tidak ada
    const before = this.order.length;
    this.order = this.order.filter((qi) => qi === curQi || this.queue[qi].manual || want.has(this.queue[qi].key));
    if (this.order.length !== before) changed = true;

    // 2) masukkan lagu baru
    const have = new Set(this.order.map((qi) => this.queue[qi].key));
    entries.forEach((e, i) => {
      if (have.has(e.key)) return;
      this.queue.push({ key: e.key, youtubeId: e.youtubeId });
      const qi = this.queue.length - 1;
      const pos = this.order.indexOf(curQi);
      let at;
      if (this.shuffle) {
        at = pos + 1 + Math.floor(Math.random() * (this.order.length - pos)); // acak di antara yang belum diputar
      } else {
        // tepat setelah lagu yang mendahuluinya di sumber, supaya urutan playlist terjaga
        at = this.order.length;
        for (let j = i - 1; j >= 0; j--) {
          const k = this.order.findIndex((q) => this.queue[q].key === entries[j].key);
          if (k >= 0) { at = k + 1; break; }
        }
        if (i === 0) at = this.order.findIndex((q) => !this.queue[q].manual);
        if (at < 0) at = this.order.length;
      }
      this.order.splice(at, 0, qi);
      have.add(e.key);
      changed = true;
    });
    this.pos = this.order.indexOf(curQi);
    if (changed) this.emit('queue');
    return changed;
  }

  /** Sisipkan tepat setelah video yang sedang diputar. */
  playNext(entry) {
    if (!this.order.length) { this.playList([entry], 0); return; }
    this.queue.push({ key: entry.key, youtubeId: entry.youtubeId, manual: true });
    this.order.splice(this.pos + 1, 0, this.queue.length - 1);
    this.emit('queue');
  }

  addToQueue(entry) {
    if (!this.order.length) { this.playList([entry], 0); return; }
    this.queue.push({ key: entry.key, youtubeId: entry.youtubeId, manual: true });
    this.order.push(this.queue.length - 1);
    this.emit('queue');
  }

  removeAt(orderPos) {
    if (orderPos === this.pos || orderPos < 0 || orderPos >= this.order.length) return;
    this.order.splice(orderPos, 1);
    if (orderPos < this.pos) this.pos--;
    this.emit('queue');
  }

  /** Lanjutkan pemutaran tanpa dianggap aksi pengguna (dipakai mode latar belakang). */
  resume() { try { if (this.yt && this.current) this.yt.playVideo(); } catch { /* abaikan */ } }

  stop() {
    this.pauseIntentAt = Date.now();
    clearTimeout(this.skipTimer);
    try { if (this.yt) this.yt.stopVideo(); } catch { /* abaikan */ }
    this.queue = [];
    this.order = [];
    this.pos = -1;
    this.state = 'idle';
    this.error = null;
    this.emit('track', null);
    this.emit('queue');
  }

  upcoming() {
    return this.order.slice(this.pos + 1).map((qi, k) => ({ pos: this.pos + 1 + k, item: this.queue[qi] }));
  }

  time() { try { return (this.yt && this.yt.getCurrentTime && this.yt.getCurrentTime()) || 0; } catch { return 0; } }
  duration() { try { return (this.yt && this.yt.getDuration && this.yt.getDuration()) || 0; } catch { return 0; } }
  seek(sec) { try { if (this.yt) this.yt.seekTo(sec, true); } catch { /* abaikan */ } }
  videoData() { try { return (this.yt && this.yt.getVideoData && this.yt.getVideoData()) || null; } catch { return null; } }
}
