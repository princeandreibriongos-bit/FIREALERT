"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmt, manilaTime } from "@/lib/format";
import { FALL_STATES, type FallState } from "@/lib/telemetry-core";
import { useBoard } from "./board-provider";
import { Badge, EmptyState, PageHeader } from "./ui";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function PacketLog() {
  const { items, error, crew, busy, clearPackets } = useBoard();
  const [wearer, setWearer] = useState("all");
  const [fall, setFall] = useState<"all" | FallState>("all");
  const [shown, setShown] = useState(20);
  const [confirmClear, setConfirmClear] = useState(false);

  const rows = useMemo(() => {
    return (items ?? []).filter((row) => {
      if (wearer !== "all" && row.wearer_id !== wearer) return false;
      if (fall !== "all" && row.fall.state !== fall) return false;
      return true;
    });
  }, [fall, items, wearer]);

  function download() {
    const header = ["received_at", "wearer_id", "sequence", "co2_ppm", "heart_rate_bpm", "fall", "gps", "signature"];
    const body = rows.map((row) =>
      [
        row.received_at,
        row.wearer_id,
        row.sequence == null ? "" : String(row.sequence),
        row.scd40.co2_ppm == null ? "" : String(row.scd40.co2_ppm),
        row.max30102.heart_rate_bpm == null ? "" : String(row.max30102.heart_rate_bpm),
        row.fall.state,
        row.gps.state,
        row.signature.status,
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "firealert-packets.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const loading = items === null && !error;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Record"
        title="Packet log"
        description="Packets stored on this board, newest first. Philippine time. Export covers the current filter."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={download} disabled={rows.length === 0}>
              Export CSV
            </button>
            {confirmClear ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy !== null}
                  onClick={() => {
                    void clearPackets().then(() => setConfirmClear(false));
                  }}
                >
                  {busy === "clear" ? "Clearing…" : "Confirm clear"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" disabled={!items?.length || busy !== null} onClick={() => setConfirmClear(true)}>
                Clear stored packets
              </button>
            )}
          </>
        }
      />

      {error ? <p className="banner is-error">{error}</p> : null}

      <div className="toolbar">
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor="log-wearer">Wearer</label>
          <select id="log-wearer" value={wearer} onChange={(event) => setWearer(event.target.value)}>
            <option value="all">All wearers</option>
            {crew.map((person) => (
              <option key={person.wearer_id} value={person.wearer_id}>
                {person.wearer_id}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor="log-fall">Fall state</label>
          <select id="log-fall" value={fall} onChange={(event) => setFall(event.target.value as "all" | FallState)}>
            <option value="all">Any state</option>
            {FALL_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>
        <p className="fine" style={{ margin: 0 }}>
          {loading ? "Loading…" : `${rows.length} packet${rows.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {!loading && rows.length === 0 ? <EmptyState title="No packets in this view" body="Adjust the filters, load the sample crew, or wait for the gateway." /> : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Received (PHT)</th>
                <th>Wearer</th>
                <th>Seq</th>
                <th>CO₂</th>
                <th>Heart rate</th>
                <th>Fall</th>
                <th>GPS</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((row) => (
                <tr key={`${row.received_at}-${row.wearer_id}-${row.sequence}`}>
                  <td>{manilaTime(row.received_at)}</td>
                  <td>
                    <Link href={`/crew/${row.wearer_id}`}>{row.wearer_id}</Link>
                  </td>
                  <td>{row.sequence ?? "—"}</td>
                  <td>{fmt(row.scd40.co2_ppm, 0)}</td>
                  <td>{fmt(row.max30102.heart_rate_bpm, 0)}</td>
                  <td>{row.fall.state === "distress" || row.fall.state === "possible" || row.fall.state === "grace" ? <Badge tone="alert">{row.fall.state}</Badge> : row.fall.state}</td>
                  <td>{row.gps.state === "none" ? "—" : row.gps.state === "fix" ? "fix" : "last known"}</td>
                  <td>{row.signature.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {shown < rows.length ? (
        <div className="row-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setShown((count) => count + 20)}>
            Show more
          </button>
          <span className="fine">
            Showing {shown} of {rows.length}
          </span>
        </div>
      ) : null}
    </div>
  );
}
