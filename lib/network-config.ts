import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type NetworkKind = "router" | "hotspot";

export type RouterCredentials = {
  ssid: string;
  password: string;
  updated_at: string | null;
};

export type StoredNetworks = {
  active: NetworkKind;
  router: RouterCredentials;
  hotspot: RouterCredentials;
};

const MAX_SSID = 32;
const MAX_PASSWORD = 63;
const FILE = path.join(process.cwd(), "data", "network.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyCredentials(): RouterCredentials {
  return { ssid: "", password: "", updated_at: null };
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

function credentialsFrom(value: unknown): RouterCredentials | null {
  const checked = parseRouterInput(value);
  if (!checked.ok) return null;
  const updated = isRecord(value) && typeof value.updated_at === "string" ? value.updated_at : null;
  return { ...checked.value, updated_at: updated };
}

function kindFrom(value: unknown): NetworkKind | null {
  return value === "router" || value === "hotspot" ? value : null;
}

export function parseStoredNetworks(parsed: unknown): StoredNetworks {
  if (!isRecord(parsed)) {
    return { active: "router", router: emptyCredentials(), hotspot: emptyCredentials() };
  }

  const router = credentialsFrom(parsed.router);
  const hotspot = credentialsFrom(parsed.hotspot);
  if (router || hotspot || parsed.router || parsed.hotspot) {
    const active = kindFrom(parsed.active) ?? (hotspot ? "hotspot" : "router");
    return {
      active,
      router: router ?? emptyCredentials(),
      hotspot: hotspot ?? emptyCredentials(),
    };
  }

  const legacy = credentialsFrom(parsed);
  return {
    active: "router",
    router: legacy ?? emptyCredentials(),
    hotspot: emptyCredentials(),
  };
}

export function activeCredentials(stored: StoredNetworks): RouterCredentials {
  const selected = stored[stored.active];
  if (selected.ssid) return selected;
  if (stored.router.ssid) return stored.router;
  return selected;
}

function fileBody(stored: StoredNetworks): string {
  const active = activeCredentials(stored);
  return `${JSON.stringify({ ...active, active: stored.active, router: stored.router, hotspot: stored.hotspot }, null, 2)}\n`;
}

export async function readStoredNetworks(): Promise<StoredNetworks> {
  try {
    const raw = await readFile(FILE, "utf8");
    return parseStoredNetworks(JSON.parse(raw) as unknown);
  } catch {
    return { active: "router", router: emptyCredentials(), hotspot: emptyCredentials() };
  }
}

export async function readRouter(): Promise<RouterCredentials> {
  return activeCredentials(await readStoredNetworks());
}

async function persist(stored: StoredNetworks): Promise<StoredNetworks> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, fileBody(stored), { mode: 0o600 });
  return stored;
}

export async function writeRouterProfile(kind: NetworkKind, value: { ssid: string; password: string }): Promise<StoredNetworks> {
  const stored = await readStoredNetworks();
  stored[kind] = { ...value, updated_at: new Date().toISOString() };
  stored.active = kind;
  return persist(stored);
}

export async function activateStoredProfile(kind: NetworkKind): Promise<{ ok: true; stored: StoredNetworks } | { ok: false; error: string }> {
  const stored = await readStoredNetworks();
  if (!stored[kind].ssid) {
    return { ok: false, error: kind === "hotspot" ? "No phone hotspot is saved yet" : "No room router is saved yet" };
  }
  stored.active = kind;
  return { ok: true, stored: await persist(stored) };
}
