import type { RawTelemetry } from "./telemetry-core";

export function buildSampleCrew(now = Date.now()): { raw: RawTelemetry; receivedAt: string }[] {
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
  const quiet = {
    protocol_version: 2,
    simulated: true,
    source: "node-a",
    gateway: "node-b",
    uplink: { active: "wifi" as const, planned: "cellular", cellular_ready: false },
    signature: { alg: "ECDSA-P256-SHA256", hex: null, prefix_hex: null },
    battery: { ok: false, percent: null, voltage_v: null },
    max30102: { ok: false, heart_rate_bpm: null, spo2_percent: null },
    bme688: { ok: false, temperature_c: null, humidity_rh: null, pressure_hpa: null, gas_resistance_ohm: null },
    mpu6050: { ok: false, accel_g: null, gyro_dps: null },
    local_ui: { touchscreen: "not_installed" as const, buzzer: "not_installed" as const },
    gps: { ok: false, fix: "none", latitude: null, longitude: null, altitude_m: null, satellites: null },
    fall: { state: "idle", model: "edge-impulse-placeholder", grace_remaining_ms: 0 },
  };

  return [
    {
      receivedAt: at(1),
      raw: {
        ...quiet,
        wearer_id: "FF-02",
        source_mac: "24:6F:28:AA:00:02",
        rssi_dbm: -67,
        sequence: 4,
        timestamp_ms: 48000,
        scd40: { ok: false, co2_ppm: null, temperature_c: null, humidity_rh: null },
        gps: {
          ok: false,
          fix: "last_known",
          latitude: 14.5619,
          longitude: 121.0174,
          altitude_m: 18,
          satellites: 0,
        },
        fall: { state: "distress", model: "edge-impulse-placeholder", grace_remaining_ms: 0 },
        local_ui: { touchscreen: "requested_not_installed", buzzer: "requested_not_installed" },
      },
    },
    {
      receivedAt: at(3),
      raw: {
        ...quiet,
        wearer_id: "FF-01",
        source_mac: "24:6F:28:AA:00:01",
        rssi_dbm: -48,
        sequence: 3,
        timestamp_ms: 15000,
        scd40: { ok: true, co2_ppm: 842, temperature_c: 27.4, humidity_rh: 61.2 },
        bme688: { ok: true, temperature_c: 29.4, humidity_rh: 58, pressure_hpa: 1008, gas_resistance_ohm: 84200 },
      },
    },
    {
      receivedAt: at(8),
      raw: {
        ...quiet,
        wearer_id: "FF-01",
        source_mac: "24:6F:28:AA:00:01",
        rssi_dbm: -49,
        sequence: 2,
        timestamp_ms: 10000,
        scd40: { ok: true, co2_ppm: 816, temperature_c: 27.2, humidity_rh: 60.8 },
      },
    },
    {
      receivedAt: at(13),
      raw: {
        ...quiet,
        wearer_id: "FF-01",
        source_mac: "24:6F:28:AA:00:01",
        rssi_dbm: -51,
        sequence: 1,
        timestamp_ms: 5000,
        scd40: { ok: true, co2_ppm: 790, temperature_c: 27.1, humidity_rh: 60.4 },
      },
    },
  ];
}
