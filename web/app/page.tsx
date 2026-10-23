"use client";

import { useEffect, useState } from "react";
import type { LoggedTelemetry } from "@/lib/telemetry-store";
import Reveal from "./components/Reveal";

type TelemetryResponse = {
  ok: boolean;
  count: number;
  latest: LoggedTelemetry | null;
  items: LoggedTelemetry[];
};

function fmt(value: number | null | undefined, digits = 1, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function formatReceived(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function DashboardPage() {
  const [data, setData] = useState<TelemetryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/telemetry", { cache: "no-store" });
        const json = (await res.json()) as TelemetryResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setData(null);
        }
      }
    }

    refresh();
    const id = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const latest = data?.latest ?? null;
  const live = Boolean(latest);
  const items = data?.items ?? [];

  return (
    <main className="page">
      <Reveal>
        <section className="hero" aria-labelledby="hero-title">
          <p className="hero__eyebrow">Wearable · ESP-NOW · SCD40</p>
          <h1 id="hero-title" className="hero__title">
            Fire<em>Alert</em>
          </h1>
          <p className="hero__lede">
            Live field telemetry from the firefighter wearable gateway. CO₂, temperature, and
            humidity stream in as packets arrive; BME688 gas stays reserved until that sensor is
            fitted.
          </p>
          <div className="link-row">
            <span className={`status-pill ${live ? "is-live" : ""}`}>
              <span className={`status-dot ${live ? "is-live" : ""}`} aria-hidden="true" />
              {live ? "Link live" : "Waiting for data"}
            </span>
            {latest?.gateway ? <span className="meta-chip">gateway {latest.gateway}</span> : null}
            {latest?.source_mac ? <span className="meta-chip">{latest.source_mac}</span> : null}
          </div>
        </section>
      </Reveal>

      <Reveal delayClass="reveal-delay-1">
        <section className="section" aria-labelledby="metrics-title">
          <div className="section__head">
            <h2 id="metrics-title" className="section__title">
              Live readings
            </h2>
            <span className="section__aside">Refreshes every 2s</span>
          </div>
          <div className="metrics">
            <article className="metric metric--co2">
              <div className="metric__label">CO₂</div>
              <div className="metric__value">{fmt(latest?.scd40?.co2_ppm, 0, " ppm")}</div>
            </article>
            <article className="metric">
              <div className="metric__label">Temperature</div>
              <div className="metric__value">{fmt(latest?.scd40?.temperature_c, 1, " °C")}</div>
            </article>
            <article className="metric">
              <div className="metric__label">Humidity</div>
              <div className="metric__value">{fmt(latest?.scd40?.humidity_rh, 1, " %")}</div>
            </article>
            <article className="metric">
              <div className="metric__label">BME688 gas</div>
              <div className="metric__value">{fmt(latest?.bme688?.gas_resistance_ohm, 0, " Ω")}</div>
            </article>
          </div>
        </section>
      </Reveal>

      <Reveal delayClass="reveal-delay-2">
        <section className="section" aria-labelledby="packets-title">
          <div className="section__head">
            <h2 id="packets-title" className="section__title">
              Recent packets
            </h2>
            <span className="section__aside">{data?.count ?? 0} logged</span>
          </div>
          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Seq</th>
                    <th>CO₂</th>
                    <th>Temp</th>
                    <th>RH</th>
                    <th>Gas Ω</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">
                        No packets yet — POST to /api/telemetry or run the serial bridge.
                      </td>
                    </tr>
                  ) : (
                    items.slice(0, 20).map((row) => (
                      <tr key={`${row.received_at}-${row.sequence}`}>
                        <td>{formatReceived(row.received_at)}</td>
                        <td>{row.sequence ?? "—"}</td>
                        <td>{fmt(row.scd40?.co2_ppm, 0)}</td>
                        <td>{fmt(row.scd40?.temperature_c, 1)}</td>
                        <td>{fmt(row.scd40?.humidity_rh, 1)}</td>
                        <td>{fmt(row.bme688?.gas_resistance_ohm, 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </Reveal>

      <p className="footer-note">
        FireAlert keeps wearable SCD40 readings in memory for this session. Gas resistance stays
        empty until the BME688 is installed.
      </p>
    </main>
  );
}
