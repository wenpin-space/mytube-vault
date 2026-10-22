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
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('Gagal memuat player YouTube. Periksa koneksi internet.'));
    };
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
            onReady: () => resolve(),
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

  async loadCurrent() {
    const cur = this.current;
    if (!cur) return;
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
    this.yt.loadVideoById(cur.youtubeId);
  }

  onState(e) {
    const S = window.YT.PlayerState;
    switch (e.data) {
      case S.PLAYING:
        this.state = 'playing';
        this.error = null;
        this.errorStreak = 0;
        this.emit('state');
        this.emit('playing', this.current);
        break;
      case S.PAUSED: this.state = 'paused'; this.emit('state'); break;
      case S.BUFFERING: this.state = 'buffering'; this.emit('state'); break;
      case S.ENDED:
        this.state = 'ended';
        this.emit('ended', this.current);
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
    if (this.isPlaying) this.yt.pauseVideo();
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

  jumpTo(orderPos) {
    if (orderPos < 0 || orderPos >= this.order.length) return;
    this.pos = orderPos;
    this.loadCurrent();
  }

  /** Sisipkan tepat setelah video yang sedang diputar. */
  playNext(entry) {
    if (!this.order.length) { this.playList([entry], 0); return; }
    this.queue.push({ key: entry.key, youtubeId: entry.youtubeId });
    this.order.splice(this.pos + 1, 0, this.queue.length - 1);
    this.emit('queue');
  }

  addToQueue(entry) {
    if (!this.order.length) { this.playList([entry], 0); return; }
    this.queue.push({ key: entry.key, youtubeId: entry.youtubeId });
    this.order.push(this.queue.length - 1);
    this.emit('queue');
  }

  removeAt(orderPos) {
    if (orderPos === this.pos || orderPos < 0 || orderPos >= this.order.length) return;
    this.order.splice(orderPos, 1);
    if (orderPos < this.pos) this.pos--;
    this.emit('queue');
  }

  stop() {
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
