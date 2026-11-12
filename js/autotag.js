// Tag otomatis dari judul video: Live, Cover, Remix, Acoustic, Lyrics, dll.
// Supaya tidak salah tangkap judul lagu (mis. "Live While We're Young"), kata kunci hanya dicari di
// bagian keterangan judul: di dalam (...) / [...] / 【...】, atau setelah pemisah " - ", " | ", " // ".
// Beberapa pola yang jelas (mis. "cover by", "lofi", "sped up") dicari di seluruh judul.

const RULES = [
  ['live', /\b(live|konser|concert|live session|live at|live from|live in)\b/i],
  ['cover', /\b(cover|covered)\b/i],
  ['remix', /\b(remix|rmx|bootleg|flip)\b/i],
  ['acoustic', /\b(acoustic|akustik|unplugged)\b/i],
  ['lyrics', /\b(lyrics?|lirik|lyric video)\b/i],
  ['instrumental', /\b(instrumental|inst\.?)\b/i],
  ['karaoke', /\b(karaoke|minus ?one)\b/i],
  ['slowed', /\b(slowed|reverb)\b/i],
  ['sped up', /\b(sped ?up|speed ?up|nightcore)\b/i],
];
const ANYWHERE = [
  ['cover', /\bcover(ed)? by\b/i],
  ['lofi', /\blo-?fi\b/i],
  ['karaoke', /\bkaraoke\b/i],
  ['sped up', /\b(sped ?up|nightcore)\b/i],
  ['slowed', /\bslowed\b/i],
];

/** Bagian keterangan judul (bukan nama lagunya). */
export function titleQualifiers(title = '') {
  const t = String(title);
  const parts = [];
  for (const m of t.matchAll(/[([【「]([^)\]】」]{1,80})[)\]】」]/g)) parts.push(m[1]);
  const seg = t.replace(/[([【「][^)\]】」]*[)\]】」]/g, ' ').split(/\s[-–—|]\s|\s\/\/\s|\s\|\s/);
  // "Artis - Judul - Live" → yang setelah dua bagian pertama adalah keterangan; "Judul | Live Session" → setelah yang pertama
  const from = /\s[-–—]\s/.test(t) && seg.length > 2 ? 2 : seg.length > 1 && /\s\|\s|\s\/\/\s/.test(t) ? 1 : seg.length;
  parts.push(...seg.slice(from));
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Tag yang disarankan untuk satu judul (murni). */
export function tagsFromTitle(title = '') {
  if (!title) return [];
  const out = new Set();
  const quals = titleQualifiers(title).join(' · ');
  for (const [tag, re] of RULES) if (quals && re.test(quals)) out.add(tag);
  for (const [tag, re] of ANYWHERE) if (re.test(title)) out.add(tag);
  return [...out];
}

/** Tag otomatis yang belum dimiliki video (perbandingan tanpa beda huruf besar/kecil). */
export function missingAutoTags(video) {
  const have = new Set((video.tags || []).map((t) => String(t).toLocaleLowerCase('id')));
  return tagsFromTitle(video.title).filter((t) => !have.has(t));
}

/**
 * Terapkan ke banyak video sekaligus (satu commit). Hasil: { videos, tags, undo() }.
 */
export function applyAutoTags(store, ids) {
  const changes = new Map();
  let tags = 0;
  for (const id of ids) {
    const v = store.data.videos[id];
    if (!v || !v.title) continue;
    const add = missingAutoTags(v);
    if (!add.length) continue;
    changes.set(id, { before: v.tags.slice(), after: [...v.tags, ...add] });
    tags += add.length;
  }
  if (changes.size) store.setTagsMany(new Map([...changes].map(([id, c]) => [id, c.after])));
  return {
    videos: changes.size,
    tags,
    undo: () => store.setTagsMany(new Map([...changes].map(([id, c]) => [id, c.before]))),
  };
}
