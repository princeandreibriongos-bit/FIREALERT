export type GatewayWifi = "up" | "down";

export type GatewayLink = {
  wifi: GatewayWifi;
  ip: string | null;
  channel: number | null;
  mac: string | null;
  cellular: string | null;
  seen_at: string | null;
};

export type LinkReport = {
  wifi: GatewayWifi;
  ip: string | null;
  channel: number | null;
  mac: string | null;
  cellular: string | null;
};

const EMPTY: GatewayLink = {
  wifi: "down",
  ip: null,
  channel: null,
  mac: null,
  cellular: null,
  seen_at: null,
};

const globalStore = globalThis as typeof globalThis & { __firealertLink?: GatewayLink };

function store(): GatewayLink {
  if (!globalStore.__firealertLink) globalStore.__firealertLink = { ...EMPTY };
  return globalStore.__firealertLink;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function parseLinkReport(body: unknown): { ok: true; value: LinkReport } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object" };
  }
  const record = body as Record<string, unknown>;
  if (record.wifi !== "up" && record.wifi !== "down") {
    return { ok: false, error: "wifi must be up or down" };
  }
  const ip = record.ip == null || record.ip === "" ? null : text(record.ip, 45);
  if (record.ip != null && record.ip !== "" && ip == null) return { ok: false, error: "ip is not valid" };
  const channel =
    record.channel == null ? null : typeof record.channel === "number" && Number.isInteger(record.channel) ? record.channel : undefined;
  if (channel === undefined || (channel != null && (channel < 0 || channel > 196))) {
    return { ok: false, error: "channel is not valid" };
  }
  const mac = record.mac == null || record.mac === "" ? null : text(record.mac, 17);
  if (record.mac != null && record.mac !== "" && mac == null) return { ok: false, error: "mac is not valid" };
  const cellular = record.cellular == null || record.cellular === "" ? null : text(record.cellular, 32);
  return { ok: true, value: { wifi: record.wifi, ip, channel, mac, cellular } };
}

export function noteLink(report: LinkReport, seenAt = new Date().toISOString()): GatewayLink {
  const next: GatewayLink = { ...report, seen_at: seenAt };
  const current = store();
  Object.assign(current, next);
  return { ...current };
}

export function readLink(): GatewayLink {
  return { ...store() };
}

const HEARTBEAT_FRESH_MS = 8_000;
const WEARABLE_FRESH_MS = 20_000;

export type GatewayPhase = "up" | "down" | "waiting";
export type WearablePhase = "live" | "stale" | "waiting";

export function gatewayPhase(link: GatewayLink | null, now: number): GatewayPhase {
  if (!link?.seen_at) return "waiting";
  const seen = Date.parse(link.seen_at);
  if (Number.isNaN(seen) || now - seen > HEARTBEAT_FRESH_MS) return "waiting";
  return link.wifi === "up" ? "up" : "down";
}

function packetIsLive(receivedAt: string, now: number) {
  const at = Date.parse(receivedAt);
  if (Number.isNaN(at)) return false;
  return now - at <= WEARABLE_FRESH_MS;
}

export function wearablePhase(crew: { simulated: boolean; received_at: string }[], now: number): WearablePhase {
  const hardware = crew.filter((person) => !person.simulated);
  if (hardware.length === 0) return "waiting";
  if (hardware.some((person) => packetIsLive(person.received_at, now))) return "live";
  return "stale";
}

export function newestHardware<T extends { simulated: boolean; received_at: string }>(crew: T[]): T | null {
  return crew.filter((person) => !person.simulated).sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))[0] ?? null;
}
