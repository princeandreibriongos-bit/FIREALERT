import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLoginInput } from "../lib/auth/login-input.ts";

describe("parseLoginInput", () => {
  it("accepts a valid username and password", () => {
    const result = parseLoginInput({ username: "ff.admin", password: "secret-pass" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.username, "ff.admin");
      assert.equal(result.value.password, "secret-pass");
    }
  });

  it("rejects short passwords", () => {
    const result = parseLoginInput({ username: "admin", password: "short" });
    assert.equal(result.ok, false);
  });

  it("rejects invalid username characters", () => {
    const result = parseLoginInput({ username: "bad name", password: "long-enough" });
    assert.equal(result.ok, false);
  });
});
