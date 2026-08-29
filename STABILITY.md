# Backend stability notes

## Start with auto-restart
npm run start:stable

## Standard start
npm start

The watchdog restarts `server.js` if the backend process exits unexpectedly.
This does not modify the WhatsApp QR/pairing code.

For a truly 24/7 public link, the hosting platform itself must remain running.
Codespaces URLs can still sleep/stop when the Codespace is suspended.
