/**
 * Start serial-bridge.py with a real Python, not the Windows Store stub.
 * Tries: py -3, then python3 (Linux), then python, then the Windows install path.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(root, "serial-bridge.py");
const extraArgs = process.argv.slice(2);

const localPython = path.join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "Python",
  "Python313",
  "python.exe",
);

/** @type {{ command: string, args: string[], shell?: boolean }[]} */
const candidates = [
  { command: "py", args: ["-3", script, ...extraArgs] },
  { command: "python3", args: [script, ...extraArgs] },
  { command: "python", args: [script, ...extraArgs] },
];

if (existsSync(localPython)) {
  candidates.push({ command: localPython, args: [script, ...extraArgs] });
}

function tryNext(index) {
  if (index >= candidates.length) {
    console.error(
      "No working Python found. On Linux run: python3 serial-bridge.py\nOn Windows run: py -3 serial-bridge.py",
    );
    process.exit(1);
  }

  const next = candidates[index];
  const child = spawn(next.command, next.args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });

  child.on("error", () => tryNext(index + 1));
  child.on("exit", (code, signal) => {
    // Windows Store stub / missing launcher.
    if (code === 9009 || code === 127) {
      tryNext(index + 1);
      return;
    }
    if (signal) process.exit(1);
    process.exit(code ?? 1);
  });
}

tryNext(0);
