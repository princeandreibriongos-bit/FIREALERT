import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commelAllows, homeForRole, parseAccountRole, sessionMayOpen } from "../lib/auth/roles.ts";

describe("account roles", () => {
  it("maps the station desk and the site team", () => {
    assert.equal(parseAccountRole("commel"), "commel");
    assert.equal(parseAccountRole("dispatcher"), "commel");
    assert.equal(parseAccountRole("responder"), "responder");
    assert.equal(homeForRole("commel"), "/incidents");
    assert.equal(homeForRole("responder"), "/overview");
  });

  it("lets commel log incidents and blocks the field board", () => {
    assert.equal(commelAllows("/incidents/new", "GET"), true);
    assert.equal(commelAllows("/api/incidents", "POST"), true);
    assert.equal(sessionMayOpen("commel", "/sensors", "GET"), false);
    assert.equal(sessionMayOpen("commel", "/log", "GET"), false);
    assert.equal(sessionMayOpen("commel", "/gateway", "GET"), false);
    assert.equal(sessionMayOpen("commel", "/crew/FF-01", "GET"), false);
    assert.equal(sessionMayOpen("commel", "/api/telemetry", "GET"), false);
    assert.equal(sessionMayOpen("responder", "/gateway", "GET"), true);
    assert.equal(sessionMayOpen("admin", "/log", "GET"), true);
  });
});
