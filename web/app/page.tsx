"use client";

import { useEffect, useState } from "react";
import type { LoggedTelemetry } from "@/lib/telemetry-store";

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

  return (
    <main>
      <h1>FIREALERT</h1>
      <p className="sub">
        Wearable SCD40 telemetry via ESP-NOW gateway. BME688 gas resistance is reserved in
        the payload and stays empty until that sensor is installed.
      </p>
      <p>
        Link:{" "}
        <span className={`status ${live ? "ok" : ""}`}>{live ? "data received" : "waiting"}</span>
        {latest?.gateway ? ` · gateway ${latest.gateway}` : ""}
        {latest?.source_mac ? ` · ${latest.source_mac}` : ""}
      </p>

      <div className="grid">
        <article className="card co2">
          <div className="label">CO₂</div>
          <div className="value">{fmt(latest?.scd40?.co2_ppm, 0, " ppm")}</div>
        </article>
        <article className="card">
          <div className="label">Temperature</div>
          <div className="value">{fmt(latest?.scd40?.temperature_c, 1, " °C")}</div>
        </article>
        <article className="card">
          <div className="label">Humidity</div>
          <div className="value">{fmt(latest?.scd40?.humidity_rh, 1, " %")}</div>
        </article>
        <article className="card">
          <div className="label">BME688 gas</div>
          <div className="value">{fmt(latest?.bme688?.gas_resistance_ohm, 0, " Ω")}</div>
        </article>
      </div>

      <section className="card">
        <div className="label">Recent packets ({data?.count ?? 0})</div>
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
            {(data?.items ?? []).slice(0, 20).map((row) => (
              <tr key={`${row.received_at}-${row.sequence}`}>
                <td>{row.received_at}</td>
                <td>{row.sequence ?? "—"}</td>
                <td>{fmt(row.scd40?.co2_ppm, 0)}</td>
                <td>{fmt(row.scd40?.temperature_c, 1)}</td>
                <td>{fmt(row.scd40?.humidity_rh, 1)}</td>
                <td>{fmt(row.bme688?.gas_resistance_ohm, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
