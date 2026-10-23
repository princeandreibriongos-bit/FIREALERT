"use client";

import { useState, type FormEvent } from "react";
import type { Incident } from "@/lib/incidents";
import type { RouteOption } from "@/lib/routing";
import { STATION } from "@/lib/station";
import { formatDistance, formatDuration } from "@/lib/format";

function RouteSketch({ coordinates }: { coordinates: [number, number][] }) {
  if (coordinates.length < 2) return null;
  const lons = coordinates.map((pair) => pair[0]);
  const lats = coordinates.map((pair) => pair[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const width = 280;
  const height = 120;
  const pad = 10;
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
    <svg className="sketch" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simplified route shape">
      <polyline points={points} />
    </svg>
  );
}

export function IncidentPanel({
  incidents,
  onChange,
}: {
  incidents: Incident[];
  onChange: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routeNote, setRouteNote] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const open = incidents.filter((incident) => incident.status === "open");
  const selected = incidents.find((incident) => incident.id === selectedId) ?? null;

  async function loadRoutes(incident: Incident) {
    if (incident.latitude == null || incident.longitude == null) {
      setRoutes([]);
      setMapUrl(null);
      setRouteError("This incident has no map point yet.");
      setRouteState("error");
      return;
    }
    setRouteState("loading");
    setRouteError(null);
    const query = new URLSearchParams({
      lat: String(incident.latitude),
      lon: String(incident.longitude),
      fromLat: String(STATION.latitude),
      fromLon: String(STATION.longitude),
    });
    try {
      const response = await fetch(`/api/routes?${query}`, { cache: "no-store" });
      const json = (await response.json()) as {
        ok: boolean;
        error?: string;
        note?: string;
        map_url?: string;
        routes?: RouteOption[];
      };
      setMapUrl(json.map_url ?? null);
      if (!response.ok || !json.ok || !json.routes) {
        setRoutes([]);
        setRouteError(json.error ?? "Routing service unavailable");
        setRouteState("error");
        return;
      }
      setRoutes(json.routes);
      setRouteNote(json.note ?? null);
      setRouteState("ready");
    } catch {
      setRouteError("Routing service unavailable");
      setRouteState("error");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!title.trim() || !address.trim()) {
      setFormError("Title and address are required.");
      return;
    }
    const latitude = lat.trim() === "" ? null : Number(lat);
    const longitude = lon.trim() === "" ? null : Number(lon);
    if ((latitude == null) !== (longitude == null) || (latitude != null && !Number.isFinite(latitude)) || (longitude != null && !Number.isFinite(longitude))) {
      setFormError("Enter both latitude and longitude, or leave both empty.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, address, notes, latitude, longitude }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string; incident?: Incident };
      if (!response.ok || !json.ok || !json.incident) {
        setFormError(json.error ?? "Could not save the incident");
        return;
      }
      setTitle("");
      setAddress("");
      setNotes("");
      setLat("");
      setLon("");
      setSelectedId(json.incident.id);
      await onChange();
      await loadRoutes(json.incident);
    } catch {
      setFormError("Could not save the incident");
    } finally {
      setSaving(false);
    }
  }

  async function closeIncident(id: string) {
    await fetch(`/api/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (selectedId === id) {
      setSelectedId(null);
      setRoutes([]);
      setRouteState("idle");
    }
    await onChange();
  }

  return (
    <section className="panel" aria-labelledby="incident-heading">
      <div className="panel-head">
        <h2 id="incident-heading">Incident and routes</h2>
      </div>
      <p className="note">
        Routes start at {STATION.name} ({STATION.address}). {STATION.note} Displayed options are advisory and need confirmation.
      </p>

      {open.length === 0 ? <p className="empty">No open incident.</p> : null}
      <ul className="incident-list">
        {open.map((incident) => (
          <li key={incident.id}>
            <button
              type="button"
              className={`incident-pick ${selected?.id === incident.id ? "selected" : ""}`}
              aria-pressed={selected?.id === incident.id}
              onClick={() => {
                setSelectedId(incident.id);
                void loadRoutes(incident);
              }}
            >
              <strong>{incident.title}</strong>
              <span>{incident.address}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="route-block">
          <p className="kicker">Selected</p>
          <p className="identity-name">{selected.title}</p>
          <p className="note">{selected.notes || "No notes."}</p>
          <div className="row-actions">
            <button type="button" className="quiet" onClick={() => void loadRoutes(selected)} disabled={routeState === "loading"}>
              {routeState === "loading" ? "Loading routes…" : "Refresh routes"}
            </button>
            <button type="button" className="quiet" onClick={() => void closeIncident(selected.id)}>
              Close incident
            </button>
          </div>
          {routeError ? <p className="warn">{routeError}</p> : null}
          {routeNote ? <p className="note">{routeNote}</p> : null}
          {routes[0] ? <RouteSketch coordinates={routes[0].coordinates} /> : null}
          <ol className="route-list">
            {routes.map((route, index) => (
              <li key={`${route.distance_m}-${index}`}>
                Option {index + 1}: {formatDistance(route.distance_m)} · {formatDuration(route.duration_s)}
              </li>
            ))}
          </ol>
          {mapUrl ? (
            <a className="text-link" href={mapUrl} target="_blank" rel="noreferrer">
              Open these directions in OpenStreetMap
            </a>
          ) : null}
        </div>
      ) : null}

      <form className="incident-form" autoComplete="off" noValidate onSubmit={submit}>
        <p className="kicker">New incident</p>
        <label htmlFor="incident-title">Title</label>
        <input id="incident-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
        <label htmlFor="incident-address">Address</label>
        <input
          id="incident-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Ayala Avenue, Makati City"
          required
          maxLength={160}
        />
        <div className="coord-row">
          <div>
            <label htmlFor="incident-lat">Latitude</label>
            <input id="incident-lat" type="text" inputMode="decimal" autoComplete="off" value={lat} onChange={(event) => setLat(event.target.value)} placeholder="optional" />
          </div>
          <div>
            <label htmlFor="incident-lon">Longitude</label>
            <input id="incident-lon" type="text" inputMode="decimal" autoComplete="off" value={lon} onChange={(event) => setLon(event.target.value)} placeholder="optional" />
          </div>
        </div>
        <label htmlFor="incident-notes">Notes</label>
        <textarea id="incident-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} />
        {formError ? <p className="warn">{formError}</p> : null}
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save incident"}
        </button>
      </form>
    </section>
  );
}
