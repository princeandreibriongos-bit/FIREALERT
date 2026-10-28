import { insertTelemetry, listTelemetryRows, replaceTelemetryRows } from "./db";
import { normalizeTelemetry, type NormalizedTelemetry, type RawTelemetry } from "./telemetry-core";
import { signatureStatus } from "./verify";

export function logTelemetry(raw: RawTelemetry | unknown, receivedAt = new Date().toISOString()): NormalizedTelemetry | null {
  const entry = normalizeTelemetry(raw, receivedAt, signatureStatus);
  if (!entry) return null;
  insertTelemetry(entry);
  console.log(`[FIREALERT] ${entry.wearer_id} seq=${entry.sequence ?? "—"} fall=${entry.fall.state} sig=${entry.signature.status}`);
  return entry;
}

export function replaceTelemetry(entries: NormalizedTelemetry[]): void {
  replaceTelemetryRows(entries);
}

export function listTelemetry(): NormalizedTelemetry[] {
  return listTelemetryRows();
}
