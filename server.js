const express = require('express');
const cors = require('cors');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TOKEN = (process.env.PANEL_TOKEN || '').trim();

const ROOT = path.join(__dirname, 'storage');
const UPLOADS = path.join(ROOT, 'uploads');
const SCRIPT_DIR = path.join(ROOT, 'script');
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(SCRIPT_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      return cb(new Error('Hanya file .zip yang diterima'));
    }
    cb(null, true);
  }
});

let child = null;
let logs = [];
let installed = false;
let scriptInfo = null;

function addLog(line) {
  const text = String(line).replace(/\r/g, '');
  for (const part of text.split('\n')) {
    if (part.trim()) logs.push(`[${new Date().toLocaleTimeString()}] ${part}`);
  }
  if (logs.length > 600) logs = logs.slice(-600);
}

function clearScriptDir() {
  fs.rmSync(SCRIPT_DIR, { recursive:true, force:true });
  fs.mkdirSync(SCRIPT_DIR, { recursive:true });
}

function safeExtract(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (name.startsWith('/') || name.includes('../')) {
      throw new Error('ZIP mengandung path tidak aman');
    }
  }
  zip.extractAllTo(SCRIPT_DIR, true);

  // If ZIP contains one wrapper folder, flatten it.
  const items = fs.readdirSync(SCRIPT_DIR);
  if (items.length === 1) {
    const only = path.join(SCRIPT_DIR, items[0]);
    if (fs.existsSync(only) && fs.statSync(only).isDirectory()) {
      const nested = fs.readdirSync(only);
      for (const name of nested) fs.renameSync(path.join(only, name), path.join(SCRIPT_DIR, name));
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
  } catch (_) {
    try { child.kill('SIGTERM'); } catch (_) {}
  }
  child = null;
  addLog('SC dihentikan');
  return true;
}

function runCommand(command, args, cwd, onDone) {
  addLog(`$ ${command} ${args.join(' ')}`);
  const proc = spawn(command, args, {
    cwd,
    env: { ...process.env, CI: 'true' },
    detached: false
  });
  proc.stdout.on('data', d => addLog(d));
  proc.stderr.on('data', d => addLog(d));
  proc.on('error', e => { addLog(`ERROR: ${e.message}`); onDone(e); });
  proc.on('close', code => {
    addLog(`${command} selesai dengan kode ${code}`);
    if (code === 0) onDone(null);
    else onDone(new Error(`${command} gagal (kode ${code})`));
  });
}

app.get('/', (req,res) => {
  res.json({
    ok:true,
    name:'XINZZ Panel Backend v2',
    endpoints:['/status','/upload','/install','/control','/logs']
  });
});

app.get('/status', auth, (req,res) => {
  const total = os.totalmem(), free = os.freemem();
  res.json({
    ok:true,
    backend:true,
    scriptInstalled: installed,
    script: scriptInfo,
    running: !!child,
    cpu: `${Math.round(os.loadavg()[0] * 100) / 100}`,
    ram: `${Math.round(((total-free)/total)*100)}%`,
    uptime: `${Math.floor(process.uptime())}s`,
    logs: logs.slice(-200).join('\n'),
    qr: null
  });
});

app.get('/logs', auth, (req,res) => res.json({ ok:true, logs: logs.slice(-500) }));

app.post('/upload', auth, upload.single('script'), (req,res) => {
  try {
    if (!req.file) throw new Error('File ZIP belum dipilih');
    stopProcess();
    clearScriptDir();
    installed = false;
    scriptInfo = null;
    logs = [];
    addLog(`Upload diterima: ${req.file.originalname}`);
    safeExtract(req.file.path);
    fs.unlinkSync(req.file.path);
    scriptInfo = readPackage();
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
    req.app.locals.installing = true;
    installed = false;
    addLog('Memulai npm install...');
    runCommand('npm', ['install'], SCRIPT_DIR, (err) => {
      req.app.locals.installing = false;
      if (!err) {
        installed = true;
        addLog('Dependency SC berhasil diinstall');
      } else addLog(`Install gagal: ${err.message}`);
    });
    res.json({ ok:true, message:'npm install dimulai. Pantau Console.' });
  } catch (e) {
    res.status(400).json({ ok:false, message:e.message });
  }
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

      addLog(`Menjalankan: npm start`);
      child = spawn('npm', ['start'], {
        cwd: SCRIPT_DIR,
        env: { ...process.env },
        detached: process.platform !== 'win32'
      });
      child.stdout.on('data', d => addLog(d));
      child.stderr.on('data', d => addLog(d));
      child.on('error', e => addLog(`SC ERROR: ${e.message}`));
      child.on('close', code => {
        addLog(`SC berhenti (kode ${code})`);
        child = null;
      });
      return res.json({ ok:true, message: action==='restart'?'SC direstart':'SC dimulai' });
    }
    throw new Error('Action tidak dikenal');
  } catch (e) {
    res.status(400).json({ ok:false, message:e.message });
  }
});

app.use((err, req, res, next) => {
  const msg = err?.message || 'Server error';
  addLog(`ERROR: ${msg}`);
  res.status(400).json({ ok:false, message:msg });
});

app.listen(PORT, () => {
  addLog(`Backend XINZZ berjalan di port ${PORT}`);
  if (!TOKEN) addLog('PERINGATAN: PANEL_TOKEN kosong. Jangan buka port ke publik untuk penggunaan bersama.');
  console.log(`Server XINZZ Backend v2 berjalan di port ${PORT}`);
});
