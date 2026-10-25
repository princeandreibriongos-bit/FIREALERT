"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDistance, formatDuration, fmt, manilaTime } from "@/lib/format";
import type { RouteOption } from "@/lib/routing";
import { STATION } from "@/lib/station";
import { useBoard } from "./board-provider";
import { Badge, EmptyState } from "./ui";

function RouteSketch({ coordinates }: { coordinates: [number, number][] }) {
  if (coordinates.length < 2) return null;
  const lons = coordinates.map((pair) => pair[0]);
  const lats = coordinates.map((pair) => pair[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const width = 640;
  const height = 160;
  const pad = 16;
  const dx = maxLon - minLon || 0.001;
  const dy = maxLat - minLat || 0.001;
  const points = coordinates
    .map(([lon, lat]) => {
      const x = pad + ((lon - minLon) / dx) * (width - pad * 2);
      const y = pad + ((maxLat - lat) / dy) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="route-sketch" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simplified route shape">
      <polyline points={points} />
    </svg>
  );
}

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const { incidents, incidentsReady, refreshIncidents } = useBoard();
  const incident = incidents.find((item) => item.id === incidentId) ?? null;
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routeNote, setRouteNote] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [statusBusy, setStatusBusy] = useState(false);

  async function loadRoutes(latitude: number, longitude: number, signal?: AbortSignal) {
    setRouteState("loading");
    setRouteError(null);
    setRouteNote(null);
    const query = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      fromLat: String(STATION.latitude),
      fromLon: String(STATION.longitude),
    });
    try {
      const response = await fetch(`/api/routes?${query}`, { cache: "no-store", signal });
      const json = (await response.json()) as {
        ok: boolean;
        error?: string;
        note?: string;
        map_url?: string;
        routes?: RouteOption[];
      };
      if (signal?.aborted) return;
      setMapUrl(json.map_url ?? null);
      if (!response.ok || !json.ok || !json.routes) {
        setRoutes([]);
        setRouteNote(null);
        setRouteError(json.error ?? "Routing service unavailable");
        setRouteState("error");
        return;
      }
      setRoutes(json.routes);
      setRouteNote(json.note ?? null);
      setRouteError(null);
      setRouteState("ready");
    } catch {
      if (signal?.aborted) return;
      setRoutes([]);
      setRouteNote(null);
      setRouteError("Routing service unavailable");
      setRouteState("error");
    }
  }

  useEffect(() => {
    if (!incident || incident.latitude == null || incident.longitude == null) return;
    const controller = new AbortController();
    void loadRoutes(incident.latitude, incident.longitude, controller.signal);
    return () => controller.abort();
  }, [incident?.id, incident?.latitude, incident?.longitude]);

  async function setStatus(status: "open" | "closed") {
    if (!incident) return;
    setStatusBusy(true);
    try {
      await fetch(`/api/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await refreshIncidents();
    } finally {
      setStatusBusy(false);
    }
  }

  if (!incident) {
    return (
      <div className="page">
        <Link className="back-link" href="/incidents">
          ← Incidents
        </Link>
        <EmptyState
          title={incidentsReady ? "Incident not on this board" : "Loading incident…"}
          body={incidentsReady ? "It may have been cleared when the server restarted." : "Checking the incident list."}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <Link className="back-link" href="/incidents">
        ← Incidents
      </Link>
      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Incident</p>
              <h1 className="card-title" style={{ fontSize: "1.6rem", marginTop: 6 }}>
                {incident.title}
              </h1>
            </div>
            <Badge tone={incident.status === "open" ? "brand" : "wait"}>{incident.status}</Badge>
          </div>
          <p className="fine" style={{ marginTop: 0 }}>
            {incident.address}
          </p>
          <p className="fine">{incident.notes || "No notes."}</p>
          <div className="metrics">
            <div className="metric">
              <p className="metric-label">Logged</p>
              <p className="metric-value" style={{ fontSize: "0.95rem" }}>
                {manilaTime(incident.created_at)}
              </p>
              <p className="metric-detail">Philippine time</p>
            </div>
            <div className="metric">
              <p className="metric-label">Map point</p>
              <p className="metric-value" style={{ fontSize: "0.95rem" }}>
                {incident.latitude == null ? "—" : `${fmt(incident.latitude, 5)}, ${fmt(incident.longitude, 5)}`}
              </p>
            </div>
          </div>
          <div className="row-actions" style={{ marginTop: 16 }}>
            {incident.status === "open" ? (
              <button type="button" className="btn btn-danger" onClick={() => void setStatus("closed")} disabled={statusBusy}>
                Close incident
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void setStatus("open")} disabled={statusBusy}>
                Reopen incident
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Advisory routes</h2>
              <p className="card-note">
                From {STATION.name}. {STATION.note}
              </p>
            </div>
          </div>
          {incident.latitude == null || incident.longitude == null ? <p className="warn-text">This incident has no map point yet.</p> : null}
          {routeState === "loading" ? <p className="fine">Requesting driving options…</p> : null}
          {routeError ? <p className="warn-text">{routeError}</p> : null}
          {routeNote ? <p className="fine">{routeNote}</p> : null}
          {routes[0] ? <RouteSketch coordinates={routes[0].coordinates} /> : null}
          <ol className="route-options">
            {routes.map((route, index) => (
              <li key={`${route.distance_m}-${index}`}>
                <span className="route-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>
                    {formatDistance(route.distance_m)} · {formatDuration(route.duration_s)}
                  </strong>
                  <p className="fine">Advisory driving option. Not a dispatch order.</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="row-actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={routeState === "loading" || incident.latitude == null || incident.longitude == null}
              onClick={() => incident.latitude != null && incident.longitude != null && void loadRoutes(incident.latitude, incident.longitude)}
            >
              Refresh routes
            </button>
            {mapUrl ? (
              <a className="btn btn-ghost" href={mapUrl} target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
