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
  mq6?: {
    ok?: boolean;
    raw?: number | null;
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
  mq6: { installed: boolean; raw: number | null };
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
  const mq6 = isRecord(input.mq6) ? input.mq6 : {};
  const battery = isRecord(input.battery) ? input.battery : {};
  const fall = isRecord(input.fall) ? input.fall : {};
  const ui = isRecord(input.local_ui) ? input.local_ui : {};
  const uplink = uplinkOf(input.uplink);
  const scdOn = scd.ok === true;
  const bmeOn = bme.ok === true;
  const maxOn = max.ok === true;
  const mpuOn = mpu.ok === true;
  const mq6On = mq6.ok === true;
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
    mq6: {
      installed: mq6On,
      raw: installedReading(mq6On, mq6.raw),
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

export type AirKind = "awaiting" | "steady" | "occupied" | "mix" | "both" | "bme";

export type AirReading = {
  kind: AirKind;
  tone: "ok" | "warn" | "alert";
  title: string;
  detail: string;
};

const TREND_MIN_MS = 40_000;
const TREND_TARGET_MS = 75_000;
const TREND_MAX_MS = 110_000;

function round(value: number): number {
  return Math.round(value);
}

function priorSample(history: NormalizedTelemetry[], latestMs: number): NormalizedTelemetry | null {
  let best: NormalizedTelemetry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of history) {
    const at = Date.parse(item.received_at);
    if (Number.isNaN(at)) continue;
    const age = latestMs - at;
    if (age < TREND_MIN_MS || age > TREND_MAX_MS) continue;
    const distance = Math.abs(age - TREND_TARGET_MS);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

function trendSentence(co2Then: number | null, co2Now: number | null, gasThen: number | null, gasNow: number | null): string {
  const parts: string[] = [];
  if (co2Then != null && co2Now != null) parts.push(`CO₂ ${round(co2Then)} → ${round(co2Now)} ppm`);
  if (gasThen != null && gasNow != null && gasThen > 0) {
    const change = round((1 - gasNow / gasThen) * 100);
    const direction = change > 0 ? `down ${change}%` : change < 0 ? `up ${Math.abs(change)}%` : "unchanged";
    parts.push(`gas resistance ${round(gasThen)} → ${round(gasNow)} Ω (${direction})`);
  }
  return parts.length ? `${parts.join(". ")}.` : "";
}

export function airReading(latest: NormalizedTelemetry, history: NormalizedTelemetry[]): AirReading {
  const rows = history.filter((item) => item.wearer_id === latest.wearer_id);
  const co2Now = latest.scd40.installed ? latest.scd40.co2_ppm : null;
  const gasNow = latest.bme688.installed ? latest.bme688.gas_resistance_ohm : null;
  const temp = latest.bme688.installed ? latest.bme688.temperature_c : null;
  const rh = latest.bme688.installed ? latest.bme688.humidity_rh : null;
  const hasCo2 = co2Now != null;
  const hasGas = gasNow != null;
  const warm = temp != null && rh != null && temp >= 30 && rh >= 65;
  const warmLine = warm ? " The air at the device is warm and humid. That is the board's air, not body temperature." : "";

  if (!hasCo2 && !hasGas) {
    return {
      kind: "awaiting",
      tone: "ok",
      title: "No air reading yet",
      detail: "The SCD40 and BME688 have not both reported a usable sample.",
    };
  }

  const latestMs = Date.parse(latest.received_at);
  const prior = Number.isNaN(latestMs) ? null : priorSample(rows, latestMs);
  const co2Then = prior?.scd40.installed ? prior.scd40.co2_ppm : null;
  const gasThen = prior?.bme688.installed ? prior.bme688.gas_resistance_ohm : null;
  const co2Delta = hasCo2 && co2Then != null ? co2Now - co2Then : null;
  const co2Rising = co2Delta != null && (co2Delta >= 120 || (co2Now >= 1000 && co2Delta >= 60));
  const co2High = hasCo2 && co2Now >= 5000;
  const co2Elevated = hasCo2 && co2Now >= 1000;
  const gasRatio = hasGas && gasThen != null && gasThen > 0 ? gasNow / gasThen : null;
  const gasDrop = gasRatio != null && gasRatio <= 0.75;
  const moved = trendSentence(co2Then, co2Now, gasThen, gasNow);

  if (hasCo2 && hasGas) {
    if (co2Rising && gasDrop) {
      return {
        kind: "both",
        tone: co2High ? "alert" : "warn",
        title: "CO₂ and the gas reading are both moving",
        detail: `${moved} The air at this person is changing in two ways. Gas resistance is not a carbon monoxide or LPG reading.${warmLine}`,
      };
    }
    if (co2Rising || (co2Elevated && !gasDrop)) {
      return {
        kind: "occupied",
        tone: co2High ? "alert" : "warn",
        title: co2Rising ? "CO₂ is climbing. The gas reading is steady." : "CO₂ is elevated. The gas reading is steady.",
        detail: `${co2Rising ? moved : `CO₂ is ${round(co2Now)} ppm.`} That fits exhaled air in a closed space. The BME688 did not show a separate gas shift.${warmLine}`,
      };
    }
    if (gasDrop) {
      return {
        kind: "mix",
        tone: "warn",
        title: "Gas reading dropped. CO₂ stayed steady.",
        detail: `${moved} Something besides exhaled CO₂ changed the air at the sensor. The BME688 does not name that gas, and this is not an LPG alarm.${warmLine}`,
      };
    }
    return {
      kind: "steady",
      tone: "ok",
      title: warm ? "Warm, humid air at the device" : "Air at the wearable is steady",
      detail: `CO₂ is ${round(co2Now)} ppm. Gas resistance is ${round(gasNow)} Ω. ${prior ? "Neither moved enough in the last minute to call a change." : "Not enough history yet to judge a change."}${warmLine}`,
    };
  }

  if (hasGas && !hasCo2) {
    return {
      kind: "bme",
      tone: gasDrop ? "warn" : "ok",
      title: gasDrop ? "Gas reading dropped" : warm ? "Warm, humid air at the device" : "BME688 air at the device",
      detail: `${temp == null ? "" : `${temp.toFixed(1)} °C. `}${rh == null ? "" : `${round(rh)}% humidity. `}Gas resistance is ${round(gasNow)} Ω. ${gasDrop ? moved : "No CO₂ sample, so this cannot tell exhaled air from another mix."} Gas resistance is not a carbon monoxide or LPG reading.${warmLine}`,
    };
  }

  const cue = co2Cue(co2Now, true);
  return {
    kind: cue === "routine" ? "steady" : "occupied",
    tone: cue === "high" ? "alert" : cue === "elevated" ? "warn" : "ok",
    title: cue === "high" ? "CO₂ is high" : cue === "elevated" ? "CO₂ is elevated" : "CO₂ is in the routine range",
    detail: `CO₂ is ${round(co2Now)} ppm from the SCD40. The BME688 has no gas sample to compare.${warmLine}`,
  };
}

export function airNeedsAttention(kind: AirKind): boolean {
  return kind === "occupied" || kind === "mix" || kind === "both";
}
