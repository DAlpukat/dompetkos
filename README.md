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

## 🤖 Telegram Bot (opsional)

Catat transaksi dari Telegram — data masuk Firestore yang sama jadi langsung muncul di web. Dashboard di Telegram cuma total saldo bulan ini.

**Opsi A — Cloudflare Workers (24/7, free tanpa kartu, stateless):**
```bash
# 1. bikin bot di @BotFather, copy token
# 2. deploy worker:
npm i -g wrangler
wrangler login
wrangler secret put TELEGRAM_BOT_TOKEN   # paste token
# opsional: wrangler secret put FIREBASE_PROJECT_ID  # default dompetkos-b5877
wrangler deploy
# 3. set webhook (ganti URL hasil deploy):
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://dompetkos-bot.<kamu>.workers.dev"
```

**Opsi B — Lokal polling (tanpa hosting, Node 18+, zero deps):**
```bash
set TELEGRAM_BOT_TOKEN=123456:ABC   # PowerShell | Bash: TELEGRAM_BOT_TOKEN=... node telegram-bot.js
node telegram-bot.js
node telegram-bot.js --check  # cek parser tanpa token
```

Di chat: `/input` → tipe → kategori (pilih ada / `➕ Kategori baru`) → nominal → deskripsi → tanggal. `/saldo` / `/batal`.

Nominal fleksibel: `15000` · `15.000` · `15,000` · `15rb` · `2jt` · `1,5jt` (titik/koma bebas).
Tanggal fleksibel: `-` (= hari ini) · `kemarin` · `20/8` · `2026-08-20`; kosong = hari ini.

## 📦 Struktur

```
public/               # Web app (di-deploy ke Firebase Hosting)
  index.html          # Semua kode app (HTML, CSS, JS)
  manifest.json       # PWA manifest
  dompet.png/.svg     # Icon
telegram-bot.js       # Bot polling lokal (Node zero-deps)
worker.js + wrangler.toml  # Bot webhook Cloudflare Workers (session di Firestore)
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
