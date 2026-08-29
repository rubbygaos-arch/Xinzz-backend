const { spawn } = require('child_process');

const MIN_DELAY = Math.max(1000, Number(process.env.RESTART_MIN_DELAY_MS || 2000));
const MAX_DELAY = Math.max(MIN_DELAY, Number(process.env.RESTART_MAX_DELAY_MS || 30000));
const STABLE_AFTER_MS = Math.max(5000, Number(process.env.RESTART_STABLE_AFTER_MS || 60000));

let delay = MIN_DELAY;
let stopping = false;
let child = null;
let startedAt = 0;
let restartTimer = null;

function start() {
  if (stopping) return;

  startedAt = Date.now();
  console.log(`[watchdog] Starting backend: ${new Date().toISOString()}`);

  child = spawn(process.execPath, ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  child.once('exit', (code, signal) => {
    const runtime = Date.now() - startedAt;
    child = null;
    if (stopping) return;

    if (runtime >= STABLE_AFTER_MS) delay = MIN_DELAY;
    else delay = Math.min(Math.round(delay * 1.8), MAX_DELAY);

    console.error(
      `[watchdog] Backend exited (code=${code ?? 'null'}, signal=${signal ?? 'none'}, runtime=${runtime}ms). ` +
      `Restarting in ${delay}ms...`
    );

    restartTimer = setTimeout(start, delay);
  });

  child.once('error', (err) => {
    console.error('[watchdog] Failed to start backend:', err.message);
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[watchdog] ${signal} received, stopping...`);
  if (restartTimer) clearTimeout(restartTimer);
  if (child && !child.killed) {
    try { child.kill(signal); } catch (_) {}
  }
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', err => {
  console.error('[watchdog] Uncaught exception:', err && err.stack || err);
});
process.on('unhandledRejection', err => {
  console.error('[watchdog] Unhandled rejection:', err);
});

start();
