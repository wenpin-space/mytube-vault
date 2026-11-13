// Import playlist YouTube TANPA API key (v41): player YouTube tersembunyi memuat playlist-nya, lalu
// daftar ID video dibaca lewat getPlaylist(). Batasnya ±200 video pertama (batas player YouTube);
// judul diambil sesudahnya seperti saat menempel link biasa.

import { loadApi } from './player.js';

/** Judul playlist lewat oEmbed (tanpa key). null bila tidak bisa. */
export async function playlistTitle(listId) {
  try {
    const u = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/playlist?list=${listId}`)}`;
    const res = await fetch(u);
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j.title === 'string' && j.title.trim() ? { title: j.title.trim(), channel: String(j.author_name || '').trim() } : null;
  } catch { return null; }
}

/** Daftar ID video di playlist publik/unlisted. Gagal → Error dengan pesan yang bisa ditampilkan. */
export async function playlistIdsViaPlayer(listId, { timeout = 15000 } = {}) {
  const YT = await loadApi();
  const host = document.createElement('div');
  const wrap = document.createElement('div');
  wrap.className = 'yt-probe';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;';
  wrap.appendChild(host);
  document.body.appendChild(wrap);
  return new Promise((resolve, reject) => {
    let p = null;
    let poll = 0;
    let done = false;
    const finish = (err, ids) => {
      if (done) return;
      done = true;
      clearInterval(poll); clearTimeout(timer);
      try { if (p && p.destroy) p.destroy(); } catch { /* abaikan */ }
      wrap.remove();
      if (err) reject(err); else resolve(ids);
    };
    const timer = setTimeout(() => finish(new Error('Playlist tidak bisa dibaca (privat, kosong, atau koneksi lambat). Coba lagi, atau pakai API key di Setelan untuk playlist besar.')), timeout);
    const vars = { listType: 'playlist', list: listId, autoplay: 0, controls: 0, mute: 1, playsinline: 1 };
    if (location.origin && location.origin !== 'null') vars.origin = location.origin;
    p = new YT.Player(host, {
      width: 320, height: 180, playerVars: vars,
      events: {
        onReady: () => {
          try { p.cuePlaylist({ listType: 'playlist', list: listId }); } catch { /* sebagian versi sudah memuatnya dari playerVars */ }
          poll = setInterval(() => {
            let ids = null;
            try { ids = p.getPlaylist && p.getPlaylist(); } catch { ids = null; }
            if (Array.isArray(ids) && ids.length) finish(null, ids.filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x)));
          }, 300);
        },
        // kode error bisa juga soal video pertama (mis. tidak boleh di-embed): beri waktu daftar tetap terbaca
        onError: () => setTimeout(() => finish(new Error('Playlist tidak ditemukan atau privat.')), 2500),
      },
    });
  });
}
