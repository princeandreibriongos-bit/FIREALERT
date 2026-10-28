import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { parseIncidentInput } from "../lib/incidents.ts";
import { osrmUrl, parseOsrm } from "../lib/routing.ts";
import {
  airNeedsAttention,
  airReading,
  co2Cue,
  gpsIsCurrent,
  latestByWearer,
  linkState,
  normalizeTelemetry,
  type NormalizedTelemetry,
} from "../lib/telemetry-core.ts";
import { signatureStatus } from "../lib/verify.ts";

const at = "2026-10-24T02:00:00.000Z";

function sample(overrides: Record<string, unknown> = {}) {
  const entry = normalizeTelemetry(
    {
      wearer_id: "FF-01",
      source_mac: "AA:BB:CC:DD:EE:01",
      scd40: { ok: true, co2_ppm: 800, temperature_c: 27, humidity_rh: 55 },
      ...overrides,
    },
    at,
    signatureStatus,
  );
  assert.ok(entry);
  return entry;
}

describe("telemetry", () => {
  it("keeps missing sensors off and ignores values when ok is false", () => {
    const entry = sample({
      max30102: { ok: false, heart_rate_bpm: 180, spo2_percent: 99 },
      bme688: { ok: false, gas_resistance_ohm: 50000 },
    });
    assert.equal(entry.max30102.installed, false);
    assert.equal(entry.max30102.heart_rate_bpm, null);
    assert.equal(entry.bme688.installed, false);
    assert.equal(entry.bme688.gas_resistance_ohm, null);
    assert.equal(entry.scd40.co2_ppm, 800);
    assert.equal(entry.mpu6050.installed, false);
    assert.equal(entry.mq6.installed, false);
    assert.equal(entry.mq6.raw, null);
    assert.equal(entry.signature.status, "unsigned");
    assert.equal(entry.uplink, "wifi");
    assert.equal(entry.cellular_ready, false);
  });

  it("does not treat a last-known GPS point as the current fix", () => {
    const entry = sample({
      gps: { fix: "last_known", latitude: 14.56, longitude: 121.02, altitude_m: 12, satellites: 0 },
    });
    assert.equal(entry.gps.state, "last_known");
    assert.equal(gpsIsCurrent(entry.gps), false);
    assert.equal(gpsIsCurrent({ ...entry.gps, state: "fix" }), true);
  });

  it("groups the newest packet per wearer", () => {
    const older = sample();
    const newer = sample({ sequence: 2 });
    const other = sample({ wearer_id: "FF-02", fall: { state: "distress" } });
    const crew = latestByWearer([other, newer, older] as NormalizedTelemetry[]);
    assert.deepEqual(
      crew.map((person) => person.wearer_id),
      ["FF-02", "FF-01"],
    );
    assert.equal(crew[1].sequence, 2);
    assert.equal(crew[0].fall.state, "distress");
  });

  it("labels CO2 cues and link age", () => {
    assert.equal(co2Cue(null, false), "awaiting");
    assert.equal(co2Cue(800, true), "routine");
    assert.equal(co2Cue(1500, true), "elevated");
    assert.equal(co2Cue(6000, true), "high");
    assert.equal(linkState(at, Date.parse(at) + 5000), "live");
    assert.equal(linkState(at, Date.parse(at) + 21000), "stale");
  });

  it("reads CO2 and gas resistance together", () => {
    const older = sample({
      sequence: 1,
      scd40: { ok: true, co2_ppm: 700, temperature_c: 31, humidity_rh: 60 },
      bme688: { ok: true, temperature_c: 32, humidity_rh: 66, pressure_hpa: 1013, gas_resistance_ohm: 40000 },
    });
    const climbed = sample({
      sequence: 2,
      scd40: { ok: true, co2_ppm: 980, temperature_c: 31, humidity_rh: 60 },
      bme688: { ok: true, temperature_c: 32, humidity_rh: 66, pressure_hpa: 1013, gas_resistance_ohm: 39000 },
    });
    climbed.received_at = "2026-10-24T02:01:20.000Z";
    const occupied = airReading(climbed, [climbed, older]);
    assert.equal(occupied.kind, "occupied");
    assert.equal(airNeedsAttention(occupied.kind), true);

    const shifted = sample({
      sequence: 3,
      scd40: { ok: true, co2_ppm: 720, temperature_c: 31, humidity_rh: 60 },
      bme688: { ok: true, temperature_c: 32, humidity_rh: 66, pressure_hpa: 1013, gas_resistance_ohm: 20000 },
    });
    shifted.received_at = "2026-10-24T02:01:20.000Z";
    assert.equal(airReading(shifted, [shifted, older]).kind, "mix");

    const both = sample({
      sequence: 4,
      scd40: { ok: true, co2_ppm: 1100, temperature_c: 31, humidity_rh: 60 },
      bme688: { ok: true, temperature_c: 32.5, humidity_rh: 70, pressure_hpa: 1013, gas_resistance_ohm: 18000 },
    });
    both.received_at = "2026-10-24T02:01:20.000Z";
    const combined = airReading(both, [both, older]);
    assert.equal(combined.kind, "both");
    assert.match(combined.detail, /not a carbon monoxide or LPG reading/i);
    assert.match(combined.detail, /warm and humid/i);
  });

  it("keeps an MQ-6 reading only when the sensor reports ok", () => {
    const missing = sample();
    assert.equal(missing.mq6.installed, false);
    const present = sample({ mq6: { ok: true, raw: 1800 } });
    assert.equal(present.mq6.installed, true);
    assert.equal(present.mq6.raw, 1800);
    const ignored = sample({ mq6: { ok: false, raw: 1800 } });
    assert.equal(ignored.mq6.raw, null);
  });

  it("rejects a non-object packet", () => {
    assert.equal(normalizeTelemetry(["nope"], at, signatureStatus), null);
  });
});

describe("signatures", () => {
  it("verifies a P-256 signature and rejects a tampered prefix", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const prefix = "00112233";
    const sign = createSign("SHA256");
    sign.update(Buffer.from(prefix, "hex"));
    sign.end();
    const signature = sign.sign(privateKey).toString("hex");

    assert.equal(signatureStatus(null, null, pem), "unsigned");
    assert.equal(signatureStatus(prefix, signature, null), "unverified");
    assert.equal(signatureStatus(prefix, signature, pem), "valid");
    assert.equal(signatureStatus("ff112233", signature, pem), "invalid");
  });
});

describe("incidents and routes", () => {
  it("requires a title and a complete coordinate pair", () => {
    assert.equal(parseIncidentInput({ address: "Ayala" }).ok, false);
    assert.equal(parseIncidentInput({ title: "Alarm", address: "Ayala", latitude: 14.5 }).ok, false);
    const parsed = parseIncidentInput({ title: "Alarm", address: "Ayala Avenue, Makati", notes: "2nd alarm" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.latitude, null);
  });

  it("builds an OSRM request in lon,lat order and reads a route", () => {
    const url = osrmUrl({ latitude: 14.5, longitude: 121.0 }, { latitude: 14.6, longitude: 121.1 });
    assert.match(url, /121,14\.5;121\.1,14\.6/);
    const parsed = parseOsrm({
      code: "Ok",
      routes: [{ distance: 1200, duration: 180, geometry: { coordinates: [[121, 14.5], [121.1, 14.6]] } }],
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.routes[0].distance_m, 1200);
      assert.equal(parsed.routes[0].coordinates.length, 2);
    }
  });
});
