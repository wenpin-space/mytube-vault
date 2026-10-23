// Dialog Pengaturan: Cloud Sync · Backup & Riwayat · Umum.

import { store, getToken, normalizeData, VAULT_FILE } from './store.js';
import { sync } from './sync.js';
import { buildEnvelope, parseEnvelope, summarize } from './envelope.js';
import { modal, toast, confirmDialog, passphraseDialog, textInputDialog } from './dialogs.js';
import { icon } from './icons.js';
import { escapeHtml, formatDateTime, timeAgo, downloadText, todayStamp, copyText, formatBytes } from './utils.js';
import { syncLabel } from './ui.js';
import { getApiKey, setApiKey } from './sources.js';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=MyTube%20Vault';
const TABS = [['cloud', 'Cloud Sync'], ['backup', 'Backup & Riwayat'], ['general', 'Umum']];

export async function openSettings(initialTab = 'cloud') {
  let cleanup = () => {};
  await modal({
    title: 'Pengaturan',
    wide: true,
    body: '<div class="tabs" role="tablist"></div><div class="tab-panel"></div>',
    onOpen(body) {
      const tabsEl = body.querySelector('.tabs');
      const panel = body.querySelector('.tab-panel');
      const st = { tab: initialTab, changeToken: false, gists: null, history: null, busy: false, drawnConnected: null };

      const draw = () => {
        tabsEl.innerHTML = TABS.map(([id, label]) =>
          `<button type="button" role="tab" aria-selected="${id === st.tab}" class="tab${id === st.tab ? ' active' : ''}" data-tab="${id}">${label}</button>`).join('');
        if (st.tab === 'cloud') drawCloud();
        else if (st.tab === 'backup') drawBackup();
        else drawGeneral();
      };

      // ---------- Cloud ----------
      function drawCloud() {
        const c = store.cloud;
        st.drawnConnected = sync.connected;
        if (!sync.connected) {
          if (!getToken() || st.changeToken) {
            panel.innerHTML = `
              <section class="card">
                <h3>${icon('cloud')} Backup otomatis ke GitHub Gist</h3>
                <p class="muted">Playlist disimpan sebagai file <code>${VAULT_FILE}</code> di Gist <b>private</b> milikmu dan diperbarui otomatis setiap ada perubahan. Tidak butuh server.</p>
                <ol class="steps">
                  <li>Buat token GitHub dengan izin <b>gist</b> saja — <a href="${TOKEN_URL}" target="_blank" rel="noopener">buat classic token ${icon('external')}</a> (scope “gist” sudah tercentang), atau fine-grained token dengan izin akun <i>Gists: Read and write</i>.</li>
                  <li>Tempel token di bawah, lalu pilih buat Gist baru atau pakai Gist yang sudah ada.</li>
                </ol>
                <label class="field"><span>GitHub token</span>
                  <input type="password" id="gh-token" autocomplete="off" spellcheck="false" placeholder="ghp_… atau github_pat_…"></label>
                <div class="row"><button type="button" class="btn btn-primary" data-act="verify">Hubungkan</button>
                  ${st.changeToken ? '<button type="button" class="btn" data-act="cancel-token">Batal</button>' : ''}</div>
                <p class="hint">Token hanya disimpan di browser ini dan hanya dikirim ke api.github.com. Pakai di perangkat pribadi.</p>
              </section>`;
            const input = panel.querySelector('#gh-token');
            input.focus();
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); panel.querySelector('[data-act=verify]').click(); }
            });
            return;
          }
          panel.innerHTML = `
            <section class="card">
              <h3>Pilih tempat backup</h3>
              <p class="muted">Token tersimpan${sync.user ? ` untuk <b>@${escapeHtml(sync.user)}</b>` : ''}. <button type="button" class="link-btn" data-act="change-token">Ganti token</button></p>
              <div class="choice-grid">
                <button type="button" class="choice" data-act="create-gist">${icon('plus')}<b>Buat Gist baru</b><span>Gist private baru berisi data di perangkat ini.</span></button>
                <button type="button" class="choice" data-act="list-gists">${icon('cloud')}<b>Pakai Gist yang ada</b><span>Mis. backup dari perangkat atau browser lain.</span></button>
              </div>
              <div class="gist-list">${st.gists ? renderGists() : ''}</div>
              <details class="manual"><summary>Masukkan ID / URL Gist manual</summary>
                <div class="row"><input type="text" id="gist-id" placeholder="https://gist.github.com/nama/abc123…" spellcheck="false">
                <button type="button" class="btn" data-act="use-gist-manual">Pakai</button></div></details>
            </section>`;
          return;
        }
        const s = store.data.settings.sync;
        const enc = s.encryptionEnabled;
        panel.innerHTML = `
          <section class="card">
            <div class="status-line" data-status></div>
            <dl class="kv">
              <dt>Akun</dt><dd>${c.login ? `@${escapeHtml(c.login)}` : '—'}</dd>
              <dt>Gist</dt><dd><a href="https://gist.github.com/${escapeHtml(c.gistId)}" target="_blank" rel="noopener">${escapeHtml(c.gistId.slice(0, 12))}… ${icon('external')}</a></dd>
              <dt>File</dt><dd><code>${escapeHtml(c.fileName)}</code></dd>
              <dt>Sinkron terakhir</dt><dd data-last></dd>
            </dl>
            <div class="row wrap">
              <button type="button" class="btn btn-primary" data-act="sync-now">${icon('refresh')}Sinkron sekarang</button>
              <button type="button" class="btn" data-act="pull">${icon('download')}Tarik dari cloud</button>
              <button type="button" class="btn btn-danger-ghost" data-act="disconnect">Putuskan koneksi</button>
            </div>
          </section>
          <section class="card">
            <h3>Auto-sync</h3>
            <label class="check"><input type="checkbox" data-set="autoSync" ${s.autoSync ? 'checked' : ''}><span>Simpan ke cloud otomatis setiap ada perubahan</span></label>
            <label class="field inline"><span>Jeda sebelum menyimpan</span>
              <select data-set="debounceMs">${[1000, 2000, 5000, 10000, 30000].map((ms) => `<option value="${ms}"${ms === s.debounceMs ? ' selected' : ''}>${ms / 1000} detik</option>`).join('')}</select></label>
            <p class="hint">Perubahan dikumpulkan selama jeda ini lalu dikirim sekaligus. Ada juga jarak minimal ±8 detik antar-penyimpanan supaya tidak kena rate limit GitHub. Saat offline, perubahan menunggu dan dikirim otomatis begitu online.</p>
          </section>
          <section class="card">
            <h3>${icon('lock')} Enkripsi <span class="pill${enc ? ' ok' : ''}">${enc ? 'Aktif' : 'Nonaktif'}</span></h3>
            <p class="muted">${enc
    ? 'Isi Gist dienkripsi (AES-GCM 256, kunci diturunkan dari passphrase lewat PBKDF2). Tanpa passphrase, backup tidak bisa dibuka — termasuk oleh kamu sendiri.'
    : 'Saat ini Gist berisi JSON biasa (tetap private). Aktifkan supaya isinya tidak terbaca walaupun Gist bocor.'}</p>
            <div class="row wrap">${enc
    ? `<button type="button" class="btn" data-act="change-pass">Ganti passphrase</button>
       <button type="button" class="btn btn-danger-ghost" data-act="disable-enc">Nonaktifkan</button>
       ${sync.passphrase ? '<button type="button" class="btn" data-act="forget-pass">Lupakan passphrase di perangkat ini</button>' : ''}`
    : '<button type="button" class="btn" data-act="enable-enc">Aktifkan enkripsi</button>'}</div>
          </section>`;
        updateStatus();
      }

      function updateStatus() {
        const el = panel.querySelector('[data-status]');
        if (!el) return;
        const [ic, label, cls] = syncLabel(sync.status);
        el.className = `status-line ${cls}`;
        el.innerHTML = `${icon(ic)}<b>${label}</b>${sync.message ? `<span class="muted">${escapeHtml(sync.message)}</span>` : ''}`;
        const last = panel.querySelector('[data-last]');
        const c = store.cloud;
        if (last) last.textContent = c.lastSyncedAt ? `${formatDateTime(c.lastSyncedAt)} (${timeAgo(c.lastSyncedAt)})` : 'Belum pernah';
      }

      function renderGists() {
        if (!st.gists.length) return '<p class="muted">Belum ada Gist di akun ini. Pilih “Buat Gist baru”.</p>';
        return `<p class="muted small">Gist yang berisi <code>${VAULT_FILE}</code> ditandai <b>vault</b>.</p>
          <div class="list-box">${st.gists.map((g) => `
            <button type="button" class="gist-item" data-act="use-gist" data-id="${escapeHtml(g.id)}">
              <span class="gist-main"><b>${escapeHtml(g.description || g.files[0] || g.id)}</b>
                <span class="muted small">${escapeHtml(g.files.slice(0, 3).join(', '))}${g.files.length > 3 ? '…' : ''} · ${timeAgo(g.updatedAt)}</span></span>
              ${g.hasVault ? '<span class="pill ok">vault</span>' : ''}${g.public ? '<span class="pill warn">publik</span>' : ''}
            </button>`).join('')}</div>`;
      }

      // ---------- Backup ----------
      function drawBackup() {
        const snap = store.getSnapshot();
        const snapSum = snap ? summarize(snap.data) : null;
        panel.innerHTML = `
          <section class="card">
            <h3>Backup manual</h3>
            <p class="muted">Cadangan darurat di luar auto-sync. Formatnya sama dengan file di Gist, jadi bisa di-import di perangkat mana pun.</p>
            <div class="row wrap">
              <button type="button" class="btn" data-act="export">${icon('download')}Download JSON</button>
              <button type="button" class="btn" data-act="copy">${icon('copy')}Salin teks backup</button>
              <button type="button" class="btn" data-act="import-file">${icon('upload')}Import file</button>
              <button type="button" class="btn" data-act="import-text">Tempel teks backup</button>
            </div>
            <input type="file" id="import-file" accept=".json,application/json,text/plain" hidden>
          </section>
          ${snap ? `<section class="card">
            <h3>Snapshot lokal</h3>
            <p class="muted">Salinan otomatis sebelum data terakhir kali ditimpa (restore, import, atau data dari cloud): ${snapSum.playlists} playlist, ${snapSum.videos} video — disimpan ${formatDateTime(snap.savedAt)}.</p>
            <div class="row"><button type="button" class="btn" data-act="snap-restore">Pulihkan snapshot</button></div>
          </section>` : ''}
          <section class="card">
            <h3>${icon('history')} Riwayat versi cloud</h3>
            ${sync.connected
    ? (st.history ? renderHistory() : `<p class="muted">Setiap penyimpanan ke Gist membuat revisi baru. Kamu bisa memulihkan versi mana pun — versi saat ini tetap tersimpan di riwayat.</p>
              <button type="button" class="btn" data-act="load-history">Muat riwayat</button>`)
    : '<p class="muted">Hubungkan GitHub Gist di tab Cloud Sync untuk memakai riwayat versi.</p>'}
          </section>`;
      }

      function renderHistory() {
        if (!st.history.length) return '<p class="muted">Belum ada riwayat.</p>';
        return `<div class="list-box">${st.history.map((h, i) => `
          <div class="hist-row">
            <div class="hist-main"><b>${escapeHtml(formatDateTime(h.committed_at))}</b>
              <span class="muted small">${timeAgo(h.committed_at)}${h.change_status ? ` · +${h.change_status.additions || 0} / −${h.change_status.deletions || 0} baris` : ''}</span></div>
            ${i === 0 ? '<span class="pill ok">terbaru</span>' : ''}
            <div class="row">
              <button type="button" class="btn sm" data-act="hist-restore" data-sha="${escapeHtml(h.version)}" data-date="${escapeHtml(h.committed_at)}" ${i === 0 ? 'disabled' : ''}>Pulihkan</button>
              <button type="button" class="btn sm" data-act="hist-download" data-sha="${escapeHtml(h.version)}">Download</button>
            </div>
          </div>`).join('')}</div>
          <div class="row"><button type="button" class="btn sm" data-act="load-history">${icon('refresh')}Muat ulang</button></div>`;
      }

      // ---------- Umum ----------
      function drawGeneral() {
        const p = store.data.settings.player;
        panel.innerHTML = `
          <section class="card">
            <h3>Tampilan</h3>
            <label class="field inline"><span>Tema</span>
              <select data-gen="theme"><option value="auto">Ikuti sistem</option><option value="light">Terang</option><option value="dark">Gelap</option></select></label>
          </section>
          <section class="card">
            <h3>Player</h3>
            <label class="check"><input type="checkbox" data-player="autoNext" ${p.autoNext ? 'checked' : ''}><span>Lanjut otomatis ke video berikutnya</span></label>
            <label class="check"><input type="checkbox" data-player="autoMarkWatched" ${p.autoMarkWatched ? 'checked' : ''}><span>Tandai “sudah ditonton” saat video selesai</span></label>
            <label class="check"><input type="checkbox" data-player="backgroundPlay" ${p.backgroundPlay !== false ? 'checked' : ''}><span>Usahakan tetap putar saat aplikasi ditinggal / layar mati <span class="pill">HP</span><br><span class="muted small">Kalau YouTube menjeda sendiri, aplikasi terus memintanya lanjut (±1,5 menit) dan melanjutkan otomatis saat kamu kembali. Kalau tetap berhenti, pakai <b>Putar di aplikasi YouTube</b>.</span></span></label>
            <p class="hint">Pintasan keyboard: <kbd>Spasi</kbd>/<kbd>K</kbd> putar/jeda · <kbd>N</kbd> berikutnya · <kbd>P</kbd> sebelumnya · <kbd>/</kbd> cari</p>
          </section>
          <section class="card">
            <h3>Pencarian YouTube</h3>
            <p class="muted">Untuk mencari lagu langsung dari aplikasi (Tambah → Cari di YouTube). Butuh YouTube Data API key gratis milikmu sendiri, disimpan hanya di perangkat ini.</p>
            <div class="row"><input type="text" id="yt-key" placeholder="AIza…" value="${escapeHtml(getApiKey())}" aria-label="YouTube API key">
              <button type="button" class="btn" data-act="yt-key-save">Simpan</button></div>
            <p class="hint">Cara membuat: <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">aktifkan YouTube Data API v3</a> → <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials → Create API key</a>.</p>
          </section>
          <section class="card">
            <h3>Data di browser ini</h3>
            <p class="muted">Ukuran data lokal <b>${formatBytes(store.storageSize())}</b> (batas localStorage umumnya ±5 MB) · ${Object.keys(store.data.videos).length} video di library.</p>
            <div class="row"><button type="button" class="btn btn-danger-ghost" data-act="clear-all">${icon('trash')}Hapus semua data di browser ini</button></div>
            <p class="hint">Tidak menghapus Gist di GitHub.</p>
          </section>
          <p class="muted small about">MyTube Vault menyimpan data di browser ini dan di Gist milikmu sendiri. Layanan luar yang dihubungi: YouTube (player, thumbnail, judul), noembed.com (cadangan pengambil judul), dan api.github.com.</p>`;
        panel.querySelector('[data-gen=theme]').value = store.ui.theme || 'auto';
      }

      // ---------- aksi ----------
      async function run(btn, fn) {
        if (st.busy) return;
        st.busy = true;
        const orig = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${orig}`; }
        try {
          await fn();
        } catch (e) {
          toast(e.message || String(e), 'error', 6000);
        } finally {
          st.busy = false;
          if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = orig; }
        }
      }

      async function importText(text) {
        const env = parseEnvelope(text);
        const data = await sync.openWithPrompt(env, { adopt: false });
        if (!data) return;
        const norm = normalizeData(data);
        const s = summarize(norm);
        const cur = summarize(store.data);
        const choice = await modal({
          title: 'Import backup',
          body: `<p>Backup berisi <b>${s.playlists}</b> playlist dan <b>${s.videos}</b> video${s.updatedAt ? ` (diubah ${escapeHtml(formatDateTime(s.updatedAt))})` : ''}.</p>
            <p class="muted">Data sekarang: ${cur.playlists} playlist, ${cur.videos} video.</p>
            <ul class="plain"><li><b>Gabungkan</b> — tambahkan playlist & video yang belum ada, tanpa menghapus apa pun.</li>
            <li><b>Ganti</b> — data sekarang diganti seluruhnya (salinannya disimpan sebagai snapshot).</li></ul>`,
          actions: [{ label: 'Batal', value: null }, { label: 'Ganti', value: 'replace' }, { label: 'Gabungkan', value: 'merge', variant: 'primary' }],
        });
        if (choice === 'replace') { store.replaceData(norm); toast('Backup berhasil di-import.', 'success'); }
        if (choice === 'merge') {
          const r = store.mergeData(norm);
          toast(`Digabung: +${r.addedPlaylists} playlist, +${r.addedVideos} video, +${r.addedItems} item.`, 'success');
        }
        if (st.tab === 'backup') drawBackup();
      }

      async function restoreRevision(sha, date) {
        const env = await sync.loadRevision(sha);
        const data = await sync.openWithPrompt(env, { adopt: false });
        if (!data) return;
        const norm = normalizeData(data);
        const s = summarize(norm);
        const cur = summarize(store.data);
        const ok = await confirmDialog('Pulihkan versi ini?',
          `Versi ${formatDateTime(date)}: ${s.playlists} playlist, ${s.videos} video.\n\nData saat ini (${cur.playlists} playlist, ${cur.videos} video) akan diganti. Versi sekarang tetap ada di riwayat Gist dan sebagai snapshot lokal.`,
          { ok: 'Pulihkan' });
        if (!ok) return;
        store.replaceData(norm);
        st.history = null;
        toast('Versi lama dipulihkan dan akan disimpan sebagai versi terbaru.', 'success');
        drawBackup();
      }

      panel.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        switch (act) {
          case 'verify':
            await run(b, async () => {
              const u = await sync.connectToken(panel.querySelector('#gh-token').value);
              toast(`Token valid — login sebagai @${u.login}.`, 'success');
              st.changeToken = false;
              draw();
            });
            break;
          case 'change-token': st.changeToken = true; st.gists = null; draw(); break;
          case 'cancel-token': st.changeToken = false; draw(); break;
          case 'create-gist':
            await run(b, async () => {
              await sync.createGist();
              st.gists = null;
              toast('Gist backup dibuat. Auto-sync aktif.', 'success');
              draw();
            });
            break;
          case 'list-gists':
            await run(b, async () => { st.gists = await sync.listGists(); draw(); });
            break;
          case 'use-gist': {
            const g = (st.gists || []).find((x) => x.id === b.dataset.id);
            if (g && g.public && !(await confirmDialog('Gist publik',
              'Gist ini publik — siapa pun yang tahu link-nya bisa melihat isinya. Tetap pakai? Sebaiknya aktifkan enkripsi setelahnya.',
              { ok: 'Tetap pakai' }))) break;
            await run(b, async () => { await sync.useGist(b.dataset.id); st.gists = null; toast('Terhubung ke Gist.', 'success'); draw(); });
            break;
          }
          case 'use-gist-manual':
            await run(b, async () => { await sync.useGist(panel.querySelector('#gist-id').value); toast('Terhubung ke Gist.', 'success'); draw(); });
            break;
          case 'sync-now': await run(b, () => sync.syncNow()); break;
          case 'pull':
            if (await confirmDialog('Tarik dari cloud?',
              'Data di perangkat ini akan diganti dengan versi di cloud. Salinan data lokal sebelumnya disimpan sebagai snapshot (tab Backup).',
              { ok: 'Tarik & ganti' })) await run(b, () => sync.pullReplace());
            break;
          case 'disconnect':
            if (await confirmDialog('Putuskan koneksi?',
              'Token dihapus dari browser ini dan auto-sync berhenti. Data lokal dan Gist di GitHub tetap ada.',
              { ok: 'Putuskan', danger: true })) { sync.disconnect(); toast('Koneksi cloud diputus.'); draw(); }
            break;
          case 'enable-enc': {
            const r = await passphraseDialog({ mode: 'new' });
            if (r) { sync.enableEncryption(r.pass, r.remember); toast('Enkripsi aktif. Backup berikutnya terenkripsi.', 'success'); draw(); }
            break;
          }
          case 'change-pass': {
            const r = await passphraseDialog({ mode: 'change' });
            if (r) { sync.changePassphrase(r.pass, r.remember); toast('Passphrase diganti.', 'success'); draw(); }
            break;
          }
          case 'disable-enc':
            if (await confirmDialog('Nonaktifkan enkripsi?', 'Backup berikutnya disimpan sebagai JSON biasa di Gist private.', { ok: 'Nonaktifkan' })) {
              sync.disableEncryption(); draw();
            }
            break;
          case 'forget-pass': sync.forgetPassphrase(); toast('Passphrase dilupakan dari perangkat ini.'); draw(); break;
          case 'export': {
            const text = await buildEnvelope(store.data, null);
            downloadText(`mytube-vault-backup-${todayStamp()}.json`, text);
            toast('File backup diunduh.', 'success');
            break;
          }
          case 'copy': {
            const ok = await copyText(await buildEnvelope(store.data, null));
            toast(ok ? 'Teks backup disalin ke clipboard.' : 'Gagal menyalin.', ok ? 'success' : 'error');
            break;
          }
          case 'import-file': panel.querySelector('#import-file').click(); break;
          case 'import-text': {
            const t = await textInputDialog('Tempel teks backup', { label: 'Isi file backup (JSON)', ok: 'Lanjut' });
            if (t) await run(null, () => importText(t));
            break;
          }
          case 'snap-restore': {
            const snap = store.getSnapshot();
            if (snap && await confirmDialog('Pulihkan snapshot?', 'Data sekarang akan diganti dengan snapshot (dan data sekarang menjadi snapshot baru).', { ok: 'Pulihkan' })) {
              store.replaceData(snap.data);
              toast('Snapshot dipulihkan.', 'success');
              drawBackup();
            }
            break;
          }
          case 'load-history':
            await run(b, async () => { st.history = await sync.listHistory(); drawBackup(); });
            break;
          case 'hist-restore': await run(b, () => restoreRevision(b.dataset.sha, b.dataset.date)); break;
          case 'hist-download':
            await run(b, async () => {
              downloadText(`mytube-vault-${b.dataset.sha.slice(0, 7)}.json`, await sync.loadRevisionText(b.dataset.sha));
            });
            break;
          case 'yt-key-save': {
            const k = panel.querySelector('#yt-key').value.trim();
            if (k && !/^[\w-]{20,}$/.test(k)) { toast('Format API key tidak dikenali.', 'error'); break; }
            setApiKey(k);
            toast(k ? 'API key disimpan.' : 'API key dihapus.', 'success');
            break;
          }
          case 'clear-all':
            if (await confirmDialog('Hapus semua data di browser ini?',
              'Semua playlist, pengaturan, token GitHub, dan passphrase di browser ini dihapus. Gist di GitHub TIDAK ikut terhapus.',
              { ok: 'Hapus semua', danger: true })) { store.clearAll(); location.reload(); }
            break;
          default: break;
        }
      });

      panel.addEventListener('change', async (e) => {
        const t = e.target;
        if (t.dataset.set === 'autoSync') store.setSyncSetting('autoSync', t.checked);
        else if (t.dataset.set === 'debounceMs') store.setSyncSetting('debounceMs', Number(t.value));
        else if (t.dataset.player) store.setPlayerSetting(t.dataset.player, t.checked);
        else if (t.dataset.gen === 'theme') { store.ui.theme = t.value; store.saveUi(); }
        else if (t.id === 'import-file' && t.files && t.files[0]) {
          const file = t.files[0];
          t.value = '';
          await run(null, async () => importText(await file.text()));
        }
      });

      tabsEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (b) { st.tab = b.dataset.tab; draw(); }
      });

      const off = sync.on(() => {
        if (st.tab !== 'cloud') return;
        if (st.drawnConnected !== sync.connected) { if (!st.busy) draw(); } else updateStatus();
      });
      cleanup = off;
      draw();
    },
  });
  cleanup();
}
