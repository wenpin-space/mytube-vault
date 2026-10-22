// Metadata video tanpa API key:
//  - thumbnail: pola URL i.ytimg.com (selalu tersedia)
//  - judul & channel: oEmbed YouTube, cadangan noembed.com
//  - durasi: diambil dari player saat video diputar (lihat main.js)

export const thumbUrl = (id, quality = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

async function getJson(url, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMeta(id) {
  const w = encodeURIComponent(watchUrl(id));
  const sources = [
    `https://www.youtube.com/oembed?format=json&url=${w}`,
    `https://noembed.com/embed?url=${w}`,
  ];
  for (const src of sources) {
    const j = await getJson(src);
    if (j && !j.error && typeof j.title === 'string' && j.title.trim()) {
      return { title: j.title.trim(), channel: String(j.author_name || '').trim() };
    }
  }
  return null;
}

/** Antrean pengambilan judul dengan batas paralel, supaya tidak membanjiri jaringan. */
export function createMetaQueue(onResult, concurrency = 3) {
  const queue = [];
  const pending = new Set();
  let active = 0;
  function pump() {
    while (active < concurrency && queue.length) {
      const id = queue.shift();
      active++;
      fetchMeta(id)
        .then((meta) => onResult(id, meta))
        .catch(() => onResult(id, null))
        .finally(() => { active--; pending.delete(id); pump(); });
    }
  }
  return {
    add(ids) {
      for (const id of ids) {
        if (pending.has(id)) continue;
        pending.add(id);
        queue.push(id);
      }
      pump();
    },
    has: (id) => pending.has(id),
  };
}
