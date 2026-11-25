import { packetKey } from "./board-shape";
import { readLink } from "./link-status";
import { saveLinkReport } from "./link-store";
import { appendSharedItem, boardBackend, noteItems, readRedisBoard, readSharedBoard, writeSharedItems } from "./shared-board";
import { normalizeTelemetry, type NormalizedTelemetry, type RawTelemetry } from "./telemetry-core";
import { persistTelemetryPacket } from "./telemetry-persist";
import { signatureStatus } from "./verify";
import { applyWedaView, type WedaPoint } from "./weda-apply";
import { WEDA_WINDOW, type WristSample } from "./weda-fall";

const MAX_LOGS = 250;

const globalStore = globalThis as typeof globalThis & {
  __firealertLogs?: NormalizedTelemetry[];
};

function logs(): NormalizedTelemetry[] {
  if (!globalStore.__firealertLogs) globalStore.__firealertLogs = [];
  return globalStore.__firealertLogs;
}

function wedaLatches(): Map<string, number> {
  const store = globalStore as typeof globalStore & { __firealertWeda?: Map<string, number> };
  if (!store.__firealertWeda) store.__firealertWeda = new Map();
  return store.__firealertWeda;
}

function wristOf(entry: NormalizedTelemetry): WristSample | null {
  const accel = entry.mpu6050.accel_g;
  const gyro = entry.mpu6050.gyro_dps;
  if (!entry.mpu6050.installed || !accel || !gyro) return null;
  if (accel.x == null || accel.y == null || accel.z == null || gyro.x == null || gyro.y == null || gyro.z == null) return null;
  return { ax: accel.x, ay: accel.y, az: accel.z, gx: gyro.x, gy: gyro.y, gz: gyro.z };
}

/** Score the last 3 seconds of this wearer's wrist samples and hold grace for 10 seconds. */
function applyWeda(entry: NormalizedTelemetry): void {
  const latches = wedaLatches();
  const newest: WedaPoint[] = [];
  const own = wristOf(entry);
  const start = Date.parse(entry.received_at);
  if (own && Number.isFinite(start)) newest.push({ at: start, sample: own });
  for (const row of logs()) {
    if (newest.length >= WEDA_WINDOW) break;
    if (row.wearer_id !== entry.wearer_id || row.simulated) continue;
    const at = Date.parse(row.received_at);
    if (!Number.isFinite(at)) continue;
    const sample = wristOf(row);
    if (!sample) continue;
    newest.push({ at, sample });
  }
  const next = applyWedaView({
    simulated: entry.simulated,
    fallState: entry.fall.state,
    model: entry.fall.model,
    graceRemainingMs: entry.fall.grace_remaining_ms,
    activityLabel: entry.activity.label,
    activityScore: entry.activity.score,
    capture: entry.activity.capture,
    armedAt: latches.get(entry.wearer_id) ?? null,
    now: Number.isFinite(start) ? start : Date.now(),
    newestFirst: newest,
  });
  if (next.armedAt == null) latches.delete(entry.wearer_id);
  else latches.set(entry.wearer_id, next.armedAt);
  entry.fall = { state: next.fallState, model: next.model, grace_remaining_ms: next.graceRemainingMs };
  entry.activity = { label: next.activityLabel, score: next.activityScore, capture: next.capture };
}

export function logTelemetry(raw: RawTelemetry | unknown, receivedAt = new Date().toISOString()): NormalizedTelemetry | null {
  const entry = normalizeTelemetry(raw, receivedAt, signatureStatus);
  if (!entry) return null;
  applyWeda(entry);
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

/** A forwarded wearable packet is proof the gateway is on the path, even when the link post is late. */
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

/** Shared log and Postgres. The in-memory row is already visible before this finishes. */
export async function commitTelemetry(entry: NormalizedTelemetry): Promise<void> {
  try {
    await noteGatewayFromPacket(entry);
  } catch (error) {
    console.error("[FIREALERT] gateway link", error);
  }
  try {
    await persistTelemetry(entry);
  } catch (error) {
    console.error("[FIREALERT] shared log", error);
  }
  try {
    await persistTelemetryPacket(entry);
  } catch (error) {
    console.error("[FIREALERT] postgres telemetry", error);
  }
}

export async function saveTelemetry(raw: RawTelemetry | unknown, receivedAt = new Date().toISOString()): Promise<NormalizedTelemetry | null> {
  const entry = logTelemetry(raw, receivedAt);
  if (entry) await commitTelemetry(entry);
  return entry;
}

let remotePull: Promise<void> | null = null;

function refreshFromRemote(kind: ReturnType<typeof boardBackend>): void {
  if (remotePull) return;
  remotePull = (async () => {
    const remote = kind === "redis" ? (await readRedisBoard()).items : (await readSharedBoard()).items;
    const merged = mergeTelemetry(listTelemetry(), remote);
    if (merged.length) replaceTelemetry(merged);
  })().finally(() => {
    remotePull = null;
  });
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
  // Packets this process already accepted are the live log. A slow shared
  // read must not freeze the packet log, sensors, or overview.
  if (local.length > 0) {
    refreshFromRemote(kind);
    return local;
  }
  try {
    const remote = kind === "redis" ? (await readRedisBoard()).items : (await readSharedBoard()).items;
    const merged = mergeTelemetry(local, remote);
    if (merged.length) replaceTelemetry(merged);
    return merged;
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
