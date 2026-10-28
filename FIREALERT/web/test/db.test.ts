import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { closeDatabase, getDatabase } from "../lib/db.ts";
import { addIncident, listIncidents, setIncidentStatus } from "../lib/incidents.ts";
import { readRouter, writeRouter } from "../lib/network-config.ts";
import { listTelemetry, logTelemetry, replaceTelemetry } from "../lib/telemetry-store.ts";

const dir = mkdtempSync(path.join(tmpdir(), "firealert-db-"));
process.env.FIREALERT_DB = path.join(dir, "firealert.db");

after(() => {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe("database layout", () => {
  it("keeps station, devices, telemetry categories, incidents, and the router in separate tables", () => {
    const names = getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.deepEqual(names, [
      "gateways",
      "incidents",
      "router_settings",
      "schema_meta",
      "sensor_slots",
      "stations",
      "telemetry_environment",
      "telemetry_link",
      "telemetry_location",
      "telemetry_motion",
      "telemetry_packets",
      "telemetry_physiology",
      "telemetry_power",
      "wearables",
    ]);

    const station = getDatabase().prepare("SELECT id, name FROM stations").get();
    assert.equal(station?.id, "nmcfs");
    assert.equal(station?.name, "New Makati Central Fire Station");

    const slots = getDatabase().prepare("SELECT category, code FROM sensor_slots ORDER BY code").all();
    assert.deepEqual(
      slots.map((row) => `${row.category}:${row.code}`),
      [
        "Environment:bme688",
        "Motion:fall",
        "Location:gps",
        "Link:link",
        "Physiology:max30102",
        "Motion:mpu6050",
        "Power:power",
        "Environment:scd40",
      ],
    );
  });
});

describe("telemetry persistence", () => {
  it("stores a packet in category tables and reads the same record back", () => {
    const saved = logTelemetry(
      {
        protocol_version: 2,
        wearer_id: "FF-01",
        gateway: "node-b",
        source_mac: "aa:bb:cc:dd:ee:01",
        sequence: 7,
        rssi_dbm: -61,
        uplink: { active: "wifi", cellular_ready: false },
        router_ssid: "Station-AP",
        scd40: { ok: true, co2_ppm: 820, temperature_c: 31.5, humidity_rh: 54 },
        gps: { fix: "last_known", latitude: 14.554, longitude: 121.021, altitude_m: 16, satellites: 8 },
        fall: { state: "grace", model: "edge-impulse-placeholder", grace_remaining_ms: 9000 },
        signature: { alg: "ECDSA-P256-SHA256" },
      },
      "2026-10-28T07:00:00.000Z",
    );
    assert.ok(saved);
    const [latest] = listTelemetry();
    assert.deepEqual(latest, saved);

    const counts = getDatabase()
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM telemetry_packets) AS packets,
           (SELECT COUNT(*) FROM telemetry_environment) AS environment,
           (SELECT COUNT(*) FROM telemetry_location) AS location,
           (SELECT COUNT(*) FROM wearables) AS wearables,
           (SELECT COUNT(*) FROM gateways) AS gateways`,
      )
      .get();
    assert.equal(counts?.packets, 1);
    assert.equal(counts?.environment, 1);
    assert.equal(counts?.location, 1);
    assert.equal(counts?.wearables, 1);
    assert.equal(counts?.gateways, 1);
  });

  it("keeps the newest 250 packets", () => {
    replaceTelemetry([]);
    const start = Date.parse("2026-10-28T08:00:00.000Z");
    for (let index = 0; index < 251; index += 1) {
      logTelemetry({ wearer_id: "FF-09", sequence: index }, new Date(start + index * 1000).toISOString());
    }
    const rows = listTelemetry();
    assert.equal(rows.length, 250);
    assert.equal(rows[0]?.sequence, 250);
    assert.equal(rows.at(-1)?.sequence, 1);
  });

  it("replaces the packet log", () => {
    const entry = logTelemetry({ wearer_id: "FF-02", sequence: 1 }, "2026-10-28T09:00:00.000Z");
    assert.ok(entry);
    replaceTelemetry([]);
    assert.equal(listTelemetry().length, 0);
    const wearable = getDatabase().prepare("SELECT id FROM wearables WHERE id = ?").get("FF-02");
    assert.equal(wearable?.id, "FF-02");
  });
});

describe("incidents and router", () => {
  it("saves an incident and records when it is closed", () => {
    const incident = addIncident({
      title: "Alarm",
      address: "Ayala Avenue, Makati",
      notes: "2nd alarm",
      latitude: 14.55,
      longitude: 121.02,
    });
    assert.equal(incident.status, "open");
    assert.equal(incident.closed_at, null);
    const closed = setIncidentStatus(incident.id, "closed");
    assert.equal(closed?.status, "closed");
    assert.equal(typeof closed?.closed_at, "string");
    assert.equal(listIncidents().some((item) => item.id === incident.id && item.status === "closed"), true);
    assert.equal(setIncidentStatus("missing", "closed"), null);
  });

  it("saves the current router as a single row", async () => {
    const saved = await writeRouter({ ssid: "Station-AP", password: "secret" });
    const loaded = await readRouter();
    assert.deepEqual(loaded, saved);
    const count = getDatabase().prepare("SELECT COUNT(*) AS total FROM router_settings").get();
    assert.equal(count?.total, 1);
  });
});
