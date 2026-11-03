import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeCredentials, parseRouterInput, parseStoredNetworks } from "../lib/network-config.ts";

describe("router credentials", () => {
  it("accepts a name and password", () => {
    const parsed = parseRouterInput({ ssid: "  Station-AP  ", password: "secret" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.ssid, "Station-AP");
      assert.equal(parsed.value.password, "secret");
    }
  });

  it("accepts a phone hotspot name", () => {
    const parsed = parseRouterInput({ ssid: "Prince's iPhone", password: "hotspot-pass" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.ssid, "Prince's iPhone");
  });

  it("allows an open network and keeps a password that starts with a space", () => {
    const parsed = parseRouterInput({ ssid: "Lab", password: "  spaced" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.password, "  spaced");
  });

  it("keeps a saved room router when the file also has a hotspot slot", () => {
    const stored = parseStoredNetworks({
      active: "hotspot",
      ssid: "Phone",
      password: "hotspot-pass",
      router: { ssid: "PLDT", password: "router-pass", updated_at: "2026-10-26T11:04:37.401Z" },
      hotspot: { ssid: "Phone", password: "hotspot-pass", updated_at: "2026-10-27T00:00:00.000Z" },
    });
    assert.equal(stored.router.ssid, "PLDT");
    assert.equal(stored.router.password, "router-pass");
    assert.equal(stored.active, "hotspot");
    assert.equal(activeCredentials(stored).ssid, "Phone");
  });

  it("reads an older single-network file as the room router", () => {
    const stored = parseStoredNetworks({
      ssid: "PLDT",
      password: "router-pass",
      updated_at: "2026-10-26T11:04:37.401Z",
    });
    assert.equal(stored.active, "router");
    assert.equal(stored.router.ssid, "PLDT");
    assert.equal(stored.hotspot.ssid, "");
    assert.equal(activeCredentials(stored).ssid, "PLDT");
  });

  it("rejects a blank name, a long password, and line breaks", () => {
    assert.equal(parseRouterInput({ ssid: "   ", password: "x" }).ok, false);
    assert.equal(parseRouterInput({ ssid: "ok", password: "p".repeat(64) }).ok, false);
    assert.equal(parseRouterInput({ ssid: "bad\tname", password: "x" }).ok, false);
    assert.equal(parseRouterInput({ ssid: "ok", password: "a\nb" }).ok, false);
  });
});
