# Archive Viewer

Penampil lokal browser-first untuk ZIP, TAR, TAR.GZ, TGZ, dan GZ: file diproses di browser, dengan preview lazy melalui Blob URL. 7z dan RAR tetap memakai fallback server hanya setelah pengguna memilih Unggah; RAR bergantung pada codec 7zz. Daftar dan preview server legacy tetap memakai `7zz` tanpa ekstraksi ke filesystem.

## Menjalankan

```bash
npm install
npm start
```

`7zip-bin` disertakan untuk Linux. Pada sistem ini backend lokal `.tools/usr/bin/7zz` berasal dari paket Ubuntu `7zip`; set `SEVEN_ZIP=/path/ke/7zz` bila perlu. Batas unggah 50 MiB, maksimal 1.000 entri, dan preview 1 MiB. Arsip terenkripsi/password dan RAR tidak diuji bila tidak tersedia fixture legal; dukungan bergantung pada codec 7-Zip. Path traversal ditolak dan isi tidak pernah diekstrak ke disk.

```bash
npm test
```


## Penyimpanan sementara
Arsip hanya berlaku selama proses server terbuka (bukan selama tab browser terbuka). Unggahan dan cache media berada di direktori sesi `uploads/session-PID-random`; SIGINT/SIGTERM menghapus sesi. Arsip lokal asli tidak dihapus. Tidak ada binary arsip di localStorage; sessionStorage hanya menyimpan tab terpilih. Metadata arsip hanya di RAM.

Idle default 30 menit, anggaran disk terkelola default 200 MiB; cleanup periodik unref, skip ketika ekstraksi/stream aktif. Cache media maksimal 10 MiB. Tab dapat dihapus manual. Kill -9 tidak menjalankan shutdown: startup berikutnya membersihkan sesi bertanda milik aplikasi yang PID-nya sudah mati setelah TTL idle. File tidak dikenal tidak disentuh.

Konfigurasi: `ARCHIVE_IDLE_MS` atau `ARCHIVE_IDLE_MINUTES`, `ARCHIVE_MAX_STORAGE` (byte), `ARCHIVE_UPLOAD_DIR` (alias `MEDIA_UPLOADS`, direktori terisolasi untuk test; hanya file yang dibuat proses ini dibersihkan). Nilai idle minimum 1000 ms. Jangan jalankan proses bersamaan pada direktori test yang sama.
