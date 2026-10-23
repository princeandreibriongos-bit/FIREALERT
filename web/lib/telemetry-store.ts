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
