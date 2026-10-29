"use client";

import Link from "next/link";
import { gatewayPhase, newestHardware, wearablePhase } from "@/lib/connection";
import { airNeedsAttention, airReading, fallNeedsReview, linkState } from "@/lib/telemetry-core";
import { ageLabel, fmt, manilaTime, vecMagnitude } from "@/lib/format";
import { useBoard } from "./board-provider";
import { Badge, EmptyState, PageHeader } from "./ui";

function readingLine(row: {
  scd40: { co2_ppm: number | null; temperature_c: number | null; humidity_rh: number | null };
  bme688: { temperature_c: number | null; humidity_rh: number | null; pressure_hpa: number | null; gas_resistance_ohm: number | null };
  mpu6050: { accel_g: { x: number | null; y: number | null; z: number | null } | null };
  mq6: { raw: number | null };
}) {
  const gravity = vecMagnitude(row.mpu6050.accel_g);
  return `CO₂ ${fmt(row.scd40.co2_ppm, 0, " ppm")} · SCD ${fmt(row.scd40.temperature_c, 1, " °C")} ${fmt(row.scd40.humidity_rh, 0, "%")} · BME ${fmt(row.bme688.temperature_c, 1, " °C")} ${fmt(row.bme688.humidity_rh, 0, "%")} ${fmt(row.bme688.pressure_hpa, 0, " hPa")} · gas ${fmt(row.bme688.gas_resistance_ohm, 0, " Ω")} · gyro ${fmt(gravity, 2, " g")} · MQ-6 ${fmt(row.mq6.raw, 0)}`;
}

function fallLabel(state: string) {
  if (state === "distress") return "Distress alert";
  if (state === "grace") return "Cancel window open";
  if (state === "possible") return "Possible fall";
  return state;
}

export function Overview() {
  const { items, error, crew, alerts, incidents, gateway, now, busy, loadSample } = useBoard();
  const live = crew.filter((person) => linkState(person.received_at, now) === "live").length;
  const stale = crew.filter((person) => linkState(person.received_at, now) !== "live");
  const air = crew.filter((person) => airNeedsAttention(airReading(person, items ?? []).kind));
  const open = incidents.filter((incident) => incident.status === "open");
  const simulated = crew.some((person) => person.simulated);
  const recent = (items ?? []).slice(0, 6);
  const ranked = [...crew].sort((a, b) => {
    const score = (person: (typeof crew)[number]) =>
      fallNeedsReview(person.fall.state) ? 0 : linkState(person.received_at, now) === "live" ? 1 : 2;
    return score(a) - score(b) || a.wearer_id.localeCompare(b.wearer_id);
  });
  const loading = items === null && !error;
  const hardware = newestHardware(crew);
  const gatewayState = gatewayPhase(gateway, now);
  const wearableState = wearablePhase(crew, now);
  const linkReady = gatewayState === "up" && wearableState === "live";

  return (
    <div className="page">
      <PageHeader
        eyebrow="Command"
        title="Overview"
        description="A snapshot of linked wearables, cues that need a person, and open incidents. Detail lives on its own screen."
      />

      {error ? <p className="banner is-error">{error}</p> : null}
      <section className={`link-banner is-${linkReady ? "live" : wearableState === "stale" || gatewayState === "down" ? "wait" : "idle"}`} aria-live="polite">
        <div>
          <p className="eyebrow">Hardware link</p>
          <h2>
            {linkReady
              ? "Connection established"
              : gatewayState === "up"
                ? "Gateway is on Wi-Fi. Waiting for the wearable."
                : wearableState === "live"
                  ? "Wearable packets are arriving."
                  : "Waiting for a live link"}
          </h2>
          <p className="card-note">
            {hardware
              ? `${hardware.wearer_id} · ${readingLine(hardware)} · ${ageLabel(hardware.received_at, now)}`
              : "No wearable packet yet. Sample crew does not count as a live connection."}
          </p>
        </div>
        <dl className="link-facts">
          <div>
            <dt>Gateway</dt>
            <dd>{gatewayState === "up" ? "Wi-Fi up" : gatewayState === "down" ? "Wi-Fi down" : "Waiting"}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{gateway?.ip && gatewayState !== "waiting" ? gateway.ip : "—"}</dd>
          </div>
          <div>
            <dt>Channel</dt>
            <dd>{gateway?.channel != null && gatewayState !== "waiting" ? gateway.channel : "—"}</dd>
          </div>
        </dl>
      </section>
      {hardware ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Live readings</h2>
            <Link className="btn btn-ghost" href="/sensors">
              All sensors
            </Link>
          </div>
          <div className="metrics">
            <Link className="metric" href="/sensors?sensor=scd40">
              <p className="metric-label">SCD40 CO₂</p>
              <p className="metric-value">{fmt(hardware.scd40.co2_ppm, 0, " ppm")}</p>
              <p className="metric-detail">
                {fmt(hardware.scd40.temperature_c, 1, " °C")} · {fmt(hardware.scd40.humidity_rh, 0, "% RH")}
              </p>
            </Link>
            <Link className="metric" href="/sensors?sensor=bme688">
              <p className="metric-label">BME688 air</p>
              <p className="metric-value">{fmt(hardware.bme688.temperature_c, 1, " °C")}</p>
              <p className="metric-detail">
                {fmt(hardware.bme688.humidity_rh, 0, "% RH")} · {fmt(hardware.bme688.pressure_hpa, 0, " hPa")} · {fmt(hardware.bme688.gas_resistance_ohm, 0, " Ω")}
              </p>
            </Link>
            <Link className="metric" href="/sensors?sensor=mpu6050">
              <p className="metric-label">MPU-6050</p>
              <p className="metric-value">{fmt(vecMagnitude(hardware.mpu6050.accel_g), 2, " g")}</p>
              <p className="metric-detail">Total acceleration. About 1 g when the sensor is still.</p>
            </Link>
            <Link className="metric" href="/sensors?sensor=mq6">
              <p className="metric-label">MQ-6</p>
              <p className="metric-value">{fmt(hardware.mq6.raw, 0)}</p>
              <p className="metric-detail">Relative count, 0–4095. Not a gas percentage.</p>
            </Link>
          </div>
        </section>
      ) : null}
      {simulated ? (
        <p className="banner is-sim">Sample crew is on the board. These packets are simulated and are not a live wearable.</p>
      ) : null}

      <div className="kpi-grid">
        <Link className="kpi" href="/crew">
          <p className="metric-label">Linked</p>
          <p className="kpi-value">{loading ? "—" : crew.length}</p>
        </Link>
        <Link className="kpi" href="/crew?filter=live">
          <p className="metric-label">Live links</p>
          <p className="kpi-value">{loading ? "—" : live}</p>
        </Link>
        <Link className={`kpi${alerts.length ? " is-alert" : ""}`} href="/crew?filter=review">
          <p className="metric-label">Needs review</p>
          <p className="kpi-value">{loading ? "—" : alerts.length}</p>
        </Link>
        <Link className="kpi" href="/incidents">
          <p className="metric-label">Open incidents</p>
          <p className="kpi-value">{open.length}</p>
        </Link>
      </div>

      {loading ? <p className="fine">Connecting to telemetry…</p> : null}

      {!loading && crew.length === 0 ? (
        <EmptyState
          title="No wearables linked"
          body="Load the sample crew to review the layout, or wait for the field gateway to post a packet."
          action={
            <button type="button" className="btn btn-primary" onClick={() => void loadSample()} disabled={busy !== null}>
              {busy === "sample" ? "Loading…" : "Load sample crew"}
            </button>
          }
        />
      ) : null}

      {!loading && crew.length > 0 ? (
        <div className="split">
          <div className="stack">
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">Needs a person</h2>
                <Link className="btn btn-ghost" href="/crew?filter=review">
                  Open crew
                </Link>
              </div>
              {alerts.length === 0 && air.length === 0 && stale.length === 0 ? (
                <div className="callout is-ok">
                  <p>No fall cues, elevated CO₂, or stale links right now.</p>
                </div>
              ) : (
                <div className="stack">
                  {alerts.length > 0 ? (
                    <div>
                      <p className="section-label">Fall review</p>
                      <ul className="attention-list">
                        {alerts.map((person) => (
                          <li key={person.wearer_id}>
                            <Link className="attention-card is-alert" href={`/crew/${person.wearer_id}?tab=motion`}>
                              <strong>
                                {person.wearer_id} · {fallLabel(person.fall.state)}
                              </strong>
                              <span>
                                {ageLabel(person.received_at, now)}
                                {person.simulated ? " · simulated" : ""}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {air.length > 0 ? (
                    <div>
                      <p className="section-label">Air cue</p>
                      <ul className="attention-list">
                        {air.map((person) => {
                          const reading = airReading(person, items ?? []);
                          return (
                            <li key={person.wearer_id}>
                              <Link
                                className={`attention-card ${reading.tone === "alert" ? "is-alert" : "is-warn"}`}
                                href={`/crew/${person.wearer_id}?tab=environment`}
                              >
                                <strong>
                                  {person.wearer_id} · {reading.title}
                                </strong>
                                <span>{reading.detail}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {stale.length > 0 ? (
                    <div>
                      <p className="section-label">Stale links</p>
                      <ul className="attention-list">
                        {stale.map((person) => (
                          <li key={person.wearer_id}>
                            <Link className="attention-card is-warn" href={`/crew/${person.wearer_id}?tab=device`}>
                              <strong>{person.wearer_id}</strong>
                              <span>Last packet {ageLabel(person.received_at, now)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="card-title">Recent packets</h2>
                <Link className="btn btn-ghost" href="/log">
                  Packet log
                </Link>
              </div>
              <ul className="timeline">
                {recent.map((row) => (
                  <li key={`${row.received_at}-${row.wearer_id}-${row.sequence}`}>
                    <time dateTime={row.received_at}>{manilaTime(row.received_at)}</time>
                    <span>
                      <Link href={`/crew/${row.wearer_id}`}>{row.wearer_id}</Link>
                      {" · "}
                      {readingLine(row)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="stack">
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">Open incidents</h2>
                <Link className="btn btn-ghost" href="/incidents/new">
                  Log incident
                </Link>
              </div>
              {open.length === 0 ? <p className="fine">No open incidents.</p> : null}
              <ul className="mini-list">
                {open.slice(0, 4).map((incident) => (
                  <li key={incident.id}>
                    <Link className="mini-row" href={`/incidents/${incident.id}`}>
                      <strong>{incident.title}</strong>
                      <span>{incident.address}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="card-title">Crew snapshot</h2>
                <Link className="btn btn-ghost" href="/crew">
                  Roster
                </Link>
              </div>
              <ul className="mini-list">
                {ranked.slice(0, 4).map((person) => {
                  const link = linkState(person.received_at, now);
                  return (
                    <li key={person.wearer_id}>
                      <Link className="mini-row" href={`/crew/${person.wearer_id}`}>
                        <strong>
                          {person.wearer_id}
                          <span className="fine">
                            {readingLine(person)}
                          </span>
                        </strong>
                        <span>
                          {fallNeedsReview(person.fall.state) ? (
                            <Badge tone="alert">{person.fall.state}</Badge>
                          ) : (
                            <Badge tone={link === "live" ? "live" : "caution"}>{link === "live" ? "Live" : "Stale"}</Badge>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
