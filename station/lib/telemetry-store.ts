import { saveLinkReport } from "./link-store";
import { readLink } from "./link-status";
import { packetKey } from "./board-shape";
import { appendSharedItem, boardBackend, noteItems, readRedisBoard, readSharedBoard, writeSharedItems } from "./shared-board";
import { normalizeTelemetry, type NormalizedTelemetry, type RawTelemetry } from "./telemetry-core";
import { persistTelemetryPacket } from "./telemetry-persist";
import { signatureStatus } from "./verify";

const MAX_LOGS = 250;

const globalStore = globalThis as typeof globalThis & {
  __firealertLogs?: NormalizedTelemetry[];
};

function logs(): NormalizedTelemetry[] {
  if (!globalStore.__firealertLogs) globalStore.__firealertLogs = [];
  return globalStore.__firealertLogs;
}

export function logTelemetry(raw: RawTelemetry | unknown, receivedAt = new Date().toISOString()): NormalizedTelemetry | null {
  const entry = normalizeTelemetry(raw, receivedAt, signatureStatus);
  if (!entry) return null;
  const items = logs();
  items.unshift(entry);
  if (items.length > MAX_LOGS) items.length = MAX_LOGS;
  console.log(`[FIREALERT] ${entry.wearer_id} seq=${entry.sequence ?? "—"} fall=${entry.fall.state} sig=${entry.signature.status}`);
  return entry;
}

export function replaceTelemetry(entries: NormalizedTelemetry[]): void {
  const items = logs();
  items.splice(0, items.length, ...entries.slice(0, MAX_LOGS));
}

export function listTelemetry(): NormalizedTelemetry[] {
  return logs();
}

async function persistTelemetry(entry: NormalizedTelemetry | null): Promise<void> {
  const kind = boardBackend();
  if (!entry || kind === "memory") return;
  if (kind === "shared" && process.env.NODE_ENV === "development") {
    noteItems(listTelemetry());
    return;
  }
  await appendSharedItem(entry);
}

async function noteGatewayFromPacket(entry: NormalizedTelemetry): Promise<void> {
  if (entry.simulated) return;
  const current = readLink();
  await saveLinkReport(
    {
      wifi: "up",
      ip: current.ip,
      channel: current.channel,
      mac: current.mac,
      cellular: entry.cellular_ready ? "ready" : current.cellular,
      ssid: entry.router_ssid ?? current.ssid,
      phase: "connected",
      trying: entry.router_ssid ?? current.trying,
      detail: "ok",
    },
    entry.received_at,
  );
}

export async function saveTelemetry(raw: RawTelemetry | unknown, receivedAt = new Date().toISOString()): Promise<NormalizedTelemetry | null> {
  const entry = logTelemetry(raw, receivedAt);
  try {
    if (entry) await noteGatewayFromPacket(entry);
  } catch (error) {
    console.error("[FIREALERT] gateway link", error);
  }
  try {
    await persistTelemetry(entry);
  } catch (error) {
    console.error("[FIREALERT] shared log", error);
  }
  try {
    if (entry) await persistTelemetryPacket(entry);
  } catch (error) {
    console.error("[FIREALERT] postgres telemetry", error);
  }
  return entry;
}

function mergeTelemetry(local: NormalizedTelemetry[], remote: NormalizedTelemetry[]): NormalizedTelemetry[] {
  const seen = new Set<string>();
  const merged: NormalizedTelemetry[] = [];
  for (const item of [...local, ...remote]) {
    const key = packetKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  merged.sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
  return merged.slice(0, MAX_LOGS);
}

export async function readTelemetry(): Promise<NormalizedTelemetry[]> {
  const kind = boardBackend();
  const local = listTelemetry();
  if (kind === "memory") return local;
  try {
    const remote = kind === "redis" ? (await readRedisBoard()).items : (await readSharedBoard()).items;
    return mergeTelemetry(local, remote);
  } catch (error) {
    console.error("[FIREALERT] telemetry read", error);
    return local;
  }
}

export async function writeTelemetry(entries: NormalizedTelemetry[]): Promise<void> {
  replaceTelemetry(entries);
  const kind = boardBackend();
  if (kind === "memory") return;
  if (kind === "shared" && process.env.NODE_ENV === "development") {
    noteItems(listTelemetry());
    return;
  }
  await writeSharedItems(entries);
}
