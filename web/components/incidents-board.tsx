"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { manilaTime } from "@/lib/format";
import { useBoard } from "./board-provider";
import { Icon } from "./icons";
import { Badge, EmptyState, PageHeader } from "./ui";

export function IncidentsBoard() {
  const { incidents, incidentsReady } = useBoard();
  const [mode, setMode] = useState<"open" | "closed">("open");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      open: incidents.filter((incident) => incident.status === "open").length,
      closed: incidents.filter((incident) => incident.status === "closed").length,
    }),
    [incidents],
  );

  const visible = incidents.filter((incident) => {
    if (incident.status !== mode) return false;
    const haystack = `${incident.title} ${incident.address}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="Dispatch"
        title="Incidents"
        description="Log an address, then open it for advisory driving options from the station. Routes do not choose a tactic."
        actions={
          <Link className="btn btn-primary" href="/incidents/new">
            New incident
          </Link>
        }
      />

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Search incidents</span>
          <Icon name="search" size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or address" />
        </label>
        <div className="chips" role="group" aria-label="Incident status">
          <button type="button" className="chip" aria-pressed={mode === "open"} onClick={() => setMode("open")}>
            Open {counts.open}
          </button>
          <button type="button" className="chip" aria-pressed={mode === "closed"} onClick={() => setMode("closed")}>
            Closed {counts.closed}
          </button>
        </div>
      </div>

      {!incidentsReady ? <p className="fine">Loading incidents…</p> : null}
      {incidentsReady && visible.length === 0 ? (
        <EmptyState
          title={mode === "open" ? "No open incidents" : "No closed incidents"}
          body={mode === "open" ? "Create one when an address needs a route from the station." : "Closed incidents stay here for reference."}
          action={
            mode === "open" ? (
              <Link className="btn btn-primary" href="/incidents/new">
                New incident
              </Link>
            ) : undefined
          }
        />
      ) : null}

      <div className="incident-grid">
        {visible.map((incident) => (
          <Link key={incident.id} href={`/incidents/${incident.id}`} className="incident-card" data-tone={incident.status}>
            <div className="incident-top">
              <strong>{incident.title}</strong>
              <Badge tone={incident.status === "open" ? "brand" : "wait"}>{incident.status}</Badge>
            </div>
            <span>{incident.address}</span>
            <p className="person-meta">{manilaTime(incident.created_at)} PHT</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
