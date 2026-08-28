# XINZZ Panel Backend

Backend ini cocok dengan frontend XINZZ Panel yang memiliki endpoint:

- GET /status
- POST /control

## Deploy ke Render

1. Upload folder ini ke repository GitHub baru, misalnya `xinz-backend`.
2. Render -> New -> Web Service.
3. Pilih repository backend.
4. Build Command:
   npm install
5. Start Command:
   npm start
6. Deploy.
7. Salin URL Render, misalnya:
   https://xinz-backend.onrender.com
8. Masukkan URL itu ke kolom API URL pada XINZZ Panel.

## Penting

Backend ini memakai PM2 untuk mengontrol proses SC:

    pm2 start index.js --name xinzz-sc

Ganti `index.js` dengan file start XINZZ SC kamu.

Render free tier cocok untuk backend API, tetapi bukan tempat ideal untuk menjalankan bot WhatsApp 24/7 karena service dapat sleep.
