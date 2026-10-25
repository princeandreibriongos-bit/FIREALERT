import { appendSharedItem, boardBackend, noteItems, readRedisBoard, readSharedBoard, writeSharedItems } from "./shared-board";
import { normalizeTelemetry, type NormalizedTelemetry, type RawTelemetry } from "./telemetry-core";
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

export async function saveTelemetry(raw: RawTelemetry | unknown, receivedAt = new Date().toISOString()): Promise<NormalizedTelemetry | null> {
  const entry = logTelemetry(raw, receivedAt);
  try {
    await persistTelemetry(entry);
  } catch (error) {
    console.error("[FIREALERT] shared log", error);
  }
  return entry;
}

export async function readTelemetry(): Promise<NormalizedTelemetry[]> {
  const kind = boardBackend();
  if (kind === "memory" || (kind === "shared" && process.env.NODE_ENV === "development")) return listTelemetry();
  if (kind === "redis") return (await readRedisBoard()).items;
  return (await readSharedBoard()).items;
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
