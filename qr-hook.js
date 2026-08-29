// QR bridge: captures raw QR without changing the SC's own login flow.
// Works when the SC uses qrcode-terminal to render the Baileys QR.
const fs = require('fs');

function save(raw) {
  try {
    const file = process.env.XINZZ_QR_FILE;
    if (!file || !raw) return;
    fs.writeFileSync(file, String(raw), 'utf8');
  } catch (_) {}
}

try {
  const qrterm = require('qrcode-terminal');
  if (qrterm && typeof qrterm.generate === 'function' && !qrterm.__xinzzPatched) {
    const original = qrterm.generate.bind(qrterm);
    qrterm.generate = function (qr, ...args) {
      save(qr);
      return original(qr, ...args);
    };
    qrterm.__xinzzPatched = true;
  }
} catch (_) {}
