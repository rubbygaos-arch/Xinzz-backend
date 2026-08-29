const { spawn } = require('child_process');

const MAX_DELAY = Number(process.env.RESTART_DELAY_MS || 3000);
const MIN_DELAY = 1000;
let delay = MIN_DELAY;
let stopping = false;
let child = null;

function start() {
  if (stopping) return;

  console.log(`[watchdog] Starting backend: ${new Date().toISOString()}`);
  child = spawn(process.execPath, ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;

    console.error(
      `[watchdog] Backend exited (code=${code ?? 'null'}, signal=${signal ?? 'none'}). ` +
      `Restarting in ${delay}ms...`
    );

    setTimeout(() => {
      delay = Math.min(Math.round(delay * 1.5), MAX_DELAY);
      start();
    }, delay);
  });

  child.on('error', (err) => {
    console.error('[watchdog] Failed to start backend:', err.message);
  });

  child.on('spawn', () => {
    delay = MIN_DELAY;
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[watchdog] ${signal} received, stopping...`);
  if (child && !child.killed) child.kill(signal);
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
