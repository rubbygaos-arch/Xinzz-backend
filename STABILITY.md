# XINZZ Backend v2.6 STABLE LONGRUN

Fokus versi ini adalah menjaga backend lebih tahan lama tanpa mengubah sistem QR/pairing SC.

## Tambahan stabilitas
- Watchdog dengan backoff progresif agar tidak restart-loop terlalu cepat.
- Restart delay kembali normal hanya setelah backend benar-benar stabil.
- State install dan informasi script disimpan agar tidak langsung hilang saat backend direstart.
- Endpoint `/health` untuk pengecekan hidup.
- Pembersihan file upload sementara yang sudah lama.
- Batas log lebih terkontrol agar RAM tidak terus naik.
- Pembersihan memori berkala jika Node dijalankan dengan `--expose-gc`.
- Penanganan shutdown dan error proses lebih aman.

## Menjalankan
```bash
npm install
npm run start:stable
```

QR/pairing asli SC tidak diubah.
