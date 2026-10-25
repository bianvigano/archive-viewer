# Archive Viewer

Penampil lokal browser-first untuk ZIP, TAR, TAR.GZ, TGZ, dan GZ: file diproses di browser, dengan preview lazy melalui Blob URL. 7z dan RAR tetap memakai fallback server hanya setelah pengguna memilih Unggah; RAR bergantung pada codec 7zz. Daftar dan preview server legacy tetap memakai `7zz` tanpa ekstraksi ke filesystem.

## Instalasi dan menjalankan

Prasyarat:

- Linux
- Node.js dan npm
- Jika memakai arsip 7z/RAR, executable `7zz` di `.tools/usr/bin/7zz` sudah disediakan oleh project.

Dari folder project, jalankan:

```bash
npm install
npm test
npm start
```

Setelah server berjalan, buka `http://localhost:3000` di browser. `npm install` hanya perlu dijalankan saat pertama kali atau setelah `package.json` berubah. `npm test` adalah pemeriksaan opsional sebelum menjalankan aplikasi.

Untuk menghentikan server, tekan `Ctrl+C`.

Jika project dipindahkan ke komputer lain, salin seluruh folder project lalu jalankan `npm install` dari folder tersebut. Jika `7zz` tidak tersedia atau ingin memakai instalasi sistem, arahkan ke executable lain:

```bash
SEVEN_ZIP=/usr/bin/7zz npm start
```

Jika Node.js/npm belum terpasang di Ubuntu/Debian:

```bash
sudo apt update
sudo apt install nodejs npm
```

Setelah itu ulangi `npm install` dan `npm start` dari folder project.

## Menjalankan

`npm start` menjalankan server lokal. Untuk penggunaan normal, ikuti bagian **Instalasi dan menjalankan** di atas.

```bash
npm start
```

**Catatan:** port default aplikasi ditentukan oleh `app.js`; jika port tersebut sedang dipakai, hentikan aplikasi yang memakai port itu atau ubah konfigurasi sesuai kode aplikasi.

## Dependensi 7-Zip

`7zip-bin` disertakan untuk Linux. Pada sistem ini backend lokal `.tools/usr/bin/7zz` berasal dari paket Ubuntu `7zip`; set `SEVEN_ZIP=/path/ke/7zz` bila perlu. Batas unggah 50 MiB, maksimal 1.000 entri, dan preview 1 MiB. Arsip terenkripsi/password dan RAR tidak diuji bila tidak tersedia fixture legal; dukungan bergantung pada codec 7-Zip. Path traversal ditolak dan isi tidak pernah diekstrak ke disk.

### Folder `.tools`

Folder `.tools` berisi salinan lokal executable `7zz` beserta paket dan dokumentasi 7-Zip. Folder ini dipakai sebagai fallback server untuk membaca daftar dan isi arsip 7z/RAR, serta fitur legacy yang membutuhkan `7zz`. ZIP, TAR, TAR.GZ, TGZ, dan GZ yang diproses langsung di browser tidak membutuhkan folder ini. Folder `.tools` masuk `.gitignore` dan tidak ikut commit Git. Jika executable dipindahkan atau dihapus, set variabel lingkungan `SEVEN_ZIP` ke lokasi `7zz` pengganti.

## Pengujian

```bash
npm test
```


## Penyimpanan sementara
Arsip hanya berlaku selama proses server terbuka (bukan selama tab browser terbuka). Unggahan dan cache media berada di direktori sesi `uploads/session-PID-random`; SIGINT/SIGTERM menghapus sesi. Arsip lokal asli tidak dihapus. Tidak ada binary arsip di localStorage; sessionStorage hanya menyimpan tab terpilih. Metadata arsip hanya di RAM.

Idle default 30 menit, anggaran disk terkelola default 200 MiB; cleanup periodik unref, skip ketika ekstraksi/stream aktif. Cache media maksimal 10 MiB. Tab dapat dihapus manual. Kill -9 tidak menjalankan shutdown: startup berikutnya membersihkan sesi bertanda milik aplikasi yang PID-nya sudah mati setelah TTL idle. File tidak dikenal tidak disentuh.

Konfigurasi: `ARCHIVE_IDLE_MS` atau `ARCHIVE_IDLE_MINUTES`, `ARCHIVE_MAX_STORAGE` (byte), `ARCHIVE_UPLOAD_DIR` (alias `MEDIA_UPLOADS`, direktori terisolasi untuk test; hanya file yang dibuat proses ini dibersihkan). Nilai idle minimum 1000 ms. Jangan jalankan proses bersamaan pada direktori test yang sama.
`7zip-bin` disertakan untuk Linux. Pada sistem ini backend lokal `.tools/usr/bin/7zz` berasal dari paket Ubuntu `7zip`; set `SEVEN_ZIP=/path/ke/7zz` bila perlu. Batas unggah 50 MiB, maksimal 1.000 entri, dan preview 1 MiB. Arsip terenkripsi/password dan RAR tidak diuji bila tidak tersedia fixture legal; dukungan bergantung pada codec 7-Zip. Path traversal ditolak dan isi tidak pernah diekstrak ke disk.

### Folder `.tools`

Folder `.tools` berisi salinan lokal executable `7zz` beserta paket dan dokumentasi 7-Zip. Folder ini dipakai sebagai fallback server untuk membaca daftar dan isi arsip 7z/RAR, serta fitur legacy yang membutuhkan `7zz`. ZIP, TAR, TAR.GZ, TGZ, dan GZ yang diproses langsung di browser tidak membutuhkan folder ini. Folder `.tools` masuk `.gitignore` dan tidak ikut commit Git. Jika executable dipindahkan atau dihapus, set variabel lingkungan `SEVEN_ZIP` ke lokasi `7zz` pengganti.

```bash
npm test
```


## Penyimpanan sementara
Arsip hanya berlaku selama proses server terbuka (bukan selama tab browser terbuka). Unggahan dan cache media berada di direktori sesi `uploads/session-PID-random`; SIGINT/SIGTERM menghapus sesi. Arsip lokal asli tidak dihapus. Tidak ada binary arsip di localStorage; sessionStorage hanya menyimpan tab terpilih. Metadata arsip hanya di RAM.

Idle default 30 menit, anggaran disk terkelola default 200 MiB; cleanup periodik unref, skip ketika ekstraksi/stream aktif. Cache media maksimal 10 MiB. Tab dapat dihapus manual. Kill -9 tidak menjalankan shutdown: startup berikutnya membersihkan sesi bertanda milik aplikasi yang PID-nya sudah mati setelah TTL idle. File tidak dikenal tidak disentuh.

Konfigurasi: `ARCHIVE_IDLE_MS` atau `ARCHIVE_IDLE_MINUTES`, `ARCHIVE_MAX_STORAGE` (byte), `ARCHIVE_UPLOAD_DIR` (alias `MEDIA_UPLOADS`, direktori terisolasi untuk test; hanya file yang dibuat proses ini dibersihkan). Nilai idle minimum 1000 ms. Jangan jalankan proses bersamaan pada direktori test yang sama.
