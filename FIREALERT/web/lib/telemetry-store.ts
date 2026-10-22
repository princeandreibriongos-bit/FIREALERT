export type TelemetryPayload = {
  protocol_version?: number;
  source?: string;
  gateway?: string;
  source_mac?: string;
  rssi_dbm?: number;
  sequence?: number;
  timestamp_ms?: number;
  scd40?: {
    ok?: boolean;
    i2c_addr?: string;
    co2_ppm?: number | null;
    temperature_c?: number | null;
    humidity_rh?: number | null;
  };
  bme688?: {
    ok?: boolean;
    i2c_addr?: string;
    gas_resistance_ohm?: number | null;
  };
};

export type LoggedTelemetry = TelemetryPayload & {
  received_at: string;
};

const MAX_LOGS = 250;

const globalStore = globalThis as typeof globalThis & {
  __firealertLogs?: LoggedTelemetry[];
};

if (!globalStore.__firealertLogs) {
  globalStore.__firealertLogs = [];
}

export function logTelemetry(payload: TelemetryPayload): LoggedTelemetry {
  const entry: LoggedTelemetry = {
    ...payload,
    received_at: new Date().toISOString(),
  };
  globalStore.__firealertLogs!.unshift(entry);
  if (globalStore.__firealertLogs!.length > MAX_LOGS) {
    globalStore.__firealertLogs!.length = MAX_LOGS;
  }
  console.log("[FIREALERT telemetry]", JSON.stringify(entry));
  return entry;
}

export function listTelemetry(): LoggedTelemetry[] {
  return globalStore.__firealertLogs ?? [];
}
