# XINZZ Panel Backend v2.3 FRESH QR FIX

Perbaikan khusus QR:
- Membaca ulang data/qr.png terbaru dari SC.
- Cache browser/API dimatikan untuk endpoint QR.
- `/status` mengirim QR terbaru + `qrVersion`.
- `/qr.png` selalu mengirim isi file terbaru dengan header no-cache.
- Tidak mengubah sistem QR/pairing asli SC.

Cara menjalankan:
npm install
npm start

Jika port 3000 sudah dipakai:
pkill -f node
npm start
