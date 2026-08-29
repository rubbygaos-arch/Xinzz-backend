const express = require('express');
const cors = require('cors');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TOKEN = (process.env.PANEL_TOKEN || '').trim();

const ROOT = path.join(__dirname, 'storage');
const UPLOADS = path.join(ROOT, 'uploads');
const SCRIPT_DIR = path.join(ROOT, 'script');
const QR_FILE = path.join(ROOT, 'latest-qr.txt');
const QR_HOOK = path.join(__dirname, 'qr-hook.js');
const STATE_FILE = path.join(ROOT, 'backend-state.json');
const MAX_LOG_LINES = Math.max(200, Number(process.env.MAX_LOG_LINES || 1000));
const LOG_KEEP_LINES = Math.max(100, Math.min(MAX_LOG_LINES, Number(process.env.LOG_KEEP_LINES || 700)));
const CLEANUP_INTERVAL_MS = Math.max(60_000, Number(process.env.CLEANUP_INTERVAL_MS || 30 * 60 * 1000));
const STALE_UPLOAD_MS = Math.max(60_000, Number(process.env.STALE_UPLOAD_MS || 6 * 60 * 60 * 1000));
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(SCRIPT_DIR, { recursive: true });

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.set('etag', false);
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

function auth(req, res, next) {
  if (!TOKEN) return next();
  const got = req.get('x-panel-token') || req.query.token || '';
  if (got !== TOKEN) return res.status(401).json({ ok:false, message:'Token panel salah' });
  next();
}

const upload = multer({
  dest: UPLOADS,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.zip')) return cb(new Error('Hanya file .zip yang diterima'));
    cb(null, true);
  }
});

let child = null;
let logs = [];
let installed = false;
let scriptInfo = null;
let startedAt = Date.now();
let shuttingDown = false;

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      installed,
      scriptInfo,
      updatedAt: new Date().toISOString()
    }), 'utf8');
  } catch (_) {}
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    installed = !!state.installed;
    scriptInfo = state.scriptInfo || null;
  } catch (_) {
    installed = false;
    scriptInfo = null;
  }
}

function cleanupStorage() {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(UPLOADS)) {
      const file = path.join(UPLOADS, name);
      try {
        const stat = fs.statSync(file);
        if (stat.isFile() && now - stat.mtimeMs > STALE_UPLOAD_MS) fs.rmSync(file, { force:true });
      } catch (_) {}
    }
    if (logs.length > MAX_LOG_LINES) logs = logs.slice(-LOG_KEEP_LINES);
    if (global.gc) global.gc();
  } catch (_) {}
}

loadState();
let qrRaw = '';
let qrDataUrl = '';
let qrBusy = false;

function addLog(line) {
  const text = String(line).replace(/\r/g, '');
  for (const part of text.split('\n')) {
    if (part.trim()) logs.push(`[${new Date().toLocaleTimeString()}] ${part}`);
  }
  if (logs.length > MAX_LOG_LINES) logs = logs.slice(-LOG_KEEP_LINES);
}

async function setQR(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === qrRaw || qrBusy) return;
  qrBusy = true;
  try {
    qrRaw = raw;
    qrDataUrl = await QRCode.toDataURL(raw, { margin: 2, width: 420 });
    fs.writeFileSync(QR_FILE, raw, 'utf8');
    addLog('QR asli SC diterima dan dikirim ke panel');
  } catch (e) {
    addLog(`QR ERROR: ${e.message}`);
  } finally {
    qrBusy = false;
  }
}

async function syncQRFile() {
  try {
    if (fs.existsSync(QR_FILE)) {
      const raw = fs.readFileSync(QR_FILE, 'utf8').trim();
      if (raw && raw !== qrRaw) await setQR(raw);
    }
  } catch (_) {}
}

function findSCQRImage() {
  // Read the QR image produced by the original SC without modifying its QR flow.
  const candidates = [
    path.join(SCRIPT_DIR, 'data', 'qr.png'),
    path.join(SCRIPT_DIR, 'data', 'qr.jpg'),
    path.join(SCRIPT_DIR, 'data', 'qr.jpeg'),
    path.join(SCRIPT_DIR, 'qr.png'),
    path.join(SCRIPT_DIR, 'qr.jpg'),
    path.join(SCRIPT_DIR, 'qr.jpeg')
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0) return file;
    } catch (_) {}
  }
  return null;
}

let qrVersion = 0;
let qrFileStamp = '';

async function syncSCQRImage() {
  const file = findSCQRImage();
  if (!file) return null;
  try {
    const stat = fs.statSync(file);
    const stamp = `${stat.mtimeMs}:${stat.size}`;
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    // Always read the current QR file. If the SC replaces it, the data URL changes too.
    const data = fs.readFileSync(file).toString('base64');
    const nextDataUrl = `data:${mime};base64,${data}`;
    if (stamp !== qrFileStamp || nextDataUrl !== qrDataUrl) {
      qrFileStamp = stamp;
      qrDataUrl = nextDataUrl;
      qrVersion += 1;
      addLog(`QR asli diperbarui (versi ${qrVersion})`);
    }
    return file;
  } catch (_) {
    return null;
  }
}

function clearQR() {
  qrRaw = '';
  qrDataUrl = '';
  qrVersion = 0;
  qrFileStamp = '';
  try { fs.rmSync(QR_FILE, { force: true }); } catch (_) {}
}

function clearScriptDir() {
  fs.rmSync(SCRIPT_DIR, { recursive:true, force:true });
  fs.mkdirSync(SCRIPT_DIR, { recursive:true });
}

function safeExtract(zipPath) {
  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (name.startsWith('/') || name.includes('../')) throw new Error('ZIP mengandung path tidak aman');
  }
  zip.extractAllTo(SCRIPT_DIR, true);
  const items = fs.readdirSync(SCRIPT_DIR);
  if (items.length === 1) {
    const only = path.join(SCRIPT_DIR, items[0]);
    if (fs.existsSync(only) && fs.statSync(only).isDirectory()) {
      for (const name of fs.readdirSync(only)) fs.renameSync(path.join(only, name), path.join(SCRIPT_DIR, name));
      fs.rmdirSync(only);
    }
  }
}

function readPackage() {
  const pkgPath = path.join(SCRIPT_DIR, 'package.json');
  if (!fs.existsSync(pkgPath)) throw new Error('package.json tidak ditemukan di ZIP SC');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const start = pkg.scripts && pkg.scripts.start;
  if (!start) throw new Error('scripts.start tidak ditemukan di package.json');
  return { name: pkg.name || 'SC', version: pkg.version || 'unknown', start };
}

function stopProcess() {
  if (!child) return false;
  try {
    if (process.platform === 'win32') child.kill();
    else process.kill(-child.pid, 'SIGTERM');
  } catch (_) { try { child.kill('SIGTERM'); } catch (_) {} }
  child = null;
  clearQR();
  addLog('SC dihentikan');
  return true;
}

function captureQRMarker(text) {
  // Optional bridge for scripts that print raw QR with one of these markers.
  const m = String(text).match(/(?:XINZZ_QR|QR_STRING)\s*[:=]\s*([^\s]+)/i);
  if (m && m[1]) setQR(m[1]);
}

function attachOutput(proc) {
  proc.stdout.on('data', d => { addLog(d); captureQRMarker(d.toString()); });
  proc.stderr.on('data', d => { addLog(d); captureQRMarker(d.toString()); });
}

function runCommand(command, args, cwd, onDone) {
  addLog(`$ ${command} ${args.join(' ')}`);
  const proc = spawn(command, args, { cwd, env: { ...process.env, CI: 'true' }, detached: false });
  attachOutput(proc);
  proc.on('error', e => { addLog(`ERROR: ${e.message}`); onDone(e); });
  proc.on('close', code => {
    addLog(`${command} selesai dengan kode ${code}`);
    onDone(code === 0 ? null : new Error(`${command} gagal (kode ${code})`));
  });
}

app.get('/health', (req,res) => {
  res.json({
    ok:true,
    backend:true,
    pid:process.pid,
    uptime:Math.floor((Date.now() - startedAt) / 1000),
    running:!!child,
    installed,
    timestamp:new Date().toISOString()
  });
});

app.get('/', (req,res) => res.json({
  ok:true, name:'XINZZ Panel Backend v2.6 STABLE LONGRUN',
  endpoints:['/status','/qr','/qr.png','/upload','/install','/control','/logs']
}));

app.get('/status', auth, async (req,res) => {
  await syncQRFile();
  await syncSCQRImage();
  const total = os.totalmem(), free = os.freemem();
  res.json({
    ok:true, backend:true, scriptInstalled: installed, script: scriptInfo, running: !!child,
    cpu: `${Math.round(os.loadavg()[0] * 100) / 100}`,
    ram: `${Math.round(((total-free)/total)*100)}%`,
    uptime: `${Math.floor((Date.now() - startedAt) / 1000)}s`,
    memory: { rss: Math.round(process.memoryUsage().rss / 1024 / 1024), heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
    logs: logs.slice(-Math.min(200, LOG_KEEP_LINES)).join('\n'),
    qr: qrDataUrl || null,
    qrVersion,
    qrUrl: qrDataUrl ? `/qr.png?v=${qrVersion}` : null
  });
});

app.get('/qr', auth, async (req,res) => {
  await syncQRFile();
  await syncSCQRImage();
  if (!qrDataUrl) return res.status(404).json({ ok:false, message:'QR belum tersedia. Start SC dan tunggu QR asli muncul.' });
  res.json({ ok:true, qr: qrDataUrl });
});

// Direct image endpoint for panels that use <img src=".../qr.png">.
// First serves the original SC file data/qr.png, then falls back to the bridged QR.
app.get('/qr.png', auth, async (req,res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const file = await syncSCQRImage();
  if (file) {
    const ext = path.extname(file).toLowerCase();
    res.type(ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
    return res.send(fs.readFileSync(file));
  }

  await syncQRFile();
  if (qrDataUrl) {
    try {
      const match = qrDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (match) {
        res.type(match[1]);
        return res.send(Buffer.from(match[2], 'base64'));
      }
    } catch (_) {}
  }
  return res.status(404).send('QR belum tersedia');
});

app.get('/logs', auth, (req,res) => res.json({ ok:true, logs: logs.slice(-Math.min(500, LOG_KEEP_LINES)) }));

app.post('/upload', auth, upload.single('script'), (req,res) => {
  try {
    if (!req.file) throw new Error('File ZIP belum dipilih');
    stopProcess(); clearScriptDir(); clearQR();
    installed = false; scriptInfo = null; saveState(); logs = [];
    addLog(`Upload diterima: ${req.file.originalname}`);
    safeExtract(req.file.path);
    fs.unlinkSync(req.file.path);
    scriptInfo = readPackage();
    saveState();
    addLog(`SC terdeteksi: ${scriptInfo.name} v${scriptInfo.version}`);
    res.json({ ok:true, message:'Upload dan extract berhasil', script:scriptInfo });
  } catch (e) {
    addLog(`UPLOAD ERROR: ${e.message}`);
    res.status(400).json({ ok:false, message:e.message });
  }
});

app.post('/install', auth, (req,res) => {
  try {
    if (!scriptInfo) throw new Error('Upload SC terlebih dahulu');
    if (req.app.locals.installing) throw new Error('Install sedang berjalan');
    req.app.locals.installing = true; installed = false; saveState();
    addLog('Memulai npm install...');
    runCommand('npm', ['install'], SCRIPT_DIR, (err) => {
      req.app.locals.installing = false;
      if (!err) { installed = true; saveState(); addLog('Dependency SC berhasil diinstall'); }
      else addLog(`Install gagal: ${err.message}`);
    });
    res.json({ ok:true, message:'npm install dimulai. Pantau Console.' });
  } catch (e) { res.status(400).json({ ok:false, message:e.message }); }
});

app.post('/control', auth, (req,res) => {
  const action = String(req.body?.action || '').toLowerCase();
  try {
    if (action === 'stop') {
      const was = stopProcess();
      return res.json({ ok:true, message:was?'SC dihentikan':'SC tidak sedang berjalan' });
    }
    if (action === 'restart') stopProcess();
    if (action === 'start' || action === 'restart') {
      if (!scriptInfo) throw new Error('Upload SC terlebih dahulu');
      if (!installed) throw new Error('Install dependency terlebih dahulu');
      if (child) throw new Error('SC sudah berjalan');
      clearQR();
      addLog('Menjalankan SC dengan QR bridge...');
      child = spawn('npm', ['start'], {
        cwd: SCRIPT_DIR,
        env: {
          ...process.env,
          XINZZ_QR_FILE: QR_FILE,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${QR_HOOK}"`.trim()
        },
        detached: process.platform !== 'win32'
      });
      attachOutput(child);
      child.on('error', e => addLog(`SC ERROR: ${e.message}`));
      child.on('close', code => { addLog(`SC berhenti (kode ${code})`); child = null; clearQR(); });
      return res.json({ ok:true, message: action==='restart'?'SC direstart':'SC dimulai' });
    }
    throw new Error('Action tidak dikenal');
  } catch (e) { res.status(400).json({ ok:false, message:e.message }); }
});

app.use((err, req, res, next) => {
  const msg = err?.message || 'Server error';
  addLog(`ERROR: ${msg}`);
  res.status(400).json({ ok:false, message:msg });
});

const cleanupTimer = setInterval(cleanupStorage, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
cleanupStorage();

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  addLog(`Backend menerima ${signal}, menghentikan proses dengan aman...`);
  try { stopProcess(); } catch (_) {}
  try { saveState(); } catch (_) {}
  setTimeout(() => process.exit(0), 300).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', err => {
  addLog(`UNCAUGHT ERROR: ${err && err.message || err}`);
  try { saveState(); } catch (_) {}
  setTimeout(() => process.exit(1), 100).unref();
});
process.on('unhandledRejection', err => {
  addLog(`UNHANDLED REJECTION: ${err && err.message || err}`);
});

app.listen(PORT, () => {
  addLog(`Backend XINZZ v2.6 STABLE LONGRUN berjalan di port ${PORT}`);
  if (!TOKEN) addLog('PERINGATAN: PANEL_TOKEN kosong. Jangan buka port ke publik untuk penggunaan bersama.');
  console.log(`Server XINZZ Backend v2.6 STABLE LONGRUN berjalan di port ${PORT}`);
});
