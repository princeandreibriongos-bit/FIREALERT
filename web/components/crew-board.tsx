"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ageLabel, fmt } from "@/lib/format";
import { airReading, co2Cue, fallNeedsReview, linkState, type NormalizedTelemetry } from "@/lib/telemetry-core";
import { useBoard } from "./board-provider";
import { Icon } from "./icons";
import { Badge, EmptyState, PageHeader, SensorStatus } from "./ui";

type Filter = "all" | "review" | "live" | "stale";

function toneOf(person: NormalizedTelemetry, now: number): "alert" | "stale" | "live" {
  if (fallNeedsReview(person.fall.state)) return "alert";
  if (linkState(person.received_at, now) !== "live") return "stale";
  return "live";
}

function rank(person: NormalizedTelemetry, now: number) {
  if (person.fall.state === "distress") return 0;
  if (person.fall.state === "grace") return 1;
  if (person.fall.state === "possible") return 2;
  if (linkState(person.received_at, now) !== "live") return 4;
  return 3;
}

export function CrewBoard() {
  const params = useSearchParams();
  const router = useRouter();
  const { items, error, crew, now, busy, loadSample } = useBoard();
  const [query, setQuery] = useState("");
  const raw = params.get("filter");
  const filter: Filter = raw === "review" || raw === "live" || raw === "stale" ? raw : "all";

  function setFilter(next: Filter) {
    router.replace(next === "all" ? "/crew" : `/crew?filter=${next}`, { scroll: false });
  }

  const counts = useMemo(() => {
    return {
      all: crew.length,
      review: crew.filter((person) => fallNeedsReview(person.fall.state)).length,
      live: crew.filter((person) => linkState(person.received_at, now) === "live").length,
      stale: crew.filter((person) => linkState(person.received_at, now) !== "live").length,
    };
  }, [crew, now]);

  const visible = crew
    .filter((person) => person.wearer_id.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((person) => {
      if (filter === "review") return fallNeedsReview(person.fall.state);
      if (filter === "live") return linkState(person.received_at, now) === "live";
      if (filter === "stale") return linkState(person.received_at, now) !== "live";
      return true;
    })
    .sort((a, b) => rank(a, now) - rank(b, now) || a.wearer_id.localeCompare(b.wearer_id));

  const loading = items === null && !error;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Monitoring"
        title="Crew"
        description="One card per linked wearable. Open a person for physiology, air, motion, and location."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void loadSample()} disabled={busy !== null}>
            {busy === "sample" ? "Loading…" : "Load sample crew"}
          </button>
        }
      />

      {error ? <p className="banner is-error">{error}</p> : null}

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search wearer</span>
          <Icon name="search" size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wearer id" />
        </label>
        <div className="chips" role="group" aria-label="Filter crew">
          {(
            [
              ["all", "All"],
              ["review", "Review"],
              ["live", "Live"],
              ["stale", "Stale"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label} {counts[id]}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="fine">Connecting to telemetry…</p> : null}
      {!loading && crew.length === 0 ? (
        <EmptyState title="Roster is empty" body="No wearable has checked in. Load the sample crew or connect the gateway." />
      ) : null}
      {!loading && crew.length > 0 && visible.length === 0 ? (
        <EmptyState title="No matching wearables" body="Try another filter or clear the search." />
      ) : null}

      <div className="person-grid">
        {visible.map((person) => {
          const link = linkState(person.received_at, now);
          const cue = co2Cue(person.scd40.co2_ppm, person.scd40.installed);
          const air = airReading(person, items ?? []);
          return (
            <Link key={person.wearer_id} href={`/crew/${person.wearer_id}`} className="person-card" data-tone={toneOf(person, now)}>
              <div className="person-top">
                <span className="person-id">{person.wearer_id}</span>
                <span className="badge-row">
                  {fallNeedsReview(person.fall.state) ? <Badge tone="alert">{person.fall.state}</Badge> : null}
                  <Badge tone={link === "live" ? "live" : "caution"} pulse={link === "live"}>
                    {link === "live" ? "Live" : "Stale"}
                  </Badge>
                </span>
              </div>
              {person.simulated ? <Badge tone="sim">Simulated</Badge> : null}
              <SensorStatus
                scd40={person.scd40.installed}
                bme688={person.bme688.installed}
                mpu6050={person.mpu6050.installed}
                mq6={person.mq6.installed}
              />
              <div className="stat-line">
                <span>
                  CO₂ <b>{fmt(person.scd40.co2_ppm, 0)}</b>
                  {cue === "high" || cue === "elevated" ? ` · ${cue}` : ""}
                </span>
                <span>
                  HR <b>{fmt(person.max30102.heart_rate_bpm, 0)}</b>
                </span>
              </div>
              <p className="fine">{air.title}</p>
              <dl className="bme-grid">
                <div>
                  <dt>BME temp</dt>
                  <dd>{fmt(person.bme688.temperature_c, 1, " °C")}</dd>
                </div>
                <div>
                  <dt>BME humidity</dt>
                  <dd>{fmt(person.bme688.humidity_rh, 0, "%")}</dd>
                </div>
                <div>
                  <dt>Pressure</dt>
                  <dd>{fmt(person.bme688.pressure_hpa, 0, " hPa")}</dd>
                </div>
                <div>
                  <dt>Gas</dt>
                  <dd>{fmt(person.bme688.gas_resistance_ohm, 0, " Ω")}</dd>
                </div>
                <div>
                  <dt>MPU-6050</dt>
                  <dd>{person.mpu6050.installed ? "detected" : "—"}</dd>
                </div>
                <div>
                  <dt>MQ-6</dt>
                  <dd>{person.mq6.installed ? fmt(person.mq6.raw, 0) : "—"}</dd>
                </div>
              </dl>
              <p className="person-meta">{ageLabel(person.received_at, now)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
