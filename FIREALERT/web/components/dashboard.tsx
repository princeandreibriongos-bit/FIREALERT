"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fallNeedsReview, latestByWearer, linkState, type NormalizedTelemetry } from "@/lib/telemetry-core";
import type { Incident } from "@/lib/incidents";
import { STATION } from "@/lib/station";
import { ageLabel, fmt, manilaTime } from "@/lib/format";
import { IncidentPanel } from "./incident-panel";
import { Badge } from "./ui";
import { RouterForm } from "./router-form";
import { WearerDetail } from "./wearer-detail";

type TelemetryResponse = { ok: boolean; count: number; items: NormalizedTelemetry[] };

export default function Dashboard() {
  const [items, setItems] = useState<NormalizedTelemetry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  const refreshTelemetry = useCallback(async () => {
    try {
      const response = await fetch("/api/telemetry", { cache: "no-store" });
      if (!response.ok) throw new Error("bad status");
      const json = (await response.json()) as TelemetryResponse;
      setItems(json.items);
      setError(null);
    } catch {
      setError("The board could not reach the telemetry service.");
    }
  }, []);

  const refreshIncidents = useCallback(async () => {
    try {
      const response = await fetch("/api/incidents", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as { incidents: Incident[] };
      setIncidents(json.incidents);
    } catch {
      // Incident list keeps the last copy when the refresh fails.
    }
  }, []);

  useEffect(() => {
    void refreshTelemetry();
    void refreshIncidents();
    const telemetryTimer = setInterval(() => void refreshTelemetry(), 2000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(telemetryTimer);
      clearInterval(clock);
    };
  }, [refreshIncidents, refreshTelemetry]);

  const crew = useMemo(() => latestByWearer(items ?? []), [items]);

  useEffect(() => {
    if (crew.length === 0) return;
    if (!selectedId || !crew.some((person) => person.wearer_id === selectedId)) {
      setSelectedId(crew[0].wearer_id);
    }
  }, [crew, selectedId]);

  const selected = crew.find((person) => person.wearer_id === selectedId) ?? null;
  const alerts = crew.filter((person) => fallNeedsReview(person.fall.state));

  async function loadSample() {
    setBusy("sample");
    try {
      const response = await fetch("/api/demo", { method: "POST" });
      if (!response.ok) setError("Sample crew could not be loaded.");
      await refreshTelemetry();
    } catch {
      setError("Sample crew could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  async function clearPackets() {
    setBusy("clear");
    try {
      await fetch("/api/telemetry", { method: "DELETE" });
      setSelectedId(null);
      await refreshTelemetry();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <a className="skip" href="#crew">
        Skip to crew
      </a>
      <header className="top">
        <div>
          <p className="kicker">{STATION.name}</p>
          <h1>FIREALERT</h1>
          <p className="lede">
            Personnel monitoring supplement for incident command. It does not replace VHF radio, dispatch, or a decision by trained personnel.
          </p>
        </div>
        <dl className="top-stats">
          <div>
            <dt>Crew packets</dt>
            <dd>{items?.length ?? "…"}</dd>
          </div>
          <div>
            <dt>Linked wearables</dt>
            <dd>{items ? crew.length : "…"}</dd>
          </div>
          <div>
            <dt>Needs review</dt>
            <dd>{items ? alerts.length : "…"}</dd>
          </div>
        </dl>
      </header>

      <RouterForm gatewaySsid={items?.find((row) => row.router_ssid)?.router_ssid ?? null} />

      {error ? <p className="banner error">{error}</p> : null}
      {alerts.length > 0 ? (
        <div className="banner alert" role="status">
          {alerts.map((person) => (
            <button key={person.wearer_id} type="button" onClick={() => setSelectedId(person.wearer_id)}>
              {person.wearer_id}: {person.fall.state === "distress" ? "distress alert" : "possible fall"} for review
              {person.simulated ? " (simulated)" : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="board">
        <aside className="rail" id="crew" aria-label="Crew">
          <div className="rail-head">
            <h2>Crew</h2>
            <div className="row-actions">
              <button type="button" className="primary" onClick={() => void loadSample()} disabled={busy !== null}>
                {busy === "sample" ? "Loading…" : "Load sample crew"}
              </button>
              <button type="button" className="quiet" onClick={() => void clearPackets()} disabled={busy !== null || !items?.length}>
                Clear packets
              </button>
            </div>
          </div>
          {items === null && !error ? <p className="empty">Loading the crew link…</p> : null}
          {items && crew.length === 0 ? (
            <p className="empty">No wearable linked. SCD40 is the only live sensor in this firmware build.</p>
          ) : null}
          <ul className="crew-list">
            {crew.map((person) => {
              const link = linkState(person.received_at, now);
              return (
                <li key={person.wearer_id}>
                  <button
                    type="button"
                    className={`crew-card ${selectedId === person.wearer_id ? "selected" : ""}`}
                    aria-pressed={selectedId === person.wearer_id}
                    onClick={() => setSelectedId(person.wearer_id)}
                  >
                    <span className="crew-id">{person.wearer_id}</span>
                    <span className="badge-row">
                      {fallNeedsReview(person.fall.state) ? <Badge tone="alert">{person.fall.state}</Badge> : <Badge tone="wait">{person.fall.state}</Badge>}
                      <Badge tone={link === "live" ? "live" : "caution"}>{link === "live" ? "Link live" : "Link stale"}</Badge>
                      {person.simulated ? <Badge tone="sim">Simulated</Badge> : null}
                    </span>
                    <span className="crew-meta">
                      CO₂ {fmt(person.scd40.co2_ppm, 0, " ppm")} · {ageLabel(person.received_at, now)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main>
          <WearerDetail packet={selected} now={now} loading={items === null && !error} />
        </main>

        <IncidentPanel incidents={incidents} onChange={refreshIncidents} />
      </div>

      <section className="panel log" aria-labelledby="log-heading">
        <div className="panel-head">
          <h2 id="log-heading">Recent packets</h2>
        </div>
        {items && items.length === 0 ? <p className="empty">No packets yet.</p> : null}
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
              {(items ?? []).slice(0, 12).map((row) => (
                <tr key={`${row.received_at}-${row.wearer_id}-${row.sequence}`}>
                  <td>{manilaTime(row.received_at)}</td>
                  <td>{row.wearer_id}</td>
                  <td>{row.sequence ?? "—"}</td>
                  <td>{fmt(row.scd40.co2_ppm, 0)}</td>
                  <td>{fmt(row.max30102.heart_rate_bpm, 0)}</td>
                  <td>{row.fall.state}</td>
                  <td>{row.gps.state === "none" ? "—" : row.gps.state === "fix" ? "fix" : "last known"}</td>
                  <td>{row.signature.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="limits-heading">
        <div className="panel-head">
          <h2 id="limits-heading">Prototype limits</h2>
        </div>
        <ul className="limits">
          <li>Not protective equipment, and not a substitute for SCBA, radio, or certified gas instruments.</li>
          <li>No indoor positioning. GPS is reported only with a satellite fix. Last known is labeled and is not current.</li>
          <li>ESP-NOW is one wearable-to-gateway hop, not an automatic mesh. The cellular modem is not installed; Wi-Fi is the stand-in uplink.</li>
          <li>Fall detection is a grace-period state machine. The TinyML model slot is empty, so motion alone will not raise a cue.</li>
          <li>ISO/IEC 25010 evaluation with station users has not been run. No scores are shown.</li>
        </ul>
      </section>
    </>
  );
}
