require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const util = require("util");
const os = require("os");
const execAsync = util.promisify(exec);

const app = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(",") : "*"
}));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Nama proses SC yang dikelola PM2.
// Contoh: pm2 start index.js --name xinzz-sc
const PM2_APP_NAME = process.env.PM2_APP_NAME || "xinzz-sc";

let logs = "Backend XINZZ Panel aktif.\n";
let lastQr = "";

function addLog(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logs = line + "\n" + logs;
  logs = logs.slice(0, 12000);
  console.log(line);
}

async function pm2(command) {
  const { stdout, stderr } = await execAsync(`pm2 ${command}`);
  return (stdout + stderr).trim();
}

async function isOnline() {
  try {
    const output = await pm2(`jlist`);
    const list = JSON.parse(output);
    const app = list.find(x => x.name === PM2_APP_NAME);
    return !!(app && app.pm2_env && app.pm2_env.status === "online");
  } catch {
    return false;
  }
}

function memoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return `${Math.round(used / 1024 / 1024)} MB / ${Math.round(total / 1024 / 1024)} MB`;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "XINZZ Panel Backend",
    endpoints: ["/status", "/control"]
  });
});

app.get("/status", async (req, res) => {
  const online = await isOnline();

  res.json({
    online,
    cpu: `${Math.round(os.loadavg()[0] * 100)}% load`,
    ram: memoryInfo(),
    uptime: `${Math.floor(os.uptime() / 60)} menit`,
    logs,
    qr: lastQr || null
  });
});

app.post("/control", async (req, res) => {
  const action = String(req.body?.action || "").toLowerCase();

  try {
    let output = "";

    if (action === "start") {
      output = await pm2(`start ${PM2_APP_NAME}`);
    } else if (action === "stop") {
      output = await pm2(`stop ${PM2_APP_NAME}`);
    } else if (action === "restart") {
      output = await pm2(`restart ${PM2_APP_NAME}`);
    } else if (action === "logs") {
      output = await pm2(`logs ${PM2_APP_NAME} --lines 50 --nostream`);
      logs = output;
    } else {
      return res.status(400).json({
        ok: false,
        message: "Action tidak dikenal. Gunakan start, stop, restart, atau logs."
      });
    }

    addLog(`Control ${action}: ${output || "OK"}`);
    res.json({ ok: true, message: output || `Perintah ${action} berhasil` });
  } catch (error) {
    addLog(`ERROR ${action}: ${error.message}`);
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.listen(PORT, () => {
  addLog(`Backend berjalan di port ${PORT}`);
});
