import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type RouterCredentials = {
  ssid: string;
  password: string;
  updated_at: string | null;
};

const MAX_SSID = 32;
const MAX_PASSWORD = 63;
const FILE = path.join(process.cwd(), "data", "network.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRouterInput(body: unknown): { ok: true; value: { ssid: string; password: string } } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Expected a JSON object" };
  const ssid = typeof body.ssid === "string" ? body.ssid.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!ssid) return { ok: false, error: "Wi-Fi name is required" };
  if (ssid.length > MAX_SSID) return { ok: false, error: "Wi-Fi name must be 32 characters or fewer" };
  if (password.length > MAX_PASSWORD) return { ok: false, error: "Password must be 63 characters or fewer" };
  if (/[\t\r\n]/.test(ssid) || /[\t\r\n]/.test(password)) {
    return { ok: false, error: "Wi-Fi name and password cannot contain line breaks" };
  }
  return { ok: true, value: { ssid, password } };
}

export async function readRouter(): Promise<RouterCredentials> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const checked = parseRouterInput(parsed);
    if (!checked.ok) return { ssid: "", password: "", updated_at: null };
    const updated = isRecord(parsed) && typeof parsed.updated_at === "string" ? parsed.updated_at : null;
    return { ...checked.value, updated_at: updated };
  } catch {
    return { ssid: "", password: "", updated_at: null };
  }
}

export async function writeRouter(value: { ssid: string; password: string }): Promise<RouterCredentials> {
  const saved: RouterCredentials = { ...value, updated_at: new Date().toISOString() };
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
  return saved;
}
