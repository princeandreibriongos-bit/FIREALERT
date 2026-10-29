import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gatewayPhase, newestHardware, noteLink, parseLinkReport, readLink, wearablePhase } from "../lib/link-status.ts";

describe("gateway link reports", () => {
  it("accepts a heartbeat from the USB bridge", () => {
    const parsed = parseLinkReport({
      wifi: "up",
      ip: "192.168.43.84",
      channel: 6,
      mac: "14:C1:9F:C8:57:D8",
      cellular: "not-installed",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const saved = noteLink(parsed.value, "2026-10-26T03:00:00.000Z");
    assert.equal(saved.wifi, "up");
    assert.equal(saved.ssid, null);
    assert.equal(readLink().ip, "192.168.43.84");
  });

  it("keeps the network name the gateway actually joined", () => {
    const parsed = parseLinkReport({
      wifi: "up",
      ip: "192.168.43.84",
      channel: 6,
      mac: "14:C1:9F:C8:57:D8",
      cellular: "not-installed",
      ssid: "Phone Hotspot",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.ssid, "Phone Hotspot");
    assert.equal(parseLinkReport({ wifi: "down", ip: "0.0.0.0", channel: 9, mac: "14:C1:9F:C8:57:D8", ssid: "-" }).ok, true);
  });

  it("rejects an unknown wifi state", () => {
    assert.equal(parseLinkReport({ wifi: "maybe" }).ok, false);
  });
});

describe("connection phases", () => {
  const now = Date.parse("2026-10-26T03:00:10.000Z");

  it("treats a fresh Wi-Fi up heartbeat as connected", () => {
    assert.equal(
      gatewayPhase(
        { wifi: "up", ip: "172.20.10.4", channel: 6, mac: "AA:BB:CC:DD:EE:FF", cellular: null, ssid: null, seen_at: "2026-10-26T03:00:08.000Z" },
        now,
      ),
      "up",
    );
  });

  it("drops a heartbeat that has gone quiet", () => {
    assert.equal(
      gatewayPhase(
        { wifi: "up", ip: "172.20.10.4", channel: 6, mac: null, cellular: null, ssid: null, seen_at: "2026-10-26T02:59:00.000Z" },
        now,
      ),
      "waiting",
    );
  });

  it("ignores simulated crew when deciding the wearable link", () => {
    const crew = [
      { simulated: true, received_at: "2026-10-26T03:00:09.000Z", wearer_id: "FF-01" },
      { simulated: false, received_at: "2026-10-26T02:00:00.000Z", wearer_id: "B8:1F:3F:D8:18:EC" },
    ];
    assert.equal(wearablePhase(crew, now), "stale");
    assert.equal(newestHardware(crew)?.wearer_id, "B8:1F:3F:D8:18:EC");
    assert.equal(wearablePhase([{ simulated: true, received_at: "2026-10-26T03:00:09.000Z" }], now), "waiting");
  });
});
