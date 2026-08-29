const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

let processStatus = "stopped";
let logs = [
  `[${new Date().toISOString()}] Backend XINZZ Panel aktif.`
];

function addLog(text) {
  logs.push(`[${new Date().toISOString()}] ${text}`);

  if (logs.length > 100) {
    logs.shift();
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "XINZZ Panel Backend",
    port: PORT
  });
});

app.get("/status", (req, res) => {
  res.json({
    ok: true,
    status: processStatus,
    backend: "online",
    uptime: process.uptime(),
    memory: process.memoryUsage().rss
  });
});

app.get("/logs", (req, res) => {
  res.json({
    ok: true,
    logs
  });
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      message: "File belum dipilih"
    });
  }

  addLog(`File diupload: ${req.file.originalname}`);

  res.json({
    ok: true,
    message: "SC berhasil diupload",
    file: req.file.filename,
    originalName: req.file.originalname
  });
});

app.post("/start", (req, res) => {
  processStatus = "running";
  addLog("Perintah START diterima.");

  res.json({
    ok: true,
    message: "Script dijalankan",
    status: processStatus
  });
});

app.post("/stop", (req, res) => {
  processStatus = "stopped";
  addLog("Perintah STOP diterima.");

  res.json({
    ok: true,
    message: "Script dihentikan",
    status: processStatus
  });
});

app.post("/restart", (req, res) => {
  addLog("Perintah RESTART diterima.");
  processStatus = "restarting";

  setTimeout(() => {
    processStatus = "running";
    addLog("Script berhasil direstart.");
  }, 1000);

  res.json({
    ok: true,
    message: "Script direstart"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend XINZZ berjalan di port ${PORT}`);
  addLog(`Backend XINZZ berjalan di port ${PORT}`);
});