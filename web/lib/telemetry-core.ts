export const FALL_STATES = ["idle", "possible", "grace", "distress", "cancelled"] as const;
export type FallState = (typeof FALL_STATES)[number];
export type GpsState = "none" | "fix" | "last_known";
export type SignatureStatus = "unsigned" | "valid" | "invalid" | "unverified";
export type Uplink = "wifi" | "cellular";
export type UiState = "not_installed" | "requested_not_installed" | "installed" | "active";
export type Co2Cue = "awaiting" | "routine" | "elevated" | "high";

export type Vec3 = { x: number | null; y: number | null; z: number | null };

export type RawTelemetry = {
  protocol_version?: number;
  simulated?: boolean;
  source?: string;
  wearer_id?: string;
  gateway?: string;
  router_ssid?: string | null;
  uplink?: "wifi" | "cellular" | { active?: string; planned?: string; cellular_ready?: boolean };
  source_mac?: string;
  rssi_dbm?: number | null;
  sequence?: number;
  timestamp_ms?: number;
  signature?: { alg?: string; hex?: string | null; prefix_hex?: string | null };
  battery?: { ok?: boolean; percent?: number | null; voltage_v?: number | null };
  max30102?: {
    ok?: boolean;
    heart_rate_bpm?: number | null;
    spo2_percent?: number | null;
  };
  bme688?: {
    ok?: boolean;
    temperature_c?: number | null;
    humidity_rh?: number | null;
    pressure_hpa?: number | null;
    gas_resistance_ohm?: number | null;
  };
  scd40?: {
    ok?: boolean;
    co2_ppm?: number | null;
    temperature_c?: number | null;
    humidity_rh?: number | null;
  };
  mpu6050?: {
    ok?: boolean;
    accel_g?: { x?: number | null; y?: number | null; z?: number | null } | null;
    gyro_dps?: { x?: number | null; y?: number | null; z?: number | null } | null;
  };
  gps?: {
    ok?: boolean;
    fix?: string;
    latitude?: number | null;
    longitude?: number | null;
    altitude_m?: number | null;
    satellites?: number | null;
  };
  fall?: { state?: string; model?: string; grace_remaining_ms?: number };
  local_ui?: { touchscreen?: string; buzzer?: string };
};

export type NormalizedTelemetry = {
  received_at: string;
  protocol_version: number;
  simulated: boolean;
  wearer_id: string;
  source: string;
  gateway: string;
  router_ssid: string | null;
  uplink: Uplink;
  cellular_ready: boolean;
  source_mac: string | null;
  rssi_dbm: number | null;
  sequence: number | null;
  timestamp_ms: number | null;
  signature: { alg: string; hex: string | null; prefix_hex: string | null; status: SignatureStatus };
  battery: { installed: boolean; percent: number | null; voltage_v: number | null };
  max30102: { installed: boolean; heart_rate_bpm: number | null; spo2_percent: number | null };
  bme688: {
    installed: boolean;
    temperature_c: number | null;
    humidity_rh: number | null;
    pressure_hpa: number | null;
    gas_resistance_ohm: number | null;
  };
  scd40: { installed: boolean; co2_ppm: number | null; temperature_c: number | null; humidity_rh: number | null };
  mpu6050: { installed: boolean; accel_g: Vec3 | null; gyro_dps: Vec3 | null };
  gps: {
    state: GpsState;
    latitude: number | null;
    longitude: number | null;
    altitude_m: number | null;
    satellites: number | null;
  };
  fall: { state: FallState; model: string; grace_remaining_ms: number };
  local_ui: { touchscreen: UiState; buzzer: UiState };
};

export type SignatureCheck = (prefixHex: string | null, signatureHex: string | null) => SignatureStatus;

const UI_STATES: readonly UiState[] = ["not_installed", "requested_not_installed", "installed", "active"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function installedReading(installed: boolean, value: unknown): number | null {
  return installed ? num(value) : null;
}

function uiState(value: unknown): UiState {
  return typeof value === "string" && UI_STATES.includes(value as UiState) ? (value as UiState) : "not_installed";
}

function vec(value: unknown, installed: boolean): Vec3 | null {
  if (!installed || !isRecord(value)) return null;
  return { x: num(value.x), y: num(value.y), z: num(value.z) };
}

function uplinkOf(value: unknown): { active: Uplink; cellularReady: boolean } {
  if (value === "cellular") return { active: "cellular", cellularReady: true };
  if (isRecord(value)) {
    return {
      active: value.active === "cellular" ? "cellular" : "wifi",
      cellularReady: value.cellular_ready === true,
    };
  }
  return { active: "wifi", cellularReady: false };
}

function gpsOf(value: unknown): NormalizedTelemetry["gps"] {
  const raw = isRecord(value) ? value : {};
  const latitude = num(raw.latitude);
  const longitude = num(raw.longitude);
  let state: GpsState = "none";
  if (raw.fix === "fix" || raw.fix === "last_known" || raw.fix === "none") {
    state = raw.fix;
  } else if (raw.ok === true && latitude != null && longitude != null) {
    state = "fix";
  }
  if (state !== "none" && (latitude == null || longitude == null)) state = "none";
  return {
    state,
    latitude: state === "none" ? null : latitude,
    longitude: state === "none" ? null : longitude,
    altitude_m: state === "none" ? null : num(raw.altitude_m),
    satellites: state === "none" ? null : num(raw.satellites),
  };
}

export function normalizeTelemetry(
  input: unknown,
  receivedAt: string,
  check: SignatureCheck,
): NormalizedTelemetry | null {
  if (!isRecord(input)) return null;

  const signature = isRecord(input.signature) ? input.signature : {};
  const hex = text(signature.hex, 200);
  const prefix = text(signature.prefix_hex, 800);
  const scd = isRecord(input.scd40) ? input.scd40 : {};
  const bme = isRecord(input.bme688) ? input.bme688 : {};
  const max = isRecord(input.max30102) ? input.max30102 : {};
  const mpu = isRecord(input.mpu6050) ? input.mpu6050 : {};
  const battery = isRecord(input.battery) ? input.battery : {};
  const fall = isRecord(input.fall) ? input.fall : {};
  const ui = isRecord(input.local_ui) ? input.local_ui : {};
  const uplink = uplinkOf(input.uplink);
  const scdOn = scd.ok === true;
  const bmeOn = bme.ok === true;
  const maxOn = max.ok === true;
  const mpuOn = mpu.ok === true;
  const batteryOn = battery.ok === true;
  const mac = text(input.source_mac, 32);
  const fallRaw = text(fall.state, 20);
  const fallState = FALL_STATES.includes(fallRaw as FallState) ? (fallRaw as FallState) : "idle";
  const grace = num(fall.grace_remaining_ms);

  return {
    received_at: receivedAt,
    protocol_version: num(input.protocol_version) ?? 0,
    simulated: input.simulated === true,
    wearer_id: text(input.wearer_id, 32) || mac || "unassigned",
    source: text(input.source, 32) || "node-a",
    gateway: text(input.gateway, 32) || "gateway",
    router_ssid: text(input.router_ssid, 32) || null,
    uplink: uplink.active,
    cellular_ready: uplink.cellularReady,
    source_mac: mac || null,
    rssi_dbm: num(input.rssi_dbm),
    sequence: num(input.sequence),
    timestamp_ms: num(input.timestamp_ms),
    signature: {
      alg: text(signature.alg, 40) || "ECDSA-P256-SHA256",
      hex: hex || null,
      prefix_hex: prefix || null,
      status: check(prefix || null, hex || null),
    },
    battery: {
      installed: batteryOn,
      percent: installedReading(batteryOn, battery.percent),
      voltage_v: installedReading(batteryOn, battery.voltage_v),
    },
    max30102: {
      installed: maxOn,
      heart_rate_bpm: installedReading(maxOn, max.heart_rate_bpm),
      spo2_percent: installedReading(maxOn, max.spo2_percent),
    },
    bme688: {
      installed: bmeOn,
      temperature_c: installedReading(bmeOn, bme.temperature_c),
      humidity_rh: installedReading(bmeOn, bme.humidity_rh),
      pressure_hpa: installedReading(bmeOn, bme.pressure_hpa),
      gas_resistance_ohm: installedReading(bmeOn, bme.gas_resistance_ohm),
    },
    scd40: {
      installed: scdOn,
      co2_ppm: installedReading(scdOn, scd.co2_ppm),
      temperature_c: installedReading(scdOn, scd.temperature_c),
      humidity_rh: installedReading(scdOn, scd.humidity_rh),
    },
    mpu6050: {
      installed: mpuOn,
      accel_g: vec(mpu.accel_g, mpuOn),
      gyro_dps: vec(mpu.gyro_dps, mpuOn),
    },
    gps: gpsOf(input.gps),
    fall: {
      state: fallState,
      model: text(fall.model, 60) || "edge-impulse-placeholder",
      grace_remaining_ms: grace != null && grace >= 0 ? Math.min(grace, 120000) : 0,
    },
    local_ui: {
      touchscreen: uiState(ui.touchscreen),
      buzzer: uiState(ui.buzzer),
    },
  };
}

export function latestByWearer(items: NormalizedTelemetry[]): NormalizedTelemetry[] {
  const seen = new Set<string>();
  const crew: NormalizedTelemetry[] = [];
  for (const item of items) {
    if (seen.has(item.wearer_id)) continue;
    seen.add(item.wearer_id);
    crew.push(item);
  }
  return crew;
}

export function fallNeedsReview(state: FallState): boolean {
  return state === "possible" || state === "grace" || state === "distress";
}

export function gpsIsCurrent(gps: NormalizedTelemetry["gps"]): boolean {
  return gps.state === "fix" && gps.latitude != null && gps.longitude != null;
}

export function co2Cue(ppm: number | null, installed: boolean): Co2Cue {
  if (!installed || ppm == null) return "awaiting";
  if (ppm >= 5000) return "high";
  if (ppm >= 1000) return "elevated";
  return "routine";
}

export function linkState(receivedAt: string, now = Date.now()): "live" | "stale" | "unknown" {
  const at = Date.parse(receivedAt);
  if (Number.isNaN(at)) return "unknown";
  return now - at <= 20_000 ? "live" : "stale";
}
