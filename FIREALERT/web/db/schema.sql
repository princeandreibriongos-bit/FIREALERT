-- FIREALERT database
-- SQLite. Times are ISO-8601 UTC text. Measurements use NULL when that sensor is not installed.
--
-- Station
--   stations
--     gateways
--     wearables
--       telemetry_packets
--         telemetry_link
--         telemetry_power
--         telemetry_physiology
--         telemetry_environment
--         telemetry_motion
--         telemetry_location
--     incidents
-- router_settings          one current field-router row
-- sensor_slots             what each telemetry category is for

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  origin_note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gateways (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations (id),
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wearables (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations (id),
  mac TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS router_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ssid TEXT NOT NULL,
  password TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensor_slots (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_packets (
  id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL,
  wearable_id TEXT NOT NULL REFERENCES wearables (id),
  gateway_id TEXT NOT NULL REFERENCES gateways (id),
  protocol_version INTEGER NOT NULL,
  sequence INTEGER,
  device_timestamp_ms INTEGER,
  source TEXT NOT NULL,
  simulated INTEGER NOT NULL CHECK (simulated IN (0, 1))
);

CREATE TABLE IF NOT EXISTS telemetry_link (
  packet_id INTEGER PRIMARY KEY REFERENCES telemetry_packets (id) ON DELETE CASCADE,
  source_mac TEXT,
  rssi_dbm REAL,
  uplink TEXT NOT NULL CHECK (uplink IN ('wifi', 'cellular')),
  cellular_ready INTEGER NOT NULL CHECK (cellular_ready IN (0, 1)),
  router_ssid TEXT,
  signature_alg TEXT NOT NULL,
  signature_hex TEXT,
  signature_prefix_hex TEXT,
  signature_status TEXT NOT NULL CHECK (signature_status IN ('unsigned', 'valid', 'invalid', 'unverified'))
);

CREATE TABLE IF NOT EXISTS telemetry_power (
  packet_id INTEGER PRIMARY KEY REFERENCES telemetry_packets (id) ON DELETE CASCADE,
  battery_installed INTEGER NOT NULL CHECK (battery_installed IN (0, 1)),
  battery_percent REAL,
  battery_voltage_v REAL,
  touchscreen TEXT NOT NULL CHECK (touchscreen IN ('not_installed', 'requested_not_installed', 'installed', 'active')),
  buzzer TEXT NOT NULL CHECK (buzzer IN ('not_installed', 'requested_not_installed', 'installed', 'active'))
);

CREATE TABLE IF NOT EXISTS telemetry_physiology (
  packet_id INTEGER PRIMARY KEY REFERENCES telemetry_packets (id) ON DELETE CASCADE,
  installed INTEGER NOT NULL CHECK (installed IN (0, 1)),
  heart_rate_bpm REAL,
  spo2_percent REAL
);

CREATE TABLE IF NOT EXISTS telemetry_environment (
  packet_id INTEGER PRIMARY KEY REFERENCES telemetry_packets (id) ON DELETE CASCADE,
  scd40_installed INTEGER NOT NULL CHECK (scd40_installed IN (0, 1)),
  scd40_co2_ppm REAL,
  scd40_temperature_c REAL,
  scd40_humidity_rh REAL,
  bme688_installed INTEGER NOT NULL CHECK (bme688_installed IN (0, 1)),
  bme688_temperature_c REAL,
  bme688_humidity_rh REAL,
  bme688_pressure_hpa REAL,
  bme688_gas_resistance_ohm REAL
);

CREATE TABLE IF NOT EXISTS telemetry_motion (
  packet_id INTEGER PRIMARY KEY REFERENCES telemetry_packets (id) ON DELETE CASCADE,
  installed INTEGER NOT NULL CHECK (installed IN (0, 1)),
  accel_x_g REAL,
  accel_y_g REAL,
  accel_z_g REAL,
  gyro_x_dps REAL,
  gyro_y_dps REAL,
  gyro_z_dps REAL,
  fall_state TEXT NOT NULL CHECK (fall_state IN ('idle', 'possible', 'grace', 'distress', 'cancelled')),
  fall_model TEXT NOT NULL,
  grace_remaining_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_location (
  packet_id INTEGER PRIMARY KEY REFERENCES telemetry_packets (id) ON DELETE CASCADE,
  gps_state TEXT NOT NULL CHECK (gps_state IN ('none', 'fix', 'last_known')),
  latitude REAL,
  longitude REAL,
  altitude_m REAL,
  satellites INTEGER
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations (id),
  title TEXT NOT NULL,
  address TEXT NOT NULL,
  notes TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS telemetry_packets_recent
  ON telemetry_packets (received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS telemetry_packets_wearable
  ON telemetry_packets (wearable_id, received_at DESC);

CREATE INDEX IF NOT EXISTS incidents_open
  ON incidents (status, created_at DESC);

DROP VIEW IF EXISTS telemetry_record;

CREATE VIEW telemetry_record AS
SELECT
  p.id,
  p.received_at,
  p.wearable_id,
  p.gateway_id,
  p.protocol_version,
  p.sequence,
  p.device_timestamp_ms,
  p.source,
  p.simulated,
  l.source_mac,
  l.rssi_dbm,
  l.uplink,
  l.cellular_ready,
  l.router_ssid,
  l.signature_alg,
  l.signature_hex,
  l.signature_prefix_hex,
  l.signature_status,
  pw.battery_installed,
  pw.battery_percent,
  pw.battery_voltage_v,
  pw.touchscreen,
  pw.buzzer,
  ph.installed AS max30102_installed,
  ph.heart_rate_bpm,
  ph.spo2_percent,
  e.scd40_installed,
  e.scd40_co2_ppm,
  e.scd40_temperature_c,
  e.scd40_humidity_rh,
  e.bme688_installed,
  e.bme688_temperature_c,
  e.bme688_humidity_rh,
  e.bme688_pressure_hpa,
  e.bme688_gas_resistance_ohm,
  m.installed AS mpu6050_installed,
  m.accel_x_g,
  m.accel_y_g,
  m.accel_z_g,
  m.gyro_x_dps,
  m.gyro_y_dps,
  m.gyro_z_dps,
  m.fall_state,
  m.fall_model,
  m.grace_remaining_ms,
  g.gps_state,
  g.latitude,
  g.longitude,
  g.altitude_m,
  g.satellites
FROM telemetry_packets AS p
JOIN telemetry_link AS l ON l.packet_id = p.id
JOIN telemetry_power AS pw ON pw.packet_id = p.id
JOIN telemetry_physiology AS ph ON ph.packet_id = p.id
JOIN telemetry_environment AS e ON e.packet_id = p.id
JOIN telemetry_motion AS m ON m.packet_id = p.id
JOIN telemetry_location AS g ON g.packet_id = p.id;

INSERT OR IGNORE INTO schema_meta (id, version, applied_at)
VALUES (1, 1, '2026-10-28T07:00:00.000Z');

INSERT OR IGNORE INTO stations (id, name, address, latitude, longitude, origin_note)
VALUES (
  'nmcfs',
  'New Makati Central Fire Station',
  'Malugay Street, Makati City',
  14.5622863,
  121.016551,
  'Approximate map point for Malugay Street, Bel-Air. Replace it with a surveyed gate coordinate before operational use.'
);

INSERT OR IGNORE INTO sensor_slots (code, category, role) VALUES
  ('link', 'Link', 'Gateway, uplink, signal, and ECDSA signature status'),
  ('power', 'Power', 'Battery percent and voltage, touchscreen, buzzer'),
  ('max30102', 'Physiology', 'Heart rate and estimated oxygen saturation'),
  ('scd40', 'Environment', 'CO2, sensor temperature, and humidity'),
  ('bme688', 'Environment', 'Air temperature, humidity, pressure, and gas resistance'),
  ('mpu6050', 'Motion', 'Acceleration and gyro for the fall model'),
  ('fall', 'Motion', 'Fall state and cancel window'),
  ('gps', 'Location', 'Satellite fix or last-known point');
