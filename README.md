# MyTube Vault

Playlist YouTube pribadi yang **tidak bergantung akun YouTube**. Ganti akun (misalnya karena rotasi family sharing tiap 2 bulan) tidak berpengaruh — playlist disimpan di browser dan dibackup otomatis ke **GitHub Gist private** milikmu.

Vanilla JavaScript (ES modules), tanpa build step, tanpa backend. Tinggal taruh di hosting statis mana pun.

---

## Fitur

**Playlist & video**
- Tambah video dari satu link, atau tempel banyak link sekaligus (otomatis terdeteksi saat paste)
- Mendukung `youtube.com/watch`, `youtu.be`, `/shorts/`, `/embed/`, `/live/`, `m.youtube.com`, `music.youtube.com`, `youtube-nocookie.com`
- Banyak playlist; satu video bisa ada di beberapa playlist (library global, tanpa duplikasi metadata)
- Koleksi otomatis: **Semua video**, **Favorit**, **Belum ditonton**
- Urutan **manual** (drag & drop, naik/turun, pindah ke paling atas) dan **otomatis** (terbaru, terlama, judul A–Z/Z–A, favorit dulu, belum/sudah ditonton dulu). Urutan otomatis hanya mengubah tampilan, data asli tidak berubah
- Favorit, tandai ditonton (otomatis saat video selesai), ubah judul, pindah/salin ke playlist lain, hapus dengan **Urungkan**
- Pencarian judul/channel, “Salin semua link” / download `.txt` (berguna kalau mau memindahkan ke akun YouTube baru)

**Player advanced** (YouTube IFrame API)
- Play/pause, next/prev (prev mengulang lagu bila sudah > 3 detik), auto-next
- Shuffle (urutan asli kembali saat dimatikan), repeat off / semua / satu
- Antrean: lihat, lompat, hapus, “Putar berikutnya”, “Tambah ke antrean”
- Mini player ⇄ video besar, progress bar yang bisa diklik
- Video yang tidak boleh di-embed → pesan jelas + tombol “Buka di YouTube”, otomatis lanjut ke video berikutnya
- Pintasan: `Spasi`/`K` putar-jeda · `N` berikutnya · `P` sebelumnya · `/` cari

**Android / HP** (PWA)
- Bisa dipasang seperti aplikasi: ikon di layar utama, terbuka tanpa bilah browser
- Tampilan khusus HP: navigasi bawah, mini player, player layar penuh, menu sebagai sheet dari bawah
- Tombol **Back** Android menutup panel yang sedang terbuka
- **Bagikan** dari aplikasi YouTube → pilih *MyTube Vault* → link langsung terisi
- Tombol **Tempel** membaca link dari clipboard
- Ubah urutan dengan menggeser pegangan ⠿

**Penyimpanan & backup**
- LocalStorage sebagai penyimpanan utama (local-first, jalan offline)
- **Auto-sync ke GitHub Gist** dengan debounce (default 2 detik) + jarak minimal 8 detik antar-penyimpanan
- **Offline queue**: perubahan saat offline dikirim otomatis begitu online
- **Deteksi konflik** antar-perangkat + dialog pilih versi
- **Riwayat versi** (revisi Gist): pulihkan atau download versi mana pun
- **Enkripsi opsional**: AES-GCM 256, kunci dari passphrase lewat PBKDF2-SHA256 (250.000 iterasi)
- Pilih Gist yang sudah ada, masukkan ID/URL manual, putuskan koneksi
- Export/import JSON manual, import bisa **Gabungkan** atau **Ganti**
- **Snapshot lokal** otomatis setiap data akan ditimpa (restore, import, data dari cloud)

---

## Menjalankan

ES modules dan player YouTube butuh halaman dibuka lewat `http(s)://`, **bukan** `file://`.

```bash
cd mytube-vault
python3 -m http.server 8080
# buka http://localhost:8080
```

Atau `npx serve .` — server statis apa pun bisa.

> Enkripsi memakai WebCrypto, yang hanya tersedia di HTTPS atau `localhost`.

### Deploy ke GitHub Pages

1. Buat repo baru, push isi folder ini (`index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `icons/`).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / root.
3. Buka `https://<username>.github.io/<repo>/`.

Bisa juga Vercel, Netlify, Cloudflare Pages, atau bucket static website (Huawei OBS / AWS S3) — tidak ada langkah build.

---

## Versi Android

Aplikasinya PWA: satu kode yang sama untuk desktop dan Android, tanpa Play Store.

**Pasang di HP (sekali saja):**
1. Deploy dulu ke GitHub Pages (HTTPS wajib, `localhost` di laptop tidak bisa diakses dari HP).
2. Buka URL-nya di **Chrome Android**.
3. Ketuk menu ⋮ → **Install app / Tambahkan ke layar utama**. Bisa juga lewat tombol **Pasang aplikasi** di menu Playlist (muncul kalau Chrome mengizinkan).
4. Buka MyTube Vault dari ikon di layar utama.

**Menambah video dari aplikasi YouTube:** buka video → **Bagikan** → pilih **MyTube Vault** (muncul setelah aplikasi dipasang) → pilih playlist → **Tambah**.

**Sinkron dengan laptop:** di HP buka **Setelan → Cloud Sync**, tempel token yang sama, lalu **Pakai Gist yang ada**.

**Iklan & YouTube Premium di HP:** player memakai login YouTube di **Chrome** HP. Pastikan Chrome sudah login ke akun Premium (buka youtube.com di Chrome, cek avatar).

**Mau file APK?** Bungkus PWA ini lewat [PWABuilder](https://www.pwabuilder.com): masukkan URL GitHub Pages → *Package for stores* → **Android** → download. Hasilnya aplikasi Trusted Web Activity yang tetap memakai Chrome (jadi login Premium ikut), dan otomatis ter-update setiap kamu push ke GitHub Pages.

**Menambah lagu di HP:** buka playlist → tombol **+** (atau ⋮) → pilih:
- **Tempel link**: kolom Tambah, tombol *Tempel* membaca clipboard.
- **Cari di YouTube**: ketik judul, ketuk **+** di hasilnya. Butuh YouTube Data API key gratis (sekali saja, *Setelan → Umum → Pencarian YouTube*; ±100 pencarian/hari). Tanpa key tersedia tombol *Buka pencarian YouTube*.
- **Dari library**: centang lagu yang sudah pernah ditambahkan.
Kolom cari di atas hanya mencari di library; kalau tidak ketemu muncul tombol *Cari di YouTube*.

**Dengar di latar belakang / layar mati:** player YouTube di halaman web menjeda dirinya saat aplikasi ditinggal; notifikasi & layar kunci memakai kontrol bawaan player YouTube. Untuk dengar di latar belakang, pakai **Putar di aplikasi YouTube** (player layar penuh atau menu ⋮): antrean (maks. 50 lagu) dibuka di aplikasi YouTube, yang dengan Premium bisa di latar belakang.

> Setelah update kode, service worker mengambil versi terbaru dari jaringan. Kalau tampilan belum berubah, tutup aplikasi lalu buka lagi.

---

## Menghubungkan GitHub Gist

1. Buat token khusus untuk aplikasi ini:
   - **Classic token** (paling simpel): <https://github.com/settings/tokens/new?scopes=gist&description=MyTube%20Vault> — centang **hanya** `gist`.
   - Atau **fine-grained token** dengan *Account permissions → Gists: Read and write*.
2. Di aplikasi: **Pengaturan → Cloud Sync** → tempel token → **Hubungkan**.
3. Pilih **Buat Gist baru** (perangkat pertama) atau **Pakai Gist yang ada** (perangkat/browser berikutnya).

Selesai — setiap perubahan otomatis tersimpan ke file `mytube-vault.json` di Gist private-mu.

**Perangkat kedua / setelah clear cache:** hubungkan token yang sama → *Pakai Gist yang ada* → pilih Gist bertanda **vault**. Data langsung dimuat.

---

## Cara kerja sync

```
UI → store.commit() → LocalStorage  (langsung, selalu)
                   ↘ sync.schedule()  (debounce)
                       → GET Gist (cek konflik) → PATCH Gist
```

Deteksi konflik memakai tiga titik waktu, bukan sekadar “siapa paling baru”, jadi jam perangkat yang berbeda tidak bisa membuat data tertimpa diam-diam:

| Kondisi | Tindakan |
|---|---|
| Versi cloud = versi saat sinkron terakhir | aman → kirim data lokal |
| Versi cloud = versi lokal | sudah sama → tidak perlu apa-apa |
| Cloud berubah, lokal **tidak** punya perubahan | ambil versi cloud diam-diam |
| Cloud berubah **dan** lokal juga berubah | dialog konflik: pakai lokal / pakai cloud |

Apa pun pilihannya, tidak ada yang benar-benar hilang: versi cloud lama tetap di riwayat revisi Gist, dan data lokal lama disimpan sebagai snapshot.

Sync dicek ulang saat aplikasi dibuka, saat kembali online, dan saat tab difokus lagi setelah > 1 menit. Saat tab disembunyikan, perubahan yang masih menunggu langsung dikirim.

---

## Format data

File di Gist (dan file export) memakai format yang sama:

```json
{
  "app": "mytube-vault",
  "version": 1,
  "encrypted": false,
  "updatedAt": "2026-10-22T12:00:00.000Z",
  "data": {
    "version": 1,
    "updatedAt": "2026-10-22T12:00:00.000Z",
    "videos": {
      "dQw4w9WgXcQ": {
        "youtubeId": "dQw4w9WgXcQ", "title": "Judul", "channel": "Channel",
        "duration": 213, "favorite": true, "watched": false, "tags": [],
        "firstAddedAt": "…", "updatedAt": "…"
      }
    },
    "playlists": [
      { "id": "pl_…", "name": "Musik", "createdAt": "…", "updatedAt": "…",
        "items": [ { "itemId": "it_…", "youtubeId": "dQw4w9WgXcQ", "addedAt": "…", "note": "" } ] }
    ],
    "settings": {
      "player": { "shuffle": false, "repeat": "all", "autoNext": true, "autoMarkWatched": true },
      "sync": { "autoSync": true, "debounceMs": 2000, "encryptionEnabled": false }
    }
  }
}
```

Dengan enkripsi, `data` diganti `crypto` (`kdf`, `iterations`, `cipher`, `salt`, `iv`) + `payload` (base64). `updatedAt` sengaja tetap terbuka supaya deteksi konflik bisa jalan tanpa passphrase.

Model `videos` (library global) + `playlists[].items` (urutan & referensi) dipilih supaya favorit/ditonton konsisten walau satu video ada di banyak playlist. Import juga menerima format sederhana lama (`playlists[].videos[]`).

Key di LocalStorage:

| Key | Isi |
|---|---|
| `mytube_vault_state_v1` | `data` + info koneksi `cloud` + state `ui` |
| `mytube_vault_snapshot_v1` | snapshot sebelum data terakhir ditimpa |
| `mytube_vault_gh_token` | token GitHub (tidak pernah ikut backup) |
| `mytube_vault_passphrase` | passphrase, hanya jika “Ingat di perangkat ini” dicentang |

---

## Struktur proyek

```
index.html          kerangka halaman
css/style.css       tampilan (tema terang/gelap, responsif)
js/main.js          titik masuk: menghubungkan semua modul, event UI
js/store.js         state, normalisasi data, LocalStorage, operasi playlist/video
js/sync.js          sync manager: debounce, offline, konflik, riwayat, enkripsi
js/gist.js          klien GitHub Gist REST API
js/envelope.js      format file backup (plain / terenkripsi)
js/crypto.js        PBKDF2 + AES-GCM (WebCrypto)
js/player.js        YouTube IFrame API: queue, shuffle, repeat, auto-next
js/parser.js        link YouTube → video ID, multi-paste
js/metadata.js      thumbnail, judul (oEmbed → noembed.com), antrean pengambilan
js/ui.js            fungsi render (sidebar, daftar, dock, antrean, banner)
js/dialogs.js       modal, toast, menu, dialog passphrase/konflik
js/settings.js      dialog Pengaturan (Cloud Sync, Backup & Riwayat, Umum)
js/utils.js         helper (format waktu, sort/filter, download, clipboard)
js/mobile.js        khusus HP: tombol Back, geser-urut sentuh, PWA, share target
sw.js               service worker (kerangka aplikasi offline)
manifest.webmanifest  metadata PWA (nama, ikon, share target, shortcut)
icons/              ikon aplikasi (biasa + maskable untuk Android)
tests/              unit test logika inti
```

### Menjalankan test

```bash
node --test tests/logic.test.mjs
```

Mencakup parser link, migrasi format lama, operasi store, envelope + enkripsi, dan alur sync lengkap (buat Gist, push, auto-pull, konflik, enkripsi, offline → online) dengan GitHub API tiruan.

---

## Keamanan & privasi

- Token disimpan di LocalStorage browser dan hanya dikirim ke `api.github.com`. Pakai token **khusus aplikasi ini** dengan izin **gist saja**, di perangkat pribadi. Token bisa dicabut kapan saja di GitHub.
- Gist dibuat **private** (secret). Gist secret tidak terdaftar publik, tapi siapa pun yang tahu URL-nya bisa melihat — aktifkan enkripsi kalau ingin isinya benar-benar tertutup.
- Lupa passphrase = backup terenkripsi tidak bisa dibuka. Simpan di password manager.
- Layanan luar yang dihubungi: YouTube (player, thumbnail, oEmbed judul), noembed.com (cadangan pengambil judul), api.github.com.

## Batasan yang perlu diketahui

- **Judul video** diambil lewat oEmbed tanpa API key; kalau gagal, judul terisi otomatis saat video diputar, atau bisa diubah manual. Durasi terisi setelah video pertama kali diputar.
- **Video dengan embed dimatikan pemiliknya** tidak bisa diputar di player — tersedia tombol “Buka di YouTube”.
- Ketentuan YouTube mewajibkan player terlihat minimal 200×200 px, jadi mode “audio saja” sengaja tidak disediakan. Pemutaran di background HP mengikuti kebijakan browser.
- **Putar di latar belakang / layar mati** di Android mengikuti kebijakan YouTube dan Chrome; kontrol di notifikasi bersifat best-effort karena audio berasal dari iframe YouTube.
- LocalStorage umumnya dibatasi ±5 MB — cukup untuk puluhan ribu video. Ukuran saat ini terlihat di *Pengaturan → Umum*.
- GitHub membatasi request yang membuat konten; karena itu ada jarak minimal 8 detik antar-penyimpanan. Kalau tetap kena limit, sync dicoba ulang otomatis.

## Ide pengembangan berikutnya

- Pindah penyimpanan ke IndexedDB untuk library yang sangat besar
- UI tag/kategori (field `tags` sudah ada di data model) dan smart playlist berbasis tag
- Bulk edit (pilih banyak video sekaligus)
- Merge otomatis saat konflik (saat ini pilih salah satu versi)
- Import dari URL playlist YouTube (butuh YouTube Data API key)
