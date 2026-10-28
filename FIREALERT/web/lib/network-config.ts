import { readRouterRow, writeRouterRow } from "./db";

export type RouterCredentials = {
  ssid: string;
  password: string;
  updated_at: string | null;
};

const MAX_SSID = 32;
const MAX_PASSWORD = 63;

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
  return readRouterRow();
}

export async function writeRouter(value: { ssid: string; password: string }): Promise<RouterCredentials> {
  const updated_at = new Date().toISOString();
  writeRouterRow({ ...value, updated_at });
  return { ...value, updated_at };
}
