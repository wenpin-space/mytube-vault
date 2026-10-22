// Klien kecil GitHub Gist REST API (langsung dari browser, tanpa backend).
// Docs: https://docs.github.com/en/rest/gists

const API = 'https://api.github.com';

export class GistError extends Error {
  constructor(message, status = 0, code = 'HTTP') {
    super(message);
    this.name = 'GistError';
    this.status = status;
    this.code = code;
  }
}

async function request(token, path, { method = 'GET', body } = {}) {
  if (!token) throw new GistError('Token GitHub belum diisi.', 0, 'NO_TOKEN');
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GistError('Tidak bisa menghubungi GitHub. Periksa koneksi internet.', 0, 'NETWORK');
  }

  if (res.ok) {
    const data = res.status === 204 ? null : await res.json();
    return { data, headers: res.headers };
  }

  let detail = '';
  try { detail = (await res.json()).message || ''; } catch { /* abaikan */ }
  const low = detail.toLowerCase();
  if (res.status === 401) {
    throw new GistError('Token GitHub tidak valid, kedaluwarsa, atau sudah dicabut.', 401, 'TOKEN_INVALID');
  }
  if (res.status === 429 || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || low.includes('rate limit')))) {
    throw new GistError('Kena rate limit GitHub. Sinkron akan dicoba lagi nanti.', res.status, 'RATE_LIMIT');
  }
  if (res.status === 403) {
    throw new GistError('Token tidak punya izin untuk Gist. Buat token dengan scope "gist".', 403, 'FORBIDDEN');
  }
  if (res.status === 404) {
    throw new GistError('Gist tidak ditemukan — mungkin sudah dihapus, atau token tidak punya akses ke Gist ini.', 404, 'NOT_FOUND');
  }
  if (res.status === 422) throw new GistError(`GitHub menolak data: ${detail || 'tidak valid'}.`, 422, 'INVALID');
  if (res.status >= 500) throw new GistError('GitHub sedang bermasalah. Akan dicoba lagi nanti.', res.status, 'SERVER');
  throw new GistError(`GitHub error ${res.status}${detail ? `: ${detail}` : ''}`, res.status, 'HTTP');
}

/** Validasi token. Untuk classic token, cek juga scope "gist". */
export async function getUser(token) {
  const { data, headers } = await request(token, '/user');
  const scopes = headers.get('x-oauth-scopes'); // null untuk fine-grained token
  if (scopes !== null) {
    const list = scopes.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.includes('gist')) {
      throw new GistError('Token ini belum punya scope "gist". Buat ulang token dengan mencentang "gist".', 403, 'FORBIDDEN');
    }
  }
  return data;
}

export async function listGists(token) {
  const { data } = await request(token, '/gists?per_page=100');
  return data || [];
}

export async function getGist(token, id) {
  const { data } = await request(token, `/gists/${encodeURIComponent(id)}`);
  return data;
}

export async function createGist(token, fileName, content) {
  const { data } = await request(token, '/gists', {
    method: 'POST',
    body: { description: 'MyTube Vault backup', public: false, files: { [fileName]: { content } } },
  });
  return data;
}

/** PATCH juga otomatis membuat file kalau belum ada di Gist. */
export async function updateFile(token, id, fileName, content) {
  const { data } = await request(token, `/gists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { files: { [fileName]: { content } } },
  });
  return data;
}

export async function listCommits(token, id) {
  const { data } = await request(token, `/gists/${encodeURIComponent(id)}/commits?per_page=50`);
  return data || [];
}

export async function getRevision(token, id, sha) {
  const { data } = await request(token, `/gists/${encodeURIComponent(id)}/${encodeURIComponent(sha)}`);
  return data;
}

/** Isi file; kalau > ~1 MB GitHub memotongnya (truncated) → ambil dari raw_url. */
export async function readFile(gist, fileName) {
  const f = gist && gist.files ? gist.files[fileName] : null;
  if (!f) return null;
  if (f.truncated || f.content == null) {
    let res;
    try { res = await fetch(f.raw_url, { cache: 'no-store' }); } catch {
      throw new GistError('Tidak bisa mengambil isi file Gist.', 0, 'NETWORK');
    }
    if (!res.ok) throw new GistError('Gagal mengambil isi file Gist.', res.status, 'HTTP');
    return res.text();
  }
  return f.content;
}
