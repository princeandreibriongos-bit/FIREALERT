/**
 * Local board: Next.js on port 3000 plus the gateway USB bridge.
 * The site only lists a wearable after the bridge posts the gateway log.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const children = [];

function ensurePyserial() {
  const python = process.platform === "win32" ? "python" : "python3";
  const check = spawnSync(python, ["-c", "import serial"], { cwd: root });
  if (check.status === 0) return;
  console.log("Installing pyserial so the gateway USB log can reach the board…");
  const install = spawnSync(python, ["-m", "pip", "install", "--user", "pyserial"], {
    cwd: root,
    stdio: "inherit",
  });
  if (install.status !== 0) {
    console.error("pyserial is still missing. The site will open, but no wearable will check in until it is installed.");
  }
}

function start(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit" });
  children.push(child);
  return child;
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code ?? 0);
}

ensurePyserial();

const next = start(process.execPath, [nextBin, "dev", "--turbopack", "--hostname", "0.0.0.0", "--port", "3000"]);
start(process.execPath, [path.join(root, "scripts", "run-bridge.mjs")]);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
next.on("exit", (code) => shutdown(code ?? 0));
