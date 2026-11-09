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
- Player mengambang bisa di-**minimize** (tombol ▁ di bilahnya: video dilipat, musik tetap jalan; ketuk bilah untuk menampilkan lagi) dan **digeser** ke pojok mana pun (desktop)
- Video yang tidak boleh di-embed → pesan jelas + tombol “Buka di YouTube”, otomatis lanjut ke video berikutnya
- Pintasan: `Spasi`/`K` putar-jeda · `N` berikutnya · `P` sebelumnya · `/` cari · `?` semua pintasan

**Android / HP** (PWA)
- Bisa dipasang seperti aplikasi: ikon di layar utama, terbuka tanpa bilah browser
- Tampilan khusus HP: navigasi bawah, mini player, player layar penuh, menu sebagai sheet dari bawah
- Tombol **Back** Android menutup panel yang sedang terbuka
- **Bagikan** dari aplikasi YouTube → pilih *MyTube Vault* → link langsung terisi
- Tombol **Tempel** membaca link dari clipboard
- Ubah urutan dengan menggeser pegangan ⠿

**Kenyamanan pakai** (dari review QA)
- **Pilih banyak**: menu ⋮ → *Pilih beberapa*, atau tekan lama sebuah lagu di HP. Lalu putar, masukkan antrean, tambah/pindah ke playlist, favoritkan, atau hapus sekaligus (hapus dari playlist bisa **Urungkan**).
- **Timer tidur** (15–90 menit atau *akhir lagu ini*) dan **kecepatan putar** 0.5×–2× lewat tombol ⋮ di player
- **Riwayat**: koleksi otomatis lagu yang pernah diputar (terbaru di atas, dengan jumlah putar)
- **Lanjut dari posisi terakhir** untuk video panjang (≥ 8 menit), seperti YouTube; lagu biasa selalu mulai dari awal
- Pencarian dengan **sorotan** kata yang cocok dan tombol hapus ×; daftar panjang **termuat otomatis** saat digulir
- Video baru disorot & digulir ke posisinya; duplikat playlist; naik/turunkan playlist di daftar
- Banner **offline**, pesan jelas kalau player YouTube gagal/timeout (dengan tombol *Buka di YouTube*), notifikasi kesalahan tak terduga, peringatan saat penyimpanan browser hampir penuh
- Aksesibilitas: tautan *Lewati ke daftar video*, judul iframe player, toast bisa ditutup & berhenti saat disentuh/di-hover, error diumumkan ke pembaca layar
- Pintasan: `?` daftar pintasan · `←/→` seek 5 dtk · `↑/↓` volume · `M` bisu · `S` acak · `R` ulangi · `L` ulangi lagu ini · `Y` lirik · `Ctrl+A` pilih semua

**Organisasi, berbagi & statistik**
- **Import playlist YouTube**: tempel link `youtube.com/playlist?list=…` (atau menu ⋮ → *Import playlist YouTube*) → semua video (maks. 1000) masuk lengkap dengan judul, ke playlist baru atau yang sudah ada. Pakai API key yang sama dengan *Cari di YouTube*. Mix/Radio otomatis (`list=RD…`) tidak bisa diambil lewat API.
- **Tag**: ⋮ pada lagu → *Atur tag* (atau pilih banyak → *Tag*). Tag tampil di daftar dan di sidebar sebagai filter; di kolom cari ketik `#namatag`.
- **Bagikan playlist lewat link**: ⋮ playlist → *Bagikan playlist*. Isi playlist (maks. 300 lagu) dikompres ke dalam link itu sendiri — tanpa server. Penerima membuka link → pratinjau → *Simpan* / *Simpan & putar*.
- **Statistik** (link di bawah sidebar): menit mendengarkan 14 hari, jam favorit, lagu & channel paling sering diputar, tag. Jumlah putar tersinkron; grafik menit/jam dihitung di perangkat ini.
- **Lirik** (⋮ player → *Lirik*, atau tombol `Y`): dicari otomatis di [LRCLIB](https://lrclib.net) dari judul lagu; lirik tersinkron disorot mengikuti lagu dan bisa diketuk untuk melompat. Kalau hasilnya salah, ubah kata kunci atau pilih hasil lain — pilihanmu diingat per lagu.

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

### Efisiensi & tampilan (v11)
- **Tempel banyak link langsung**: tempel beberapa link (per baris, berspasi, atau menempel) di kolom tambah, maka semuanya langsung masuk. Notifikasinya punya tombol **Batalkan**.
- **Chip cara tambah** (Cari di YouTube, Dari library, Import playlist, Banyak link) dalam satu baris yang bisa digeser di HP
- **Filter cepat** di atas daftar: Belum ditonton, Favorit, Belum pernah diputar, < 5 menit, ≥ 10 menit, plus tag yang paling sering dipakai (lengkap dengan jumlah)
- **Pencarian beberapa kata** (urutan bebas, mis. `rick you`); setiap kata yang cocok disorot
- **Mode tampilan**: Nyaman, Ringkas (±2× lebih banyak lagu per layar), Kisi (thumbnail besar). Pilihan diingat.
- **Antrean**: geser ⠿ untuk mengubah urutan (mouse & sentuh), **Kosongkan**, "Berikutnya: …" di player bawah (desktop), dan 3 lagu berikutnya di layar *Sedang diputar* (HP). Lagu yang kamu keluarkan dari antrean tidak dimasukkan lagi otomatis.
- **Warna ikut lagu**: player, baris yang diputar, dan layar *Sedang diputar* mengambil warna dari thumbnail lagu. Bisa dimatikan lewat ⋮ player.
- **Skeleton & animasi halus**: kerangka saat memuat (judul, hasil cari YouTube, lirik), animasi saat lagu ditambah/dihapus dan saat pindah halaman; mengikuti setelan *kurangi gerakan* sistem.
- **Kartu video lebih bersih (v12)**: saat kursor di atas thumbnail muncul tombol ▶ Putar, Tambah ke antrean, dan Hapus. Garis tipis di bawah thumbnail menunjukkan sejauh mana lagu sudah diputar (abu-abu = sudah ditonton).
- **Drag & drop** baris atau kartu (mode kisi: geser ke kiri/kanan) saat urutan manual
- **Kaca buram** pada player bawah, menu, dialog, antrean, dan navigasi HP; **latar & sidebar ikut warna lagu**; font **Poppins** (di-host sendiri, ikut tersimpan offline)
- **Empty state berilustrasi** (animasi melayang) dengan tombol besar: Tambahkan lagu pertama, Jelajahi YouTube, Impor playlist dari URL
- **Toast berikon** di pojok kanan bawah (desktop), hijau untuk sukses dan merah untuk error; lagu baru meluncur masuk, lagu yang dihapus mengecil lalu hilang
- **Layar lirik ala Spotify (v14)**: tombol 🎤 di player bawah (atau `Y`) membuka lirik besar di area utama dengan latar warna lagu; baris yang sudah lewat lebih terang, baris sekarang putih. Kalau lirik tidak ada, yang tampil artwork + judul lagu. Video tetap melayang di pojok.
- **Kamar santai (v21)**: latar utama Lobby berupa ilustrasi kamar berlapis (rak buku, meja, laptop, kopi beruap, kucing tidur, tanaman yang bergoyang, lampu-lampu). Lewat tombol **Suasana**: 6 pemandangan di luar jendela (gunung & danau, kota, pantai, hutan pinus, pedesaan dengan kincir, sawah dengan gunung berasap), 6 cuaca (cerah, berawan, hujan, badai berkilat, salju, kabut) dan waktu (otomatis/pagi/siang/senja/malam) yang mengubah cahaya kamar. Suara alam otomatis ikut suasana (bisa dimatikan); ada tombol *Suasana acak*.
- **Gaya lukisan lofi (v22)**: Kamar santai digambar ulang dengan palet teal keabuan + aksen hangat, atmospheric perspective (gunung jauh memudar ke kabut), sisi lereng terang/gelap, pantulan danau, kabut yang melayang, cahaya lampu yang tumpah ke dinding dan rim light di tepi benda, serat kayu, hujan tiga lapis dengan jejak tetes di kaca, burung sesekali, grain film halus, dan parallax pemandangan yang mengikuti mouse (dimatikan bila *reduced motion*).
- **Lukisan sapuan kuas (v23)**: `js/paint.js` melukis ulang setiap suasana: underpainting buram → tiga lapis sapuan kuas (warna diambil dari gambar, arah mengikuti tepi benda) → tepi benda dirapikan kembali → bloom lembut + tekstur kanvas. Dikerjakan bertahap ±10 ms per frame sehingga terlihat "terlukis" dalam 1–3 detik tanpa membuat animasi tersendat. Tanaman, pot gantung, dan kucing dilukis sebagai sprite lalu digerakkan (bergoyang/bernapas).
- **v37 — kafe yang lebih hidup & rapi** (`js/cafe.js`, `js/visitors.js`, `js/room.js`, `js/ambient.js`, `js/lobby.js`):
  - **Bangku bar**: dinaikkan (`STOOL_SEAT` 650→622, cincin pijakan `STOOL_RING`) supaya dudukan ±0,45 tinggi orang dan meja bar ±1/5 tinggi orang di atas dudukan — sebelumnya meja bar setinggi bahu sehingga pengunjung tampak berdiri kaku. Pose dari belakang: siku bertumpu di meja bar, ujung baju dipotong di dudukan, titik berdiri sebelum duduk tepat di depan kaki bangku.
  - **Pesanan di meja bar**: cangkir berasap di kanan & piring roti di kiri badan (`BAR_Y` diekspor); saat minum/makan barangnya terangkat dari meja dan tampak menyembul di sisi kepala.
  - **Lonceng pintu**: berbunyi saat ada yang masuk (3 pukulan) dan keluar (2 pukulan lebih pelan), paling sering tiap 2,5 detik; lonceng kuningan di kusen pintu ikut bergoyang dan pintu sedikit terang. Disintesis (tanpa file audio) dan tetap berbunyi walau suara alam belum dinyalakan; bisa dimatikan di Setelan Lobby → *Bunyi kafe* (`cafeSfx`).
  - **Tertutup meja kita**: semua orang dipotong di tepi meja kita (y 806) dan jalur jalan (`LANE`) dipindah ke 822, jadi telapak kaki pejalan tertutup meja.
  - **Tanaman dekat pintu**: kotak sprite diperlebar (daun tidak lagi terpotong lurus), tanaman digeser sedikit ke kiri dan daun kanan dibuat lebih tegak supaya tidak keluar layar.
  - **Meja kita terlihat di layar lebar**: di Kafe, potongan layar lebar lebih banyak mengambil plafon (`tf.oy` 80% di atas); cangkir & piring dinaikkan sedikit; cahaya hangat di atas meja saat malam. Lukisan dibuat ulang otomatis (`PAINT_V` p8).
- **v36 — mengatur urutan playlist** (`js/rowdrag.js`, `js/main.js`, `js/store.js`):
  - **Tarik**: baris terangkat mengikuti kursor/jari, baris lain bergeser halus memberi ruang, halaman bergulir otomatis di dekat tepi atas/bawah (makin dekat makin cepat, di atas player & bar pilihan), Esc membatalkan. Mouse: tarik dari mana saja di baris (bukan tombol) atau dari pegangan; HP: dari pegangan ⋮⋮ (gulir biasa tetap jalan). Menggantikan seret-lepas bawaan browser.
  - **Nomor urut bisa diklik**: ketik nomor baru langsung di baris (Enter) — cara tercepat memindah satu lagu jauh ke atas. Menu ⋮ juga punya *Pindah ke nomor…* (dengan tombol cepat Paling atas/Paling bawah) dan *Pindah ke paling bawah*.
  - **Banyak lagu sekaligus**: di mode pilih, menarik salah satu lagu terpilih memindahkan semuanya (tanda jumlah di baris yang ditarik). Tombol **Urutan** di bar pilihan: ke paling atas, ke nomor…, ke paling bawah, kumpulkan di nomor lagu pertama (kalau terpencar), naik/turun satu. Keyboard: Alt+↑/↓ (satu langkah), Alt+Shift+↑/↓ (paling atas/bawah). Lagu terpilih tetap dipilih setelah dipindah, jadi bisa disetel lagi.
  - Urutan di antara lagu yang dipindah tetap; semua pemindahan bisa **Urungkan** dari notifikasi (`store.moveItems` mengembalikan urutan lama, `store.setOrder` memulihkannya; `store.nudgeItems` untuk naik/turun satu). Hanya aktif di playlist dengan *Urutan manual* dan tanpa pencarian/filter.
  - Perbaikan: teks "9 dipilih" dan tombol "Urungkan" kini ikut diterjemahkan ke bahasa Inggris; tombol di bar pilihan HP lebih ringkas supaya 8 aksi muat.
- **v35 — barista berekspresi & proporsi yang sepadan** (`js/visitors.js`, `js/cafe.js`):
  - **Barista** kini tokoh wayang yang sama dengan pengunjung (celemek, ikat kepala), digambar di balik konter dan dipotong tepat di permukaannya; tablet kasir tetap di depannya. **Ekspresi** digambar langsung di wajah: mata berkedip & melirik, alis naik (ramah) atau turun (serius), mulut tersenyum, bicara, atau bersenandung, mata tersenyum (^ ^) saat menyajikan sambil sedikit membungkuk.
  - **Alur pesanan**: pengunjung memesan → barista menyapa & mengobrol (mengangguk saat mendengarkan) → membuat kopi di mesin (siku bergantian bekerja, uap) → membawanya ke konter & menaruhnya → pengunjung yang menunggu mengambilnya. Saat sepi barista mengelap konter atau melihat-lihat. Barista dilukis lebih dulu dan diganti hanya setelah versi cahaya barunya siap.
  - **Proporsi**: orang diperbesar 16% (`PERSON_K`) supaya sepadan dengan konter, bangku bar & pintu; konter depan diturunkan ke tinggi pinggang (`COUNTER_Y` 536) dan konter belakang + mesin espresso ikut turun. Lukisan lama di perangkat otomatis dibuat ulang (`PAINT_V` p7).
  - **Duduk di bangku bar**: pinggul turun ke dudukan, paha maju (tertutup dudukan), satu kaki bertumpu di cincin pijakan dan yang lain menjuntai; dudukan, kaki depan & cincin bangku digambar di depan kaki orang, badan sedikit membungkuk.
  - **Lebih halus**: langkah terakhir mengendap pelan ke posisi berdiri, berbalik tampak memutar badan, duduk/berdiri lebih pelan (1,4/1,2 detik). Di PC semua orang digambar tiap frame; di HP yang diam memakai kanvas kecil (barista ±12×/detik).
- **v34 — gerak pengunjung yang lebih alami** (`js/visitors.js`):
  - **Berjalan tanpa meluncur**: tiap kaki punya fase menapak (telapak diam di lantai, badan melewatinya) dan fase mengayun (telapak terangkat, lutut menekuk); posisi kaki dihitung dengan *inverse kinematics*, dan fase langkah maju sesuai jarak yang ditempuh (`stepPhase`), jadi kaki tidak lagi "meluncur". Pinggul naik-turun seperti pendulum terbalik, badan condong sedikit ke depan, lengan berayun berlawanan dengan kaki. Tampak depan/belakang: pinggul bergoyang ke kaki yang menapak.
  - **Minum & makan bertahap**: cangkir kini diletakkan di meja. Gerakan dibagi menjadi meraih → menggenggam → mengangkat dengan lintasan melengkung (naik dulu, lalu mendekat ke wajah) → minum (cangkir miring, kepala sedikit mendongak) → menurunkan → melepas. ±45% pengunjung memesan roti (croissant, melon pan, sando) yang dibawa dengan nampan, ditaruh di piring, lalu dimakan gigitan demi gigitan (kepala mengangguk saat menggigit, roti mengecil). Badan condong saat meraih piring yang agak jauh. Dari belakang (bangku bar) yang terlihat hanya siku yang terangkat sedikit & kepala yang mendongak.
  - **Perbaikan**: kepala tidak lagi terlepas dari badan saat duduk/berdiri (bahu, leher & lengan kini mengikuti badan yang condong); betis dekat yang salah arah saat duduk; lengan ber-*akimbo* di bangku bar; gerakan menunjuk menu lebih wajar; payung tertutup tergantung di tangan.
  - **Bayangan & cahaya**: bayangan kontak lembut (gradien) di lantai — di bawah kedua kaki saat berjalan, di bawah kursi & kaki saat duduk — menggantikan elips padat yang melayang. Gradasi kain dibuat membulat + cahaya dari atas (tidak berbalik saat tokoh menghadap kiri), dan garis cahaya tepi ditipiskan supaya tidak tampak seperti lingkaran putih.
  - Orang yang sedang minum/makan digambar tiap frame (mulus); yang diam diperbarui 10×/detik. HP (CPU 4×) tetap ±29 fps.
- **v33 — pengunjung yang dilukis & bergerak lebih nyata** (`js/visitors.js`):
  - **Wayang kertas yang dilukis**: setiap tokoh terdiri dari potongan tubuh (badan & kepala tampak depan/belakang/samping, lengan atas, lengan bawah + tangan, paha, betis + sepatu) yang digambar dengan bentuk alami — bahu melengkung, lipatan baju, kerah/mantel, rambut bertekstur (pendek, panjang, sanggul, bob), wajah lembut — lalu dilukis ulang oleh `paint.js` seperti latar. Ada cahaya tepi dari jendela (siang) atau lampu (malam); anggota tubuh sisi jauh sedikit lebih gelap. 7 tokoh (HP 5) dibuat sekali per suasana dan dilukis bertahap di sela animasi, lalu dipakai bergantian.
  - **Gerak**: sendi pinggul/lutut/bahu/siku; langkah dengan lutut menekuk saat kaki diayun, siku menekuk, badan sedikit condong; mulai & berhenti perlahan; berbalik kiri↔kanan lewat posisi menghadap depan; duduk/berdiri dengan kaki tetap menapak (pinggul turun & mundur, badan condong) dan naik ke bangku bar; berat badan berpindah saat berdiri; menunjuk papan menu saat memesan; tangan meraih cangkir di meja & mengangkatnya ke mulut lewat *inverse kinematics* dua tulang (`ik`), kepala sedikit mendongak.
  - Meja bundar & kursinya diperbesar supaya sepadan dengan orang yang duduk. Orang yang diam digambar ke kanvas kecil yang diperbarui berkala (`drawPersonFast`), jadi HP tetap ±28 fps.
- **v32 — pengunjung kafe** (`js/visitors.js`): siluet lembut berwarna kalem yang mengikuti cahaya ruangan (diterangi/digelapkan seperti lukisannya). Siklus tiap pengunjung: masuk lewat pintu bertirai noren (lonceng kalau suara alam menyala) → antre → memesan di konter (membelakangi kita) → menunggu & mengambil minuman → membawanya ke bangku bar (duduk membelakangi kita, sesekali mengangkat cangkir) atau berdua ke meja bundar (duduk menyamping, minum, dan bergantian bicara dengan gelembung "…") → pulang. Jumlahnya mengikuti waktu (pagi 3, siang & senja 4, malam 2; HP maks. 3), kafe sudah berisi beberapa orang saat Lobby dibuka, kursi tidak pernah dipakai dua orang, dan saat hujan/salju mereka memakai mantel & membawa payung. Uji HP (CPU 4×): tetap ±27 fps.
- **v31 — Kafe** (`js/cafe.js`, alat gambar bersama di `js/paintkit.js`):
  - Panel *Suasana → Pemandangan* punya pilihan **Tempat: Kamar santai / Kafe**. Kafe Jepang modern yang hangat: dinding plester krem, plafon & kisi kayu oak, lampu kertas yang berayun, meja bar menghadap jendela besar dengan bangku tinggi, konter barista (rak cangkir, papan menu, mesin espresso, lemari roti), pintu dengan tirai noren, tanaman, meja bundar, dan jam dinding yang jarumnya mengikuti jam sebenarnya. Jendela memakai ruang yang sama dengan kamar, jadi 6 pemandangan + cuaca (termasuk cuaca nyata) tetap berlaku.
  - **Barista** bolak-balik: membuat kopi di mesin (uap mengepul), membawanya ke konter, lalu kembali.
  - **Meja kita**: cangkir (latte & matcha dengan latte art, kopi susu, atau ocha di yunomi) dan roti (croissant, melon pan, sando buah). Isi minuman turun tiap ±1/6 dengan animasi cangkir terangkat seperti diminum; roti tergigit bertahap lalu tinggal remah. Setelah keduanya habis ±1 menit, **lengan pelayan** mengambil cangkir & piring lama lalu mengantar pesanan baru (denting cangkir kalau suara alam menyala). Tanpa Fokus: minuman ±20 menit, roti ±14 menit (hanya berjalan saat Lobby terbuka di Kafe). Dengan **Fokus**: satu porsi habis tepat di akhir sesi fokus, pesanan baru datang saat istirahat dimulai.
  - Suara otomatis di Kafe: obrolan kafe, plus hujan/badai dari luar yang lebih pelan. Efek suara pendek (`ambient.sfx`) hanya berbunyi kalau suara alam sudah aktif.
  - Lukisan kafe di-cache seperti kamar (kunci memuat tempat; `PAINT_V` naik ke `p6`, maks. 8 suasana di IndexedDB). Uji HP (CPU 4×): ±27 fps, lukisan pertama ±11 detik.
- **v30 — cuaca & waktu nyata** (`js/weather.js`):
  - Panel *Suasana → Pemandangan* punya switch **Ikuti cuaca & waktu nyata**. Lokasi dari GPS (sekali minta izin; nama kotanya dari BigDataCloud reverse geocoding) atau cari kota (Open-Meteo Geocoding). Saat aktif, pilihan cuaca & waktu manual disembunyikan; label di samping tanggal jadi mis. *Batam · 28° · hujan ringan*.
  - Cuaca dari [Open-Meteo](https://open-meteo.com) (gratis, tanpa key, data CC BY 4.0 — kredit tampil di panel): kode cuaca WMO dipetakan ke cerah/berawan/kabut/hujan/salju/badai; pagi/siang/senja/malam dihitung dari jam terbit & terbenam di lokasi itu. Dicek saat Lobby dibuka dan tiap menit (diambil ulang kalau sudah ±25 menit), data terakhir disimpan untuk offline. Koordinat dibulatkan ±1 km dan hanya disimpan di perangkat.
  - **Kelompok cuaca**: lukisan kini dibuat per *cerah / mendung / salju* (`paintWeather`), bukan per 6 cuaca. Berawan ↔ hujan ↔ badai ↔ kabut tidak melukis ulang: hujan mulai turun perlahan dan langit menggelap memudar (±1,5 detik). Variasi lukisan per lokasi turun dari 24 ke 12, jadi cache lebih sering terpakai (`PAINT_V` naik ke `p5`).
  - Lukisan untuk waktu berikutnya (mis. senja) disiapkan di waktu senggang ±20 menit sebelumnya, baik untuk waktu nyata maupun waktu *Otomatis*. Saat aplikasi dibuka, cuaca diambil dulu sebelum lukisan disiapkan.
- **v29 — Lobby mulus & UI lebih ringkas**:
  - **Performa Lobby**: kanvas dibatasi 1,5× resolusi layar (lukisan sudah lembut, jadi tetap tajam), HP/tablet memakai 30 fps, dan grain film kini lapisan CSS yang digeser compositor, bukan digambar ulang tiap frame. Hasil uji HP (CPU 4× lebih lambat): animasi ±15 → ±29 fps, lukisan pertama ±16 → ±8 detik. Opsi *Hemat baterai* dihapus karena HP otomatis memakai mode ringan.
  - **Ganti suasana tanpa "melukis dari nol"**: lukisan lama tetap tampil (dengan tanda kecil *Menyiapkan suasana baru…*) sampai lukisan baru selesai, lalu memudar ±0,9 detik; lampu menyala/padam perlahan. Tombol *Acak* dihapus.
  - **Tab suara ringkas**: yang sedang berbunyi tampil di atas dengan slider; suara lain berupa kisi ikon (ketuk untuk menyalakan). *Simpan racikan* (kolom nama di panel, bukan `prompt()`), *Tambah suara sendiri*, dan *Matikan semua* ada di menu *Lainnya*.
  - **Satu timer tidur** (`js/sleep.js`) untuk menu player dan Lobby: memelan 90 detik terakhir (musik + suara alam), layar Lobby meredup di 10 menit terakhir (sebelumnya nilai redup tidak pernah dipakai), plus pilihan *Akhir lagu ini* di keduanya. Label hitung mundur di player tidak lagi hilang saat status player berubah.
  - **Lebih ringan**: putar/jeda/ganti lagu hanya memperbarui baris yang diputar (`ui.updatePlaying`), mencatat riwayat tidak menggambar ulang daftar, dan setelan Lobby disimpan tanpa render ulang aplikasi (`store.saveUiQuiet`). Hitungan sesi Fokus disimpan per hari.
  - **Bar atas lebih bersih**: tombol tema dihapus; tema tetap di *Setelan → Umum* dan `Ctrl+K`.
- **v28 — Lobby lebih cepat**: lukisan kamar dibuat sekali pada resolusi tetap lalu disimpan di memori dan IndexedDB (WebP, maks. 6 suasana), jadi membuka Lobby lagi langsung tampil dan setelah aplikasi dibuka ulang hanya perlu ±0,3–0,8 detik. Beberapa detik setelah aplikasi dibuka, lukisan suasana saat ini disiapkan di waktu senggang (`requestIdleCallback`); kalau Lobby dibuka sebelum selesai, pekerjaan itu dilanjutkan, bukan diulang. Pelukis kuas kini berupa generator yang berhenti sejenak setiap jatah waktu frame habis (warp, pembacaan piksel per pita, sapuan, tepi, bloom), sehingga tidak ada langkah yang membuat layar macet lama. Perbaikan: Lobby yang dibuka ulang tidak lagi diam; sambungan pita atas/bawah di layar HP kini halus.
- **v27 — Lobby → lirik**: klik bar musik di Lobby untuk langsung membuka halaman lirik. Memakai View Transitions API (artwork, judul, dan channel "terbang" ke kepala halaman lirik; latar memudar) dengan cadangan animasi CSS untuk browser yang belum mendukung. Entri riwayat Lobby ditukar dengan lirik, jadi tombol Back menutup lirik. Thumbnail yang tidak tersedia di YouTube kini diganti otomatis (mencoba ukuran lain, lalu kotak bergradasi dengan ikon musik).
- **v26 — rekaman suara asli**: suara alam sekarang memakai rekaman asli dari koleksi open-source Moodist (lisensi CC0 / Pixabay, rincian di `sounds/CREDITS.md`), dipotong, disamakan kekerasannya, dan dikompres (±8,6 MB total). File hanya diunduh saat suaranya dinyalakan, lalu disimpan di cache terpisah sehingga jalan offline dan tidak diunduh ulang setiap update. Diputar berulang dengan crossfade equal-power (dijadwalkan ±90 detik ke depan supaya tetap mulus di tab latar), plus pembatas lembut di master supaya tidak pecah. Kalau file gagal dimuat, suara sintetis dipakai sebagai cadangan. Suara baru: hujan deras, burung camar, burung hantu, restoran ramai, kucing mendengkur; badai memakai hujan deras, pantai memakai burung camar, hutan malam memakai burung hantu.
- **v25 — bahasa Inggris & suara baru**:
  - **Pilihan bahasa**: Setelan → Umum → *Bahasa / Language*, `Ctrl+K` → “Language: English”, atau langsung di layar sambutan. Pengguna baru mengikuti bahasa browser; pengguna lama tetap bahasa Indonesia. Teks diterjemahkan oleh `js/i18n.js` dengan kamus di `js/i18n-en.js` (termasuk toast, dialog, menu yang muncul belakangan); judul lagu, nama playlist, tag, dan lirik ditandai `translate="no"` sehingga tidak ikut diubah. Tanggal & jam mengikuti bahasa, dan *Terjemahkan* lirik menerjemahkan ke bahasa yang dipilih.
  - **Hujan & petir baru**: hujan berlapis (desis yang dibentuk, gemuruh jauh, tetes halus, "plink" gelembung, tetes besar di kusen, gema ruang, intensitas naik-turun); petir berupa retakan (sambaran dekat) lalu gemuruh bergulung dengan beberapa pantulan dan gema panjang.
  - **Suara baru**: *Kafe ramai* (obrolan banyak orang yang disintesis dengan formant suara, dengung ruangan, denting cangkir, mesin espresso), *Orang ngobrol*, *Ketikan keyboard*, *Jam dinding*, *Kereta*, *Kipas angin*, *Lalu lintas* (kota sekarang memakai suara lalu lintas).
  - **Perbaikan**: pengaturan suara alam tidak lagi kembali ke setelan awal tiap menit. Mengatur suara sendiri otomatis mematikan *Ikuti suasana*.
- **v24 — lebih ringkas & bersih**:
  - **Font Poppins** di seluruh aplikasi (di-host sendiri di `fonts/`, lisensi SIL OFL).
  - **Kolom serbaguna**: kolom di bar atas untuk mencari *dan* menambah — tempel link YouTube (satu atau banyak) langsung masuk ke playlist yang sedang dibuka, ketik teks untuk mencari. Tombol **Tambah** (atau `A`) membuka panel lengkap (pilih playlist, cari di YouTube, dari library, import playlist, banyak link) sebagai kartu melayang, jadi daftar lagu tidak lagi terdorong ke bawah.
  - **Mulai cepat** jadi satu baris (progres + langkah berikutnya), daftar lengkap bisa dibuka.
  - **Header playlist**: Putar, Acak, satu tombol **Urutan & tampilan** (menu berisi urutan dan kepadatan daftar), dan ⋮. Baris lagu cukup ♥ dan ⋮ (naikkan/turunkan/ditonton ada di ⋮, urutan tetap bisa digeser).
  - Kaki sidebar jadi deretan ikon (Cloud Sync, Backup, Statistik, Yang baru).
  - **Lobby minimalis**: hanya Kamar santai. Empat ikon kecil di kanan atas — **Suasana** (tab Pemandangan & Suara alam, `S`), **Timer** (tab Fokus/Pomodoro & Timer tidur, `T`), Setelan, Tutup. Fokus & timer tampil sebagai widget kecil hanya saat aktif. Bar musik tipis di bawah (artwork dengan cadangan ukuran lain kalau thumbnail tidak ada), nama lokasi di samping tanggal, warna jam mengikuti cahaya (pagi kebiruan, senja oranye, malam krem), angka jam bergulir. Mode/latar lain dan unggah gambar latar dihapus (cuaca & lokasinya sudah ada di Kamar santai).
  - **Lukisan lebih manusiawi**: garis seperti digambar tangan (tidak ada yang lurus sempurna), sapuan kuas meruncing dengan jejak bulu kuas kering, terang sedikit hangat & bayangan sedikit dingin, dan barang-barang kecil (polaroid di tali lampu, bingkai foto, catatan tempel, kabel laptop, gumpalan kertas, pensil).
- **Lobby (v20, disederhanakan di v24)**: tombol sofa di bar atas (atau `B`) membuka layar santai penuh dengan Kamar santai, Fokus (Pomodoro) dan Timer tidur.
  - **13 suara alam disintesis langsung di browser** (tanpa file, jalan offline): hujan, petir, angin, ombak, api unggun, jangkrik, burung, sungai, kafe, piringan hitam, brown/pink/white noise. Mixer per suara, volume utama, preset, simpan racikan sendiri, dan **tambah suara sendiri** dari file audio (disimpan di perangkat).
  - Jam besar + sapaan (bisa pakai nama panggilan), lagu yang diputar dengan kontrol, baris lirik yang sedang dinyanyikan, tombol otomatis tersembunyi saat diam, mode hemat baterai, layar tetap menyala, opsi buka Lobby saat aplikasi dibuka. Suara alam tetap berbunyi setelah Lobby ditutup (ikon di player bawah).
- **v19**: error YouTube API sekarang menjelaskan penyebab persisnya (API belum diaktifkan di project, pembatasan website/API, key salah, kuota habis) beserta cara memperbaikinya; tombol **Tes key** di Setelan → Umum; permintaan ke API mengirim alamat lengkap halaman sehingga *Website restrictions* berbasis path ikut cocok.
- **v18 (dari review QA kedua)**:
  - **Mulai cepat**: kartu checklist langkah awal (tambah lagu, putar, API key, backup, pasang aplikasi) yang tercentang otomatis; bisa disembunyikan dan dibuka lagi lewat `Ctrl+K`.
  - **Apa yang baru**: muncul sekali setelah update (juga di sidebar → *Yang baru*).
  - **Mix untukmu**: rekomendasi lokal dari library sendiri (sering/lama tidak diputar, channel & tag favorit), berganti tiap hari.
  - **Periksa video rusak** (⋮ playlist): deteksi video dihapus/privat atau yang hanya bisa diputar di YouTube; tampilkan atau hapus sekaligus. Video yang gagal diputar juga ditandai otomatis.
  - **Terjemahan lirik** ke Bahasa Indonesia (MyMemory, gratis tanpa key; disimpan per lagu).
  - **Transisi halus antar lagu** (fade, ⋮ player). Crossfade sejati tidak mungkin dengan satu player YouTube.
  - **Export untuk Spotify / Apple Music**: daftar *Artis - Judul* atau CSV untuk TuneMyMusic/Soundiiz.
  - Filter cepat **Baru (7 hari)** dan **Tidak tersedia**, tombol tema di bar atas, pintasan `Q` (antrean) dan `F` (favorit), tooltip tombol menampilkan pintasannya.
- **Video tersembunyi secara bawaan (v17)**: di PC maupun HP yang tampil cukup player bawah; tekan ikon 🎥 di player (atau tombol `V`) untuk menampilkan video, tekan lagi untuk menyembunyikan. Musik tetap jalan saat video disembunyikan.
- **Tampilan HP (v16)**: mini player berupa kartu melayang di atas navigasi bawah dengan garis progres tipis; ikon 🎥 di mini player menampilkan/menyembunyikan video (musik tetap jalan); baris lagu lebih ringkas (judul 2 baris + channel, hati hanya tampil kalau favorit); kepala layar *Sedang diputar* tetap terlihat saat digulir. Perbaikan: daftar "Berikutnya" tidak lagi bocor di bawah mini player.
- **Ganti ke versi audio (v15)**: di layar lirik (atau ⋮ player) cari versi *Artis - Topic* / *Official Audio* yang durasinya sama dengan lirik, lalu **Ganti & putar** (posisi di playlist tetap, MV tetap di library) atau **Tambah di sebelahnya**. Memakai API key YouTube yang sama dengan *Cari di YouTube* (1 pencarian ±100 unit kuota).
- **Sinkron lirik (v13–v14)**: kalau durasi video beda dari versi audio (MV dengan intro), panel langsung meminta satu ketukan pada baris yang sedang terdengar; ada juga tombol *Perkiraan: intro +X dtk* dan *Sudah pas*. kalau lirik meleset (biasanya karena MV punya intro/adegan tambahan), tekan **Sinkronkan** di panel lirik lalu ketuk baris yang sedang dinyanyikan, atau geser ±0,5 detik (tombol `[` / `]`). Pengaturannya diingat per video.
- **Perintah cepat** (`Ctrl+K` / `⌘K`, atau tombol di bar atas): lompat ke playlist, koleksi, tag, lagu, atau jalankan aksi (tambah, cari, statistik, tema, mode tampilan, dll.)

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
js/share.js         link berbagi playlist (kompresi ke URL, validasi saat dibuka)
js/stats.js         log putar & waktu dengar lokal, ringkasan statistik
js/lyrics.js        lirik LRCLIB: pembersih judul, parser LRC, panel lirik
js/tint.js          warna aksen dari thumbnail lagu yang diputar
js/palette.js       command palette (Ctrl+K) + pencocokan fuzzy
js/recommend.js     rekomendasi lokal "Mix untukmu"
js/health.js        cek video dihapus/privat (YouTube API / oEmbed)
js/onboard.js       kartu Mulai cepat + Apa yang baru
js/lobby.js         Lobby: jam, lirik, suasana, suara alam, Fokus, timer tidur
js/sleep.js         timer tidur bersama (menu player & Lobby)
js/weather.js       cuaca & waktu nyata untuk Lobby (Open-Meteo, cari kota, GPS)
js/cafe.js          Kafe: interior, sprite, barista, kopi & roti di meja kita, pelayan
js/visitors.js      pengunjung Kafe (gambar orang + siklus masuk/pesan/duduk/pulang)
js/paintkit.js      alat gambar bersama Kamar & Kafe (ruang virtual, warna, cahaya, kayu, daun)
js/scenes.js        penjalan animasi canvas Lobby
js/room.js          scene Kamar santai: lokasi, cuaca, waktu + suara yang cocok
js/paint.js         pelukis sapuan kuas untuk Kamar santai
js/i18n.js          pilihan bahasa + penerjemah tampilan
js/i18n-en.js       kamus Indonesia → Inggris
sounds/             rekaman suara alam (MP3, CC0/Pixabay) + CREDITS.md
fonts/              Poppins (woff2, SIL OFL)
js/ambient.js       suara alam sintesis (Web Audio) + suara sendiri
js/idb.js           penyimpanan file besar di perangkat (IndexedDB)
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
- Layanan luar yang dihubungi: YouTube (player, thumbnail, oEmbed judul), noembed.com (cadangan pengambil judul), api.github.com. Hanya kalau *Ikuti cuaca & waktu nyata* aktif: api.open-meteo.com & geocoding-api.open-meteo.com (koordinat dibulatkan ±1 km), dan api.bigdatacloud.net sekali saat tombol GPS ditekan (untuk nama kota).

## Batasan yang perlu diketahui

- **Judul video** diambil lewat oEmbed tanpa API key; kalau gagal, judul terisi otomatis saat video diputar, atau bisa diubah manual. Durasi terisi setelah video pertama kali diputar.
- **Video dengan embed dimatikan pemiliknya** tidak bisa diputar di player — tersedia tombol “Buka di YouTube”.
- Ketentuan YouTube mewajibkan player terlihat minimal 200×200 px, jadi mode “audio saja” sengaja tidak disediakan. Pemutaran di background HP mengikuti kebijakan browser.
- **Putar di latar belakang / layar mati** di Android mengikuti kebijakan YouTube dan Chrome; kontrol di notifikasi bersifat best-effort karena audio berasal dari iframe YouTube.
- LocalStorage umumnya dibatasi ±5 MB — cukup untuk puluhan ribu video. Ukuran saat ini terlihat di *Pengaturan → Umum*.
- GitHub membatasi request yang membuat konten; karena itu ada jarak minimal 8 detik antar-penyimpanan. Kalau tetap kena limit, sync dicoba ulang otomatis.

## Status rekomendasi review QA

**Sudah ada sebelum review** (klaim review tidak berlaku): validasi & pratinjau import + snapshot sebelum menimpa, antrean metadata dengan batas paralel, service worker/offline shell, `loading="lazy"` + `decoding="async"`, badge durasi & total durasi playlist, Urungkan saat hapus dari playlist, konfirmasi kosongkan/hapus playlist, toast `aria-live`, `lang="id"`, `prefers-reduced-motion`, `:focus-visible`, escape HTML untuk semua teks pengguna (anti-XSS), penanganan penyimpanan penuh.

**Dikerjakan di putaran ini:** fallback/timeout player, banner offline, penangkap error global, peringatan kuota, batas ukuran file import, pilih banyak + aksi massal, timer tidur, kecepatan putar, riwayat + lanjut posisi, muat otomatis saat gulir, sorotan pencarian + tombol hapus, debounce 250 ms, pintasan keyboard + modal `?`, skip link, judul iframe, toast yang bisa ditutup/dijeda, animasi favorit, sorot item baru, duplikat & urutkan playlist.

**Sengaja tidak dikerjakan:**
- *Mode audio saja, unduh video untuk offline, pemilih kualitas*: melanggar ketentuan YouTube / API kualitas sudah tidak berpengaruh sejak YouTube mengatur kualitas otomatis.
- *Putar di latar belakang di dalam aplikasi web*: sudah dicoba, player YouTube menjeda dirinya sendiri; solusinya **Putar di aplikasi YouTube**.
- *Picture-in-Picture tombol sendiri*: video ada di iframe YouTube (lintas domain), jadi tidak bisa dipanggil dari aplikasi; pakai tombol layar penuh → Home di Android.
- *Library React (react-window, zod, p-queue), Sentry/analitik, CDN, A/B test, kolaborasi & follow pengguna*: aplikasi ini sengaja tanpa build step dan tanpa server; GitHub Pages sudah memakai CDN + kompresi.
- *Virtualisasi penuh*: diganti muat-bertahap 200 item saat digulir — cukup untuk ribuan video tanpa menambah kerumitan.

**Ide lanjutan yang sudah dikerjakan:** import playlist YouTube, tag, link berbagi, statistik, lirik, shortcut `L`/`Y`, kolom tambah yang tetap terlihat saat menggulir.

**Ide yang sengaja tidak diambil:** *Dexie/IndexedDB* (localStorage ±5 MB cukup untuk ±20 ribu lagu, ada peringatan saat hampir penuh, dan data juga tersimpan di Gist), *Firebase/Supabase + login + playlist kolaboratif* (butuh server & akun; sinkron lintas perangkat sudah lewat Gist milikmu), *mode audio saja / PiP* (dibatasi aturan & teknis player YouTube), *framework React/Tailwind/Vite* (aplikasi ini sengaja tanpa build step).

## Ide pengembangan berikutnya

- Pindah penyimpanan ke IndexedDB untuk library yang sangat besar
- UI tag/kategori (field `tags` sudah ada di data model) dan smart playlist berbasis tag
- Bulk edit (pilih banyak video sekaligus)
- Merge otomatis saat konflik (saat ini pilih salah satu versi)
- Import dari URL playlist YouTube (butuh YouTube Data API key)
