import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capItems, packetKey, parseBoard } from "../lib/board-shape.ts";

describe("shared board shape", () => {
  it("keeps the newest packets inside the shared size limit", () => {
    const items = Array.from({ length: 45 }, (_, index) => ({ id: index, blob: "x".repeat(20) }));
    const capped = capItems(items);
    assert.equal(capped.length <= 40, true);
    assert.equal(capped[0]?.id, 0);
    assert.ok(JSON.stringify(capped).length <= 48_000);
  });

  it("builds a stable packet identity", () => {
    const key = packetKey({ wearer_id: "B8:1F:3F:D8:18:EC", sequence: 12, timestamp_ms: 90, received_at: "2026-10-26T04:00:00.000Z" });
    assert.equal(key, "B8:1F:3F:D8:18:EC|12|90|2026-10-26T04:00:00.000Z");
  });

  it("drops malformed rows from a shared document", () => {
    const board = parseBoard({
      items: [{ wearer_id: "FF-01", received_at: "2026-10-26T04:00:00.000Z" }, { wearer_id: 4 }, "nope"],
      gateway: { wifi: "up", ip: "10.0.0.8", channel: 6, mac: "AA:BB:CC:DD:EE:FF", cellular: null, seen_at: "2026-10-26T04:00:00.000Z" },
      incidents: [{ id: "inc_1", title: "Alarm", address: "Ayala", notes: "", latitude: null, longitude: null, status: "open", created_at: "2026-10-26T04:00:00.000Z" }, { id: "bad" }],
    });
    assert.equal(board.items.length, 1);
    assert.equal(board.items[0]?.wearer_id, "FF-01");
    assert.equal(board.gateway.wifi, "up");
    assert.equal(board.gateway.ip, "10.0.0.8");
    assert.equal(board.incidents.length, 1);
    assert.equal(parseBoard(null).gateway.wifi, "down");
  });
});
