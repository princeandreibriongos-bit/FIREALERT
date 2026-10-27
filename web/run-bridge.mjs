import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(dir, "serial-bridge.py");
const extra = process.argv.slice(2);
const candidates =
  process.platform === "win32"
    ? [
        ["py", ["-3", script, ...extra]],
        ["python", [script, ...extra]],
      ]
    : [
        ["python3", [script, ...extra]],
        ["python", [script, ...extra]],
      ];

function start(index) {
  if (index >= candidates.length) {
    console.error("Python was not found. Install Python 3, then run: py -3 -m pip install pyserial");
    process.exit(1);
  }
  const [command, args] = candidates[index];
  const child = spawn(command, args, { cwd: dir, stdio: "inherit" });
  child.on("error", (error) => {
    if (error && error.code === "ENOENT") {
      start(index + 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });
  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
}

start(0);
