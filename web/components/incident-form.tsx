"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Incident } from "@/lib/incidents";
import { useBoard } from "./board-provider";
import { PageHeader } from "./ui";

export function IncidentForm() {
  const router = useRouter();
  const { refreshIncidents } = useBoard();
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      await refreshIncidents();
      router.push(`/incidents/${json.incident.id}`);
    } catch {
      setFormError("Could not save the incident");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <Link className="back-link" href="/incidents">
        ← Incidents
      </Link>
      <PageHeader
        eyebrow="Dispatch"
        title="New incident"
        description="Leave coordinates empty and the board will geocode the address. A failed lookup asks you to enter a map point."
      />
      <section className="card" style={{ maxWidth: 720 }}>
        <form className="form" autoComplete="off" noValidate onSubmit={submit}>
          <div className="field">
            <label htmlFor="incident-title">Title</label>
            <input id="incident-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
          </div>
          <div className="field">
            <label htmlFor="incident-address">Address</label>
            <input
              id="incident-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Ayala Avenue, Makati City"
              required
              maxLength={160}
            />
          </div>
          <div className="field">
            <label htmlFor="incident-notes">Notes</label>
            <textarea id="incident-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={4} />
          </div>
          <details className="disclosure">
            <summary>Coordinates, if you already have them</summary>
            <div className="field-row">
              <div className="field">
                <label htmlFor="incident-lat">Latitude</label>
                <input id="incident-lat" inputMode="decimal" autoComplete="off" value={lat} onChange={(event) => setLat(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="incident-lon">Longitude</label>
                <input id="incident-lon" inputMode="decimal" autoComplete="off" value={lon} onChange={(event) => setLon(event.target.value)} />
              </div>
            </div>
          </details>
          {formError ? <p className="warn-text">{formError}</p> : null}
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save incident"}
            </button>
            <Link className="btn btn-ghost" href="/incidents">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
