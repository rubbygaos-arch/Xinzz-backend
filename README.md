# XINZZ Panel Backend v2.2 QR ROUTE FIX

Fitur:
- Upload ZIP SC dan extract otomatis
- npm install
- Start / Stop / Restart
- Console log
- Status CPU/RAM
- QR bridge: menangkap QR asli dari SC yang menggunakan `qrcode-terminal`
- `GET /qr`, `GET /qr.png`, dan field `qr` pada `/status`
- Membaca QR asli SC dari `data/qr.png` tanpa mengubah sistem QR/pairing SC

## Jalankan
```bash
npm install
npm start
```

Buka port 3000 sebagai public di Codespaces.

## Penting
Backend ini tidak mengganti QR menjadi pairing code. QR tetap dihasilkan oleh SC.
Jika SC tidak menggunakan `qrcode-terminal`, integrasi QR perlu disesuaikan dengan file koneksi SC tersebut.
