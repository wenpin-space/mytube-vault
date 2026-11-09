// Cuaca & waktu nyata untuk Lobby.
//  - cuaca + jam terbit/terbenam: Open-Meteo (gratis, tanpa key; data CC BY 4.0 → kredit di panel Suasana)
//  - cari kota: Open-Meteo Geocoding
//  - nama kota dari GPS: BigDataCloud reverse geocode (gratis, khusus dipanggil dari browser)
// Koordinat dibulatkan ±1 km dan hanya disimpan di perangkat ini (tidak ikut backup Gist).

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
export const STALE_MS = 25 * 60 * 1000; // data cuaca dianggap basi setelah ±25 menit

/** Kode cuaca WMO → 6 cuaca Lobby. */
export function wmoToWeather(code) {
  const c = Number(code);
  if (c === 0 || c === 1) return 'clear';
  if (c === 2 || c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95 && c <= 99) return 'storm';
  return 'cloudy';
}

/** Keterangan singkat (huruf kecil) untuk label lokasi, mis. "hujan ringan". */
export function describeWmo(code) {
  const c = Number(code);
  const map = {
    0: 'cerah', 1: 'cerah berawan', 2: 'berawan', 3: 'mendung', 45: 'berkabut', 48: 'berkabut',
    51: 'gerimis', 53: 'gerimis', 55: 'gerimis', 56: 'gerimis', 57: 'gerimis',
    61: 'hujan ringan', 63: 'hujan', 65: 'hujan lebat', 66: 'hujan', 67: 'hujan lebat',
    71: 'salju', 73: 'salju', 75: 'salju lebat', 77: 'salju', 80: 'hujan ringan', 81: 'hujan', 82: 'hujan lebat',
    85: 'salju', 86: 'salju lebat', 95: 'badai petir', 96: 'badai petir', 99: 'badai petir',
  };
  return map[c] || 'berawan';
}

/** Menit sejak tengah malam di lokasi itu (pakai selisih zona waktu dari Open-Meteo). */
export function localMinutes(offsetSec = 0, now = Date.now()) {
  const m = Math.floor((now / 1000 + offsetSec) / 60) % 1440;
  return m < 0 ? m + 1440 : m;
}

/**
 * Pagi/siang/senja/malam dari jam terbit & terbenam matahari (menit lokal).
 * Pagi = 40 menit sebelum terbit s.d. 3 jam setelahnya; senja = 90 menit sebelum terbenam s.d. 40 menit sesudahnya.
 */
export function timeFromSun(nowMin, sunrise, sunset) {
  if (sunrise == null || sunset == null) return null;
  if (nowMin < sunrise - 40 || nowMin >= sunset + 40) return 'night';
  if (nowMin < sunrise + 180) return 'morning';
  if (nowMin >= sunset - 90) return 'dusk';
  return 'day';
}

/** Kapan waktu (pagi/siang/senja/malam) berikutnya dimulai, dalam menit dari sekarang. */
export function minutesToNextTime(nowMin, sunrise, sunset) {
  if (sunrise == null || sunset == null) return Infinity;
  const marks = [sunrise - 40, sunrise + 180, sunset - 90, sunset + 40].map((x) => ((x % 1440) + 1440) % 1440);
  return Math.min(...marks.map((x) => { const d = x - nowMin; return d > 0 ? d : d + 1440; }));
}

/** Ambil isi jawaban Open-Meteo yang kita perlukan (murni, mudah diuji). */
export function parseForecast(j, now = Date.now()) {
  const cur = (j && j.current) || {};
  const d = (j && j.daily) || {};
  const hm = (s) => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  if (cur.weather_code == null) throw new Error('Data cuaca tidak lengkap.');
  return {
    at: now,
    code: Number(cur.weather_code),
    temp: Math.round(Number(cur.temperature_2m)),
    offset: Number(j.utc_offset_seconds) || 0,
    sunrise: hm(d.sunrise && d.sunrise[0]),
    sunset: hm(d.sunset && d.sunset[0]),
  };
}

/** Suasana Lobby dari data cuaca (null kalau belum ada data). */
export function liveScene(wx, now = Date.now()) {
  if (!wx || wx.code == null) return null;
  return { weather: wmoToWeather(wx.code), time: timeFromSun(localMinutes(wx.offset, now), wx.sunrise, wx.sunset) };
}

export const round2 = (x) => Math.round(Number(x) * 100) / 100;

async function getJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'waktu habis' : (navigator.onLine === false ? 'offline' : e.message || 'jaringan'));
  } finally { clearTimeout(timer); }
}

export async function fetchWeather(lat, lon) {
  const q = new URLSearchParams({ latitude: round2(lat), longitude: round2(lon), current: 'temperature_2m,weather_code', daily: 'sunrise,sunset', timezone: 'auto', forecast_days: '1' });
  return parseForecast(await getJson(`${FORECAST}?${q}`));
}

/** Cari kota → [{name, label, lat, lon}] */
export async function searchCity(name, lang = 'id') {
  const q = new URLSearchParams({ name: String(name).trim(), count: '6', language: lang, format: 'json' });
  const j = await getJson(`${GEOCODE}?${q}`);
  return (j.results || []).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : '', r.country].filter(Boolean).join(', '),
    lat: round2(r.latitude), lon: round2(r.longitude),
  }));
}

/** Nama kota dari koordinat (cadangan: "Lokasimu"). */
export async function placeName(lat, lon, lang = 'id') {
  try {
    const q = new URLSearchParams({ latitude: round2(lat), longitude: round2(lon), localityLanguage: lang });
    const j = await getJson(`${REVERSE}?${q}`, 6000);
    return j.city || j.locality || j.principalSubdivision || '';
  } catch { return ''; }
}

/** Lokasi perangkat (minta izin sekali). */
export function geolocate() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('Browser ini tidak mendukung lokasi.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) }),
      (e) => reject(new Error(e.code === 1 ? 'Izin lokasi ditolak. Cari kotamu secara manual.' : 'Lokasi tidak bisa ditentukan. Cari kotamu secara manual.')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30 * 60 * 1000 },
    );
  });
}
