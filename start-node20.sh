#!/usr/bin/env bash
set -e

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

if command -v nvm >/dev/null 2>&1; then
  nvm use 20 >/dev/null || true
fi

echo "Node aktif: $(node -v)"
npm run start:stable
