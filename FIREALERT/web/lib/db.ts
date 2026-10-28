import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FallState, GpsState, NormalizedTelemetry, SignatureStatus, UiState, Uplink } from "./telemetry-core";

const STATION_ID = "nmcfs";
const MAX_PACKETS = 250;

type Sql = Record<string, unknown>;

type Statements = {
  upsertGateway: ReturnType<DatabaseSync["prepare"]>;
  upsertWearable: ReturnType<DatabaseSync["prepare"]>;
  insertPacket: ReturnType<DatabaseSync["prepare"]>;
  insertLink: ReturnType<DatabaseSync["prepare"]>;
  insertPower: ReturnType<DatabaseSync["prepare"]>;
  insertPhysiology: ReturnType<DatabaseSync["prepare"]>;
  insertEnvironment: ReturnType<DatabaseSync["prepare"]>;
  insertMotion: ReturnType<DatabaseSync["prepare"]>;
  insertLocation: ReturnType<DatabaseSync["prepare"]>;
  prune: ReturnType<DatabaseSync["prepare"]>;
  listPackets: ReturnType<DatabaseSync["prepare"]>;
  clearPackets: ReturnType<DatabaseSync["prepare"]>;
  readRouter: ReturnType<DatabaseSync["prepare"]>;
  writeRouter: ReturnType<DatabaseSync["prepare"]>;
  listIncidents: ReturnType<DatabaseSync["prepare"]>;
  insertIncident: ReturnType<DatabaseSync["prepare"]>;
  readIncident: ReturnType<DatabaseSync["prepare"]>;
  updateIncident: ReturnType<DatabaseSync["prepare"]>;
};

let database: DatabaseSync | null = null;
let statements: Statements | null = null;

function databasePath(): string {
  return process.env.FIREALERT_DB ?? path.join(process.cwd(), "data", "firealert.db");
}

function schemaSql(): string {
  return readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
}

function bit(value: boolean): number {
  return value ? 1 : 0;
}

function flag(value: unknown): boolean {
  return value === 1 || value === true;
}

function num(value: unknown): number | null {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function openDatabase(): DatabaseSync {
  const file = databasePath();
  if (file !== ":memory:") {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  const opened = new DatabaseSync(file);
  opened.exec("PRAGMA foreign_keys = ON");
  if (file !== ":memory:") opened.exec("PRAGMA journal_mode = WAL");
  opened.exec(schemaSql());
  if (file !== ":memory:") {
    try {
      chmodSync(file, 0o600);
    } catch {
      // Windows may refuse the mode. The file still stays under web/data.
    }
  }
  importLegacyRouter(opened);
  return opened;
}

function importLegacyRouter(opened: DatabaseSync): void {
  const existing = opened.prepare("SELECT id FROM router_settings WHERE id = 1").get();
  if (existing) return;
  const file = path.join(process.cwd(), "data", "network.json");
  if (!existsSync(file)) return;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed == null) return;
    const record = parsed as Record<string, unknown>;
    const ssid = typeof record.ssid === "string" ? record.ssid.trim() : "";
    const password = typeof record.password === "string" ? record.password : "";
    if (!ssid || ssid.length > 32 || password.length > 63) return;
    const updated = typeof record.updated_at === "string" ? record.updated_at : new Date().toISOString();
    opened.prepare("INSERT INTO router_settings (id, ssid, password, updated_at) VALUES (1, ?, ?, ?)").run(ssid, password, updated);
  } catch {
    // A broken network.json should not block the database.
  }
}

function prepare(opened: DatabaseSync): Statements {
  return {
    upsertGateway: opened.prepare(
      "INSERT INTO gateways (id, station_id, label) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
    ),
    upsertWearable: opened.prepare(
      `INSERT INTO wearables (id, station_id, mac, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET mac = COALESCE(excluded.mac, wearables.mac)`,
    ),
    insertPacket: opened.prepare(
      `INSERT INTO telemetry_packets (
         received_at, wearable_id, gateway_id, protocol_version, sequence, device_timestamp_ms, source, simulated
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertLink: opened.prepare(
      `INSERT INTO telemetry_link (
         packet_id, source_mac, rssi_dbm, uplink, cellular_ready, router_ssid,
         signature_alg, signature_hex, signature_prefix_hex, signature_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertPower: opened.prepare(
      `INSERT INTO telemetry_power (
         packet_id, battery_installed, battery_percent, battery_voltage_v, touchscreen, buzzer
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    insertPhysiology: opened.prepare(
      `INSERT INTO telemetry_physiology (packet_id, installed, heart_rate_bpm, spo2_percent) VALUES (?, ?, ?, ?)`,
    ),
    insertEnvironment: opened.prepare(
      `INSERT INTO telemetry_environment (
         packet_id, scd40_installed, scd40_co2_ppm, scd40_temperature_c, scd40_humidity_rh,
         bme688_installed, bme688_temperature_c, bme688_humidity_rh, bme688_pressure_hpa, bme688_gas_resistance_ohm
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertMotion: opened.prepare(
      `INSERT INTO telemetry_motion (
         packet_id, installed, accel_x_g, accel_y_g, accel_z_g, gyro_x_dps, gyro_y_dps, gyro_z_dps,
         fall_state, fall_model, grace_remaining_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertLocation: opened.prepare(
      `INSERT INTO telemetry_location (packet_id, gps_state, latitude, longitude, altitude_m, satellites)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    prune: opened.prepare(
      `DELETE FROM telemetry_packets
       WHERE id NOT IN (
         SELECT id FROM telemetry_packets ORDER BY received_at DESC, id DESC LIMIT ?
       )`,
    ),
    listPackets: opened.prepare(
      "SELECT * FROM telemetry_record ORDER BY received_at DESC, id DESC LIMIT ?",
    ),
    clearPackets: opened.prepare("DELETE FROM telemetry_packets"),
    readRouter: opened.prepare("SELECT ssid, password, updated_at FROM router_settings WHERE id = 1"),
    writeRouter: opened.prepare(
      `INSERT INTO router_settings (id, ssid, password, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ssid = excluded.ssid, password = excluded.password, updated_at = excluded.updated_at`,
    ),
    listIncidents: opened.prepare(
      `SELECT id, title, address, notes, latitude, longitude, status, created_at, closed_at
       FROM incidents ORDER BY created_at DESC, id DESC`,
    ),
    insertIncident: opened.prepare(
      `INSERT INTO incidents (id, station_id, title, address, notes, latitude, longitude, status, created_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL)`,
    ),
    readIncident: opened.prepare(
      `SELECT id, title, address, notes, latitude, longitude, status, created_at, closed_at
       FROM incidents WHERE id = ?`,
    ),
    updateIncident: opened.prepare("UPDATE incidents SET status = ?, closed_at = ? WHERE id = ?"),
  };
}

export function getDatabase(): DatabaseSync {
  if (!database) {
    database = openDatabase();
    statements = prepare(database);
  }
  return database;
}

function sql(): { db: DatabaseSync; s: Statements } {
  const db = getDatabase();
  if (!statements) statements = prepare(db);
  return { db, s: statements };
}

function transaction(db: DatabaseSync, run: () => void): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function writePacket(s: Statements, entry: NormalizedTelemetry): void {
  s.upsertGateway.run(entry.gateway, STATION_ID, entry.gateway);
  s.upsertWearable.run(entry.wearer_id, STATION_ID, entry.source_mac, entry.received_at);
  const inserted = s.insertPacket.run(
    entry.received_at,
    entry.wearer_id,
    entry.gateway,
    entry.protocol_version,
    entry.sequence,
    entry.timestamp_ms,
    entry.source,
    bit(entry.simulated),
  );
  const packetId = Number(inserted.lastInsertRowid);
  const accel = entry.mpu6050.accel_g;
  const gyro = entry.mpu6050.gyro_dps;
  s.insertLink.run(
    packetId,
    entry.source_mac,
    entry.rssi_dbm,
    entry.uplink,
    bit(entry.cellular_ready),
    entry.router_ssid,
    entry.signature.alg,
    entry.signature.hex,
    entry.signature.prefix_hex,
    entry.signature.status,
  );
  s.insertPower.run(
    packetId,
    bit(entry.battery.installed),
    entry.battery.percent,
    entry.battery.voltage_v,
    entry.local_ui.touchscreen,
    entry.local_ui.buzzer,
  );
  s.insertPhysiology.run(
    packetId,
    bit(entry.max30102.installed),
    entry.max30102.heart_rate_bpm,
    entry.max30102.spo2_percent,
  );
  s.insertEnvironment.run(
    packetId,
    bit(entry.scd40.installed),
    entry.scd40.co2_ppm,
    entry.scd40.temperature_c,
    entry.scd40.humidity_rh,
    bit(entry.bme688.installed),
    entry.bme688.temperature_c,
    entry.bme688.humidity_rh,
    entry.bme688.pressure_hpa,
    entry.bme688.gas_resistance_ohm,
  );
  s.insertMotion.run(
    packetId,
    bit(entry.mpu6050.installed),
    accel?.x ?? null,
    accel?.y ?? null,
    accel?.z ?? null,
    gyro?.x ?? null,
    gyro?.y ?? null,
    gyro?.z ?? null,
    entry.fall.state,
    entry.fall.model,
    entry.fall.grace_remaining_ms,
  );
  s.insertLocation.run(
    packetId,
    entry.gps.state,
    entry.gps.latitude,
    entry.gps.longitude,
    entry.gps.altitude_m,
    entry.gps.satellites,
  );
}

export function insertTelemetry(entry: NormalizedTelemetry): void {
  const { db, s } = sql();
  transaction(db, () => {
    writePacket(s, entry);
    s.prune.run(MAX_PACKETS);
  });
}

export function replaceTelemetryRows(entries: NormalizedTelemetry[]): void {
  const { db, s } = sql();
  const kept = entries.slice(0, MAX_PACKETS);
  transaction(db, () => {
    s.clearPackets.run();
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      const entry = kept[index];
      if (entry) writePacket(s, entry);
    }
  });
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

const FALL_STATES = ["idle", "possible", "grace", "distress", "cancelled"] as const;
const GPS_STATES = ["none", "fix", "last_known"] as const;
const UI_STATES = ["not_installed", "requested_not_installed", "installed", "active"] as const;
const SIGNATURE_STATES = ["unsigned", "valid", "invalid", "unverified"] as const;

export function rowToTelemetry(row: Sql): NormalizedTelemetry {
  const motionInstalled = flag(row.mpu6050_installed);
  const gpsState = oneOf<GpsState>(row.gps_state, GPS_STATES, "none");
  return {
    received_at: text(row.received_at) ?? "",
    protocol_version: num(row.protocol_version) ?? 0,
    simulated: flag(row.simulated),
    wearer_id: text(row.wearable_id) ?? "unassigned",
    source: text(row.source) ?? "node-a",
    gateway: text(row.gateway_id) ?? "gateway",
    router_ssid: text(row.router_ssid),
    uplink: oneOf<Uplink>(row.uplink, ["wifi", "cellular"], "wifi"),
    cellular_ready: flag(row.cellular_ready),
    source_mac: text(row.source_mac),
    rssi_dbm: num(row.rssi_dbm),
    sequence: num(row.sequence),
    timestamp_ms: num(row.device_timestamp_ms),
    signature: {
      alg: text(row.signature_alg) ?? "ECDSA-P256-SHA256",
      hex: text(row.signature_hex),
      prefix_hex: text(row.signature_prefix_hex),
      status: oneOf<SignatureStatus>(row.signature_status, SIGNATURE_STATES, "unsigned"),
    },
    battery: {
      installed: flag(row.battery_installed),
      percent: num(row.battery_percent),
      voltage_v: num(row.battery_voltage_v),
    },
    max30102: {
      installed: flag(row.max30102_installed),
      heart_rate_bpm: num(row.heart_rate_bpm),
      spo2_percent: num(row.spo2_percent),
    },
    bme688: {
      installed: flag(row.bme688_installed),
      temperature_c: num(row.bme688_temperature_c),
      humidity_rh: num(row.bme688_humidity_rh),
      pressure_hpa: num(row.bme688_pressure_hpa),
      gas_resistance_ohm: num(row.bme688_gas_resistance_ohm),
    },
    scd40: {
      installed: flag(row.scd40_installed),
      co2_ppm: num(row.scd40_co2_ppm),
      temperature_c: num(row.scd40_temperature_c),
      humidity_rh: num(row.scd40_humidity_rh),
    },
    mpu6050: {
      installed: motionInstalled,
      accel_g: motionInstalled
        ? { x: num(row.accel_x_g), y: num(row.accel_y_g), z: num(row.accel_z_g) }
        : null,
      gyro_dps: motionInstalled
        ? { x: num(row.gyro_x_dps), y: num(row.gyro_y_dps), z: num(row.gyro_z_dps) }
        : null,
    },
    gps: {
      state: gpsState,
      latitude: num(row.latitude),
      longitude: num(row.longitude),
      altitude_m: num(row.altitude_m),
      satellites: num(row.satellites),
    },
    fall: {
      state: oneOf<FallState>(row.fall_state, FALL_STATES, "idle"),
      model: text(row.fall_model) ?? "edge-impulse-placeholder",
      grace_remaining_ms: num(row.grace_remaining_ms) ?? 0,
    },
    local_ui: {
      touchscreen: oneOf<UiState>(row.touchscreen, UI_STATES, "not_installed"),
      buzzer: oneOf<UiState>(row.buzzer, UI_STATES, "not_installed"),
    },
  };
}

export function listTelemetryRows(): NormalizedTelemetry[] {
  const { s } = sql();
  return s.listPackets.all(MAX_PACKETS).map((row) => rowToTelemetry(row as Sql));
}

export type RouterRow = { ssid: string; password: string; updated_at: string | null };

export function readRouterRow(): RouterRow {
  const { s } = sql();
  const row = s.readRouter.get() as Sql | undefined;
  if (!row) return { ssid: "", password: "", updated_at: null };
  return {
    ssid: text(row.ssid) ?? "",
    password: text(row.password) ?? "",
    updated_at: text(row.updated_at),
  };
}

export function writeRouterRow(value: { ssid: string; password: string; updated_at: string }): void {
  const { s } = sql();
  s.writeRouter.run(value.ssid, value.password, value.updated_at);
}

export type IncidentRow = {
  id: string;
  title: string;
  address: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
};

function incidentFromRow(row: Sql): IncidentRow {
  const status = row.status === "closed" ? "closed" : "open";
  return {
    id: text(row.id) ?? "",
    title: text(row.title) ?? "",
    address: text(row.address) ?? "",
    notes: text(row.notes) ?? "",
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    status,
    created_at: text(row.created_at) ?? "",
    closed_at: text(row.closed_at),
  };
}

export function listIncidentRows(): IncidentRow[] {
  const { s } = sql();
  return s.listIncidents.all().map((row) => incidentFromRow(row as Sql));
}

export function insertIncidentRow(row: IncidentRow): void {
  const { s } = sql();
  s.insertIncident.run(row.id, STATION_ID, row.title, row.address, row.notes, row.latitude, row.longitude, row.created_at);
}

export function updateIncidentStatus(id: string, status: "open" | "closed", closedAt: string | null): IncidentRow | null {
  const { s } = sql();
  const current = s.readIncident.get(id) as Sql | undefined;
  if (!current) return null;
  s.updateIncident.run(status, closedAt, id);
  const next = s.readIncident.get(id) as Sql | undefined;
  return next ? incidentFromRow(next) : null;
}

export function closeDatabase(): void {
  database?.close();
  database = null;
  statements = null;
}
