import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRouterInput } from "../lib/network-config.ts";

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

  it("rejects a blank name, a long password, and line breaks", () => {
    assert.equal(parseRouterInput({ ssid: "   ", password: "x" }).ok, false);
    assert.equal(parseRouterInput({ ssid: "ok", password: "p".repeat(64) }).ok, false);
    assert.equal(parseRouterInput({ ssid: "bad\tname", password: "x" }).ok, false);
    assert.equal(parseRouterInput({ ssid: "ok", password: "a\nb" }).ok, false);
  });
});
