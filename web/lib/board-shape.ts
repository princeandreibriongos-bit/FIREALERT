import type { Incident } from "./incidents";
import type { GatewayLink } from "./link-status";
import type { NormalizedTelemetry } from "./telemetry-core";

const MAX_SHARED_ITEMS = 40;
const MAX_SHARED_BYTES = 48_000;

export type SharedBoard = {
  items: NormalizedTelemetry[];
  gateway: GatewayLink;
  incidents: Incident[];
};

export const EMPTY_GATEWAY: GatewayLink = {
  wifi: "down",
  ip: null,
  channel: null,
  mac: null,
  cellular: null,
  ssid: null,
  seen_at: null,
};

export function packetKey(entry: {
  wearer_id: string;
  sequence: number | null;
  timestamp_ms: number | null;
  received_at: string;
}): string {
  return `${entry.wearer_id}|${entry.sequence ?? ""}|${entry.timestamp_ms ?? ""}|${entry.received_at}`;
}

export function capItems<T>(items: T[]): T[] {
  const capped = items.slice(0, MAX_SHARED_ITEMS);
  while (capped.length > 1 && JSON.stringify(capped).length > MAX_SHARED_BYTES) capped.pop();
  return capped;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function parseGateway(value: unknown): GatewayLink {
  if (typeof value !== "object" || value === null) return { ...EMPTY_GATEWAY };
  const record = value as Record<string, unknown>;
  const channel = typeof record.channel === "number" && Number.isInteger(record.channel) ? record.channel : null;
  return {
    wifi: record.wifi === "up" ? "up" : "down",
    ip: text(record.ip, 45),
    channel,
    mac: text(record.mac, 17),
    cellular: text(record.cellular, 32),
    ssid: text(record.ssid, 32),
    seen_at: typeof record.seen_at === "string" ? record.seen_at : null,
  };
}

function parseIncidents(value: unknown): Incident[] {
  if (!Array.isArray(value)) return [];
  const incidents: Incident[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.created_at !== "string") continue;
    if (record.status !== "open" && record.status !== "closed") continue;
    incidents.push({
      id: record.id,
      title: record.title,
      address: typeof record.address === "string" ? record.address : "",
      notes: typeof record.notes === "string" ? record.notes : "",
      latitude: typeof record.latitude === "number" ? record.latitude : null,
      longitude: typeof record.longitude === "number" ? record.longitude : null,
      status: record.status,
      created_at: record.created_at,
    });
  }
  return incidents;
}

function parseItems(value: unknown): NormalizedTelemetry[] {
  if (!Array.isArray(value)) return [];
  const items: NormalizedTelemetry[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.wearer_id !== "string" || typeof record.received_at !== "string") continue;
    items.push(record as NormalizedTelemetry);
  }
  return items;
}

export function parseBoard(value: unknown): SharedBoard {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    items: parseItems(record.items),
    gateway: parseGateway(record.gateway),
    incidents: parseIncidents(record.incidents),
  };
}
