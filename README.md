# DompetKos 💰

Sahabat keuangan anak kos yang merantau. Aplikasi budgeting **offline-first** dengan cloud sync via **Firebase**, langsung jalan di browser tanpa install — bisa dipakai sebagai PWA.

## 🚀 Live

**https://dompetkos-b5877.web.app**

## ✨ Fitur

- **Saldo bulan ini** — pantau pemasukan, pengeluaran, dan sisa uang sekilas
- **Budget per kategori** — atur limit bulanan/harian, lihat progres pakai
- **Kelola kategori** — buat kategori pemasukan & pengeluaran sendiri (nama, emoji, warna)
- **Transaksi lengkap** — catat, edit, hapus, filter per kategori/jenis, dikelompokkan per tanggal
- **Grafik distribusi** — donut chart sebaran pengeluaran + bar chart tren harian (7/14/30 hari)
- **Target tabungan** — wujudkan impian dengan progress ring
- **Cloud sync realtime** — semua data tersinkron lewat Firestore
- **Taktik hemat** — tips hemat anak kos

## 🛠️ Stack

- HTML + CSS + Vanilla JS (tanpa framework)
- [Firebase Firestore](https://firebase.google.com/products/firestore) — database realtime
- [Firebase Hosting](https://firebase.google.com/products/hosting) — hosting & deploy

## 📦 Struktur

```
public/               # Web app (di-deploy ke Firebase Hosting)
  index.html          # Semua kode app (HTML, CSS, JS)
  manifest.json       # PWA manifest
  dompet.png/.svg     # Icon
```

## ⚙️ Setup Lokal

Tidak ada build step. Cukup buka `public/index.html`, atau jalankan server statis:

```bash
npx serve public
```

## 🔑 Konfigurasi Firebase

Config ada di `public/index.html` (blok `firebaseConfig`). Jika memakai project sendiri, ganti nilai tersebut lalu aktifkan Firestore di console.

## 🚢 Deploy

```bash
firebase login
firebase deploy --only hosting
```

## 📄 Lisensi

MIT — silakan pakai, modifikasi, dan bagikan.
