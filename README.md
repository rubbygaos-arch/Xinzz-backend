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


## NODE.JS 20 FIX (V2.4)

Backend ini dikunci untuk Node.js 20 agar sama dengan environment SC di Pterodactyl.

### Cara pakai di GitHub Codespaces
1. Extract ZIP ini.
2. Buka terminal.
3. Jalankan:
   chmod +x setup-node20.sh start-node20.sh
   ./setup-node20.sh
4. Setelah selesai:
   ./start-node20.sh

Cek harus menampilkan Node v20.x.x.

Jika Codespaces masih memakai Node 24, pilih **Codespaces / Rebuild Container** agar file `.devcontainer/devcontainer.json` memakai image Node 20.
