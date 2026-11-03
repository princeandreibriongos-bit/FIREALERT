import assert from "node:assert/strict";
import test from "node:test";
import { incidentPhase, type Incident } from "../lib/incidents.ts";

function sample(partial: Partial<Incident>): Incident {
  return {
    id: "inc",
    title: "Alarm",
    address: "Ayala Avenue",
    notes: "",
    latitude: null,
    longitude: null,
    status: "open",
    created_at: "2026-11-04T00:00:00.000Z",
    reported_at: "2026-11-04T00:00:00.000Z",
    created_by_user_id: null,
    created_by_username: null,
    closed_at: null,
    caller_name: null,
    caller_contact: null,
    acknowledged_at: null,
    acknowledged_by_user_id: null,
    acknowledged_by_username: null,
    ...partial,
  };
}

test("incident phase follows the desk and the responder", () => {
  assert.equal(incidentPhase(sample({})), "reported");
  assert.equal(incidentPhase(sample({ acknowledged_at: "2026-11-04T01:00:00.000Z" })), "responding");
  assert.equal(incidentPhase(sample({ status: "closed", acknowledged_at: "2026-11-04T01:00:00.000Z" })), "closed");
});
