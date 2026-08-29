# XINZZ Panel Backend v2.6 STABLE LONGRUN

Backend panel yang dibuat lebih stabil untuk pemakaian lama.

## Jalankan
```bash
npm install
npm run start:stable
```

## Endpoint
- `/status`
- `/health`
- `/qr`
- `/qr.png`
- `/upload`
- `/install`
- `/control`
- `/logs`

## Catatan
Sistem QR/pairing SC tidak diubah. Backend hanya membaca QR yang dihasilkan SC seperti versi sebelumnya.


## API URL permanen
Versi fix menyimpan API URL di `storage/panel-config.json` melalui endpoint:

- `GET /config`
- `POST /config`
- `GET /connection-info`

Jika memakai domain sendiri, isi `PANEL_PUBLIC_URL` di `.env` agar URL API tidak berubah saat restart.

Contoh:
```env
PANEL_PUBLIC_URL=https://panel-api.example.com
```

Catatan: URL forwarding sementara seperti GitHub Codespaces dapat berubah bila environment/forwarding berubah. Untuk benar-benar stabil gunakan domain/reverse proxy atau simpan URL yang aktif melalui `/config`.
