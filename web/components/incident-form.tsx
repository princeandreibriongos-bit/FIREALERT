"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Incident } from "@/lib/incidents";
import { useBoard } from "./board-provider";

function localDateTimeValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function IncidentCreateFields({
  onCreated,
  onCancel,
  autofocus = false,
}: {
  onCreated: (incident: Incident) => void;
  onCancel: () => void;
  autofocus?: boolean;
}) {
  const { refreshIncidents } = useBoard();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [reportedAt, setReportedAt] = useState(localDateTimeValue);
  const [callerName, setCallerName] = useState("");
  const [callerContact, setCallerContact] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!autofocus) return;
    const timer = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [autofocus]);

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
    const reportedIso = reportedAt ? new Date(reportedAt).toISOString() : new Date().toISOString();
    if (Number.isNaN(Date.parse(reportedIso))) {
      setFormError("Enter a valid date and time for the call.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          address,
          notes,
          latitude,
          longitude,
          reported_at: reportedIso,
          caller_name: callerName.trim() || null,
          caller_contact: callerContact.trim() || null,
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string; incident?: Incident };
      if (!response.ok || !json.ok || !json.incident) {
        setFormError(json.error ?? "Could not save the incident");
        return;
      }
      await refreshIncidents();
      onCreated(json.incident);
    } catch {
      setFormError("Could not save the incident");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" autoComplete="off" noValidate onSubmit={submit}>
      <div className="field">
        <label htmlFor="incident-title">Title</label>
        <input
          ref={titleRef}
          id="incident-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={80}
          placeholder="Structure fire, alarm, etc."
        />
      </div>
      <div className="field">
        <label htmlFor="incident-reported-at">Call date & time</label>
        <input
          id="incident-reported-at"
          type="datetime-local"
          value={reportedAt}
          onChange={(event) => setReportedAt(event.target.value)}
          required
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="incident-caller">Caller name</label>
          <input id="incident-caller" value={callerName} onChange={(event) => setCallerName(event.target.value)} maxLength={80} placeholder="Civilian / reporting party" />
        </div>
        <div className="field">
          <label htmlFor="incident-contact">Caller contact</label>
          <input id="incident-contact" value={callerContact} onChange={(event) => setCallerContact(event.target.value)} maxLength={40} placeholder="Optional phone" />
        </div>
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
        <textarea id="incident-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} placeholder="Hazards, access, radio channel…" />
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
      <p className="fine">Created by your signed-in station account. On-site crew use the sample roster until live assignment is wired.</p>
      {formError ? <p className="warn-text">{formError}</p> : null}
      <div className="row-actions modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save incident"}
        </button>
      </div>
    </form>
  );
}
