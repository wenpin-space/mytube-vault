// Logo aplikasi dalam beberapa gaya (v48). Bentuknya sama (simpul liontin + tombol putar), warnanya berbeda.
// "Otomatis" mengikuti tema (Malam di tema gelap, Siang di tema terang) dan berganti sendiri saat musim
// perayaan yang juga menghias Lobby: Imlek & Agustusan → Merah, Lebaran & Natal → Giok, Tahun Baru → Ungu.
// Yang ikut berganti: logo di bar atas dan favicon. Ikon di layar utama HP ditetapkan saat aplikasi
// dipasang (manifest), jadi tetap gaya Malam.

export const LOGO_STYLES = [
  ['auto', 'Otomatis'],
  ['malam', 'Malam'],
  ['siang', 'Siang'],
  ['merah', 'Merah'],
  ['giok', 'Giok'],
  ['ungu', 'Ungu'],
  ['polos', 'Polos'],
];
const SEASON_STYLE = { imlek: 'merah', merdeka: 'merah', lebaran: 'giok', natal: 'giok', tahunbaru: 'ungu' };

export const logoSrc = (style) => `icons/logo-${style}.svg`;

/** Gaya logo yang dipakai sekarang. pref: pilihan di Setelan; dark: tema gelap aktif; season: id musim atau null. */
export function logoFor(pref, dark, season = null) {
  if (pref && pref !== 'auto' && LOGO_STYLES.some(([k]) => k === pref)) return pref;
  if (season && SEASON_STYLE[season]) return SEASON_STYLE[season];
  return dark ? 'malam' : 'siang';
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

let pref = 'auto';
let season = null;
let seasonLoaded = false;

function paint() {
  const style = logoFor(pref, isDark(), season);
  const src = logoSrc(style);
  const mark = document.getElementById('brand-mark');
  if (mark && mark.getAttribute('src') !== src) mark.setAttribute('src', src);
  const fav = document.getElementById('favicon');
  if (fav && fav.getAttribute('href') !== src) fav.setAttribute('href', src);
  document.documentElement.dataset.logo = style;
}

/** Dipanggil setiap tema/setelan berubah. Musim dimuat sekali di latar (modulnya dipakai Lobby juga). */
export function applyLogo(stylePref) {
  pref = stylePref || 'auto';
  paint();
  if (!seasonLoaded) {
    seasonLoaded = true;
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', paint);
    import('./seasons.js').then((m) => { const s = m.seasonFor(new Date()); season = s ? s.id : null; paint(); }).catch(() => {});
  }
}
