// Frees the local Sparx dev ports. Turbo runs the stack as a deep
// process tree (`pnpm dev` → `turbo run dev` → per-package `next dev` /
// `tsx watch` → their own children), and no OS reliably cascades a kill all
// the way down — especially Windows, which has no POSIX process groups. So a
// stopped/closed `pnpm dev` can leave `next`/`tsx` children alive holding their
// ports, and the next `pnpm dev` then dies with EADDRINUSE.
//
// Run `pnpm dev:kill` to clear them. Standalone by design — deliberately NOT
// wired as `predev`, so a second intentional dev session is never killed out
// from under you.
//
// Ports mirror the `--port` flags in the apps' dev scripts and PORT in each
// service's .env; keep this list in sync if you add a long-running dev task.

import { execSync } from 'node:child_process';

const PORTS = [3000, 3001, 3003, 3004, 3100, 3200, 8080, 8081, 8082, 8083];
const isWindows = process.platform === 'win32';

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    // No matching listener / nothing to kill — treat as a clean no-op.
    return '';
  }
}

// Map each known dev port to the set of PIDs currently listening on it.
function listenersByPort() {
  const map = new Map(PORTS.map((p) => [p, new Set()]));
  if (isWindows) {
    // netstat rows: "TCP  <local>:<port>  <foreign>  LISTENING  <pid>"
    // (covers IPv4 0.0.0.0/127.0.0.1 and IPv6 [::] listeners alike).
    for (const line of run('netstat -ano -p tcp').split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/);
      if (!m) continue;
      const port = Number(m[1]);
      if (map.has(port)) map.get(port).add(m[2]);
    }
  } else {
    for (const port of PORTS) {
      for (const pid of run(`lsof -ti tcp:${port} -sTCP:LISTEN`).split(/\s+/)) {
        if (pid) map.get(port).add(pid);
      }
    }
  }
  return map;
}

function kill(pid) {
  // /T tree-kills any surviving children of the listener too.
  run(isWindows ? `taskkill /F /T /PID ${pid}` : `kill -9 ${pid}`);
}

let killed = 0;
for (const [port, pids] of listenersByPort()) {
  for (const pid of pids) {
    kill(pid);
    console.log(`  port ${port} → killed PID ${pid}`);
    killed += 1;
  }
}

console.log(
  killed > 0
    ? `dev:kill — freed ${killed} process(es) across ${PORTS.length} dev ports.`
    : 'dev:kill — all dev ports already clear.'
);
