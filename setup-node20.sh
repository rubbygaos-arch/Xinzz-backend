#!/usr/bin/env bash
set -e

echo "=== XINZZ BACKEND NODE 20 SETUP ==="

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

if ! command -v nvm >/dev/null 2>&1; then
  echo "nvm tidak ditemukan. Gunakan Rebuild Container dengan konfigurasi .devcontainer Node 20."
  exit 1
fi

nvm install 20
nvm use 20

echo "Node aktif: $(node -v)"
npm install
echo "Selesai. Jalankan: npm start"
