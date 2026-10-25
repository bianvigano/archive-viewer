# Panduan Desain & UI Pattern: Penampil Arsip

Desain ini menggunakan pendekatan **Utilitarian File Manager** (terinspirasi dari GitHub dan peralatan sistem modern). Fokus utamanya adalah keterbacaan data (nama berkas & ukuran byte), navigasi cepat, serta ketiadaan elemen dekoratif yang berlebihan (*zero AI slop*).

---

## Implemented interaction components

The first revision now uses native accessible dialogs for archive errors and destructive session cleanup, a contextual menu for file rows and archive tabs, semantic toast feedback, and keyboard navigation. Browser-first ZIP/TAR/GZ handling, server fallback, session cleanup, and media previews remain unchanged. Password input is intentionally omitted: the current backends expose no password-capable API, so encrypted archives report that limitation accurately.

---

## 1. Palet Warna (Color Palette)

Menggunakan basis warna netral **Slate** agar mata tidak cepat lelah saat memindai ratusan baris berkas.

### A. Latar Belakang (Background & Surface)
| Peran | Nama Warna (Tailwind) | Kode HEX | Penggunaan |
| :--- | :--- | :--- | :--- |
| **Background Halaman** | `bg-slate-50` | `#F8FAFC` | Latar belakang utama halaman di luar kartu/tabel |
| **Surface / Kartu Utama** | `bg-white` | `#FFFFFF` | Area konten aktif, daftar berkas, dan tab aktif |
| **Surface Sekunder** | `bg-slate-100` | `#F1F5F9` | Header tabel, tab tidak aktif, dan area pratinjau |
| **Row Hover** | `hover:bg-slate-50` | `#F8FAFC` | Warna sorot saat kursor berada di atas baris berkas |

### B. Tipografi (Text Colors)
| Peran | Nama Warna (Tailwind) | Kode HEX | Penggunaan |
| :--- | :--- | :--- | :--- |
| **Teks Utama** | `text-slate-900` | `#0F172A` | Judul halaman, nama berkas, tab aktif |
| **Teks Sekunder** | `text-slate-600` | `#475569` | Label form, ukuran berkas (`byte`), tab tidak aktif |
| **Teks Redup (Muted)** | `text-slate-400` | `#94A3B8` | Nomor urut baris, ikon indikator, teks *placeholder* |

### C. Garis Batas (Borders & Dividers)
| Peran | Nama Warna (Tailwind) | Kode HEX | Penggunaan |
| :--- | :--- | :--- | :--- |
| **Border Utama** | `border-slate-200` | `#E2E8F0` | Garis tepi kontainer, pemisah antar baris berkas, batas tab |
| **Border Input / Tombol** | `border-slate-300` | `#CBD5E1` | Garis tepi pada `<select>`, `<input>`, dan tombol sekunder |

### D. Aksi & Semantik (Action & Status)
| Peran | Nama Warna (Tailwind) | Kode HEX | Penggunaan |
| :--- | :--- | :--- | :--- |
| **Aksi Utama (Primary)** | `bg-slate-900` | `#0F172A` | Tombol `Unggah`, tombol `Buka` |
| **Aksi Utama (Hover)** | `hover:bg-slate-800` | `#1E293B` | Efek *hover* tombol utama |
| **Tautan / Aksi Lihat** | `text-blue-600` | `#2563EB` | Tautan `Lihat` dan `Kembali ke Daftar File` |
| **Danger (Teks & Ikon)** | `text-red-600` | `#DC2626` | Tombol `Hapus tab dan data sementara` |
| **Danger (Background Hover)**| `hover:bg-red-50` | `#FEF2F2` | Latar tombol hapus saat disentuh kursor |
| **Warning / Info Sistem** | `bg-amber-50` / `text-amber-800` | `#FFFBEB` / `#92400E` | Pesan `RAR tidak didukung oleh 7zz yang terpasang` |

---

## 2. Tipografi (Typography Pattern)

* **Font UI (Sans-Serif):** `Inter`, `-apple-system`, ` BlinkMacSystemFont`, `sans-serif`
  * Digunakan untuk: Judul seksi, tombol, label dropdown, dan pesan status.
* **Font Data (Monospace):** `JetBrains Mono`, `Fira Code`, `monospace`
  * Digunakan untuk: Nama arsip (`.zip`), nama berkas (`.jpg`, `.txt`), ukuran byte (`5220437 byte`), dan isi berkas teks (`lorem.txt`).

---

## 3. UI Patterns (Struktur Komponen)

### A. Pattern Tab Arsip Horizontal (Geser Samping, Tanpa Turun ke Bawah)
Menggunakan `flex-nowrap` dan `overflow-x-auto` pada pembungkusnya, serta `shrink-0` dan `whitespace-nowrap` pada setiap item tab agar tab selalu sejajar ke samping dan tidak pernah terlipat ke bawah.

```css
/* CSS Tambahan untuk menyembunyikan scrollbar pada bar tab */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

```html
<!-- Container Tab Horizontal -->
<div id="archive-tabs" class="flex items-center gap-1 overflow-x-auto flex-nowrap no-scrollbar border-b border-slate-200">
  
  <!-- Tab Aktif -->
  <button type="button" class="shrink-0 whitespace-nowrap rounded-t border-t border-l border-r border-slate-200 bg-white text-slate-900 font-semibold -mb-px px-3.5 py-2 text-xs font-mono">
    drive-download-20240721T150318Z-001.zip
  </button>

  <!-- Tab Tidak Aktif -->
  <button type="button" class="shrink-0 whitespace-nowrap rounded-t border-t border-l border-r border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200/70 px-3.5 py-2 text-xs font-mono transition-colors">
    test.zip
  </button>

</div>
```

### B. Pattern Panel Kontrol (Unggah & Arsip Lokal)
Menggabungkan input unggah berkas dan pemilih arsip lokal dalam satu bar ringkas tanpa memakan banyak ruang vertikal.

```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded border border-slate-200">
  <!-- Unggah Berkas -->
  <div>
    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Unggah Arsip</label>
    <div class="flex items-center gap-2">
      <input type="file" class="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100" />
      <button class="shrink-0 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-3.5 py-1.5 rounded">
        Unggah
      </button>
    </div>
  </div>

  <!-- Pilih Arsip Lokal -->
  <div>
    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Arsip Lokal</label>
    <div class="flex items-center gap-2">
      <select class="w-full text-xs font-mono border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800">
        <option>drive-download-20240721T150318Z-001.zip</option>
        <option>test.zip</option>
      </select>
      <button class="shrink-0 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-3.5 py-1.5 rounded">
        Buka
      </button>
    </div>
  </div>
</div>
```

### C. Pattern Bar Header Arsip & Tombol Hapus
Menempatkan informasi nama arsip yang sedang dibuka berseberangan dengan tombol destruktif agar pengguna tidak salah klik.

```html
<div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
  <div class="text-xs font-mono font-medium text-slate-80