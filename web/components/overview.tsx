"use client";

import Link from "next/link";
import { gatewayPhase, newestHardware, wearablePhase } from "@/lib/connection";
import { co2Cue, fallNeedsReview, linkState } from "@/lib/telemetry-core";
import { ageLabel, fmt, manilaTime } from "@/lib/format";
import { useBoard } from "./board-provider";
import { Badge, EmptyState, PageHeader } from "./ui";

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
  const air = crew.filter((person) => {
    const cue = co2Cue(person.scd40.co2_ppm, person.scd40.installed);
    return cue === "elevated" || cue === "high";
  });
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
              ? `${hardware.wearer_id} · SCD40 ${hardware.scd40.installed ? "detected" : "not detected"} · BME688 ${hardware.bme688.installed ? "detected" : "not detected"} · CO₂ ${fmt(hardware.scd40.co2_ppm, 0, " ppm")} · BME ${fmt(hardware.bme688.temperature_c, 1, " °C")} · ${ageLabel(hardware.received_at, now)}`
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
                          const cue = co2Cue(person.scd40.co2_ppm, person.scd40.installed);
                          return (
                            <li key={person.wearer_id}>
                              <Link
                                className={`attention-card ${cue === "high" ? "is-alert" : "is-warn"}`}
                                href={`/crew/${person.wearer_id}?tab=environment`}
                              >
                                <strong>
                                  {person.wearer_id} · CO₂ {fmt(person.scd40.co2_ppm, 0, " ppm")}
                                </strong>
                                <span>{cue === "high" ? "High cue — review" : "Elevated indoor-air cue"}</span>
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
                      {row.fall.state}
                      {" · CO₂ "}
                      {fmt(row.scd40.co2_ppm, 0)}
                      {" · BME "}
                      {fmt(row.bme688.temperature_c, 1, " °C")}
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
                            SCD40 {person.scd40.installed ? "detected" : "not detected"} · BME688 {person.bme688.installed ? "detected" : "not detected"} · {fmt(person.bme688.temperature_c, 1, " °C")}
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
