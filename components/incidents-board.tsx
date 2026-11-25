"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { manilaTime } from "@/lib/format";
import { incidentPhase, type Incident, type IncidentPhase } from "@/lib/incidents";
import { STATION } from "@/lib/station";
import { useBoard } from "./board-provider";
import { Icon } from "./icons";
import { IncidentCreateModal } from "./incident-create-modal";
import { useAccount } from "./use-account";
import { Badge, EmptyState, Metric, PageHeader } from "./ui";

type DeskTab = "overview" | "active" | "reported" | "responding" | "closed";

const COMMEL_TABS: { id: DeskTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "active", label: "Active incidents" },
  { id: "closed", label: "Closed incidents" },
];

const RESPONDER_TABS: { id: DeskTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "reported", label: "Reported" },
  { id: "responding", label: "Responding" },
  { id: "closed", label: "Closed" },
];

function parseTab(value: string | null, responder: boolean): DeskTab {
  if (responder) {
    if (value === "reported" || value === "responding" || value === "closed" || value === "overview") return value;
    if (value === "active") return "reported";
    return "overview";
  }
  if (value === "active" || value === "closed" || value === "overview") return value;
  if (value === "reported" || value === "responding") return "active";
  return "overview";
}

function manilaDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function matches(incident: Incident, tab: DeskTab): boolean {
  const phase = incidentPhase(incident);
  if (tab === "closed") return phase === "closed";
  if (tab === "reported") return phase === "reported";
  if (tab === "responding") return phase === "responding";
  if (tab === "active") return phase !== "closed";
  return false;
}

function IncidentsBoardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { incidents, incidentsReady, refreshIncidents } = useBoard();
  const { role, ready: accountReady } = useAccount();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const responderView = role === "responder" || role === "admin";
  const tab = parseTab(searchParams.get("tab"), responderView);
  const canLog = role === "commel" || role === "admin";

  useEffect(() => {
    if (searchParams.get("new") === "1" && canLog) setCreateOpen(true);
  }, [searchParams, canLog]);

  function closeCreate() {
    setCreateOpen(false);
    if (searchParams.get("new") === "1") {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("new");
      const queryString = next.toString();
      router.replace(queryString ? `/incidents?${queryString}` : "/incidents");
    }
  }

  const counts = useMemo(() => {
    const today = manilaDayKey(new Date().toISOString());
    const reported = incidents.filter((incident) => incidentPhase(incident) === "reported");
    const responding = incidents.filter((incident) => incidentPhase(incident) === "responding");
    const closed = incidents.filter((incident) => incidentPhase(incident) === "closed");
    const todayCount = incidents.filter((incident) => manilaDayKey(incident.reported_at || incident.created_at) === today).length;
    return {
      reported: reported.length,
      responding: responding.length,
      closed: closed.length,
      open: reported.length + responding.length,
      today: todayCount,
      latestReported: reported.slice(0, 4),
      latestOpen: [...reported, ...responding].slice(0, 4),
    };
  }, [incidents]);

  function selectTab(next: DeskTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const queryString = params.toString();
    router.replace(queryString ? `/incidents?${queryString}` : "/incidents");
  }

  async function act(id: string, action: "acknowledge" | "close") {
    setBusyId(id);
    setActionError(null);
    try {
      const response = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setActionError(json.error ?? "Could not update the incident");
        return;
      }
      await refreshIncidents();
    } catch {
      setActionError("Could not update the incident");
    } finally {
      setBusyId(null);
    }
  }

  const tabs = responderView ? RESPONDER_TABS : COMMEL_TABS;
  const visible = incidents.filter((incident) => {
    if (!matches(incident, tab)) return false;
    const haystack = `${incident.title} ${incident.address} ${incident.caller_name ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const emptyCopy =
    tab === "reported"
      ? { title: "No reported incidents", body: "New calls from the station desk show up here." }
      : tab === "responding"
        ? { title: "No incidents in progress", body: "Acknowledge a reported call to take it." }
        : tab === "active"
          ? { title: "No active incidents", body: "Create one when a caller reports an address." }
          : { title: "No closed incidents", body: "Closed incidents stay here after the scene is cleared." };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Dispatch"
        title="Incidents"
        description={
          responderView
            ? "Reported calls from the station desk. Acknowledge the one you are taking, then close it when the scene is cleared."
            : "Log an address, then open it for advisory driving options from the station. Routes do not choose a tactic."
        }
        actions={
          canLog ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              New incident
            </button>
          ) : null
        }
      />

      {!accountReady ? <p className="fine">Loading the board…</p> : null}

      {accountReady ? (
        <div className="tabs" role="tablist" aria-label="Incident sections">
          {tabs.map((item) => {
            const count =
              item.id === "reported"
                ? counts.reported
                : item.id === "responding"
                  ? counts.responding
                  : item.id === "active"
                    ? counts.open
                    : item.id === "closed"
                      ? counts.closed
                      : null;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`incident-tab-${item.id}`}
                aria-controls={`incident-panel-${item.id}`}
                aria-selected={tab === item.id}
                onClick={() => selectTab(item.id)}
              >
                {item.label}
                {count != null ? <span className="tab-count">{count}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {actionError ? <p className="warn-text">{actionError}</p> : null}

      {accountReady && tab === "overview" ? (
        <div role="tabpanel" id="incident-panel-overview" aria-labelledby="incident-tab-overview" className="stack">
          <div className="metrics">
            {responderView ? (
              <>
                <button type="button" className="metric-hit" onClick={() => selectTab("reported")}>
                  <Metric label="Reported" value={String(counts.reported)} detail="Waiting for a responder" tone={counts.reported > 0 ? "alert" : "ok"} />
                </button>
                <button type="button" className="metric-hit" onClick={() => selectTab("responding")}>
                  <Metric label="Responding" value={String(counts.responding)} detail="Acknowledged, still open" />
                </button>
              </>
            ) : (
              <button type="button" className="metric-hit" onClick={() => selectTab("active")}>
                <Metric label="Active" value={String(counts.open)} detail="Open calls on the board" tone={counts.open > 0 ? "alert" : "ok"} />
              </button>
            )}
            <button type="button" className="metric-hit" onClick={() => selectTab("closed")}>
              <Metric label="Closed" value={String(counts.closed)} detail="Cleared scenes" />
            </button>
            <Metric label="Logged today" value={String(counts.today)} detail="Manila date, every status" />
          </div>
          <section className="card stack">
            <div>
              <p className="eyebrow">Station</p>
              <h2 className="section-title">{STATION.name}</h2>
              <p className="fine">
                {responderView
                  ? "These are calls the desk has logged. Respond to take one."
                  : `${STATION.address}. New calls pin here, then follow the address the desk types.`}
              </p>
            </div>
            {!incidentsReady ? <p className="fine">Loading incidents…</p> : null}
            {incidentsReady && (responderView ? counts.latestReported : counts.latestOpen).length === 0 ? (
              <EmptyState
                title={responderView ? "No reported incidents" : "No active incidents"}
                body={responderView ? "New calls from the station desk show up here." : "Create one when a caller reports an address."}
                action={
                  canLog ? (
                    <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                      New incident
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="incident-grid">
                {(responderView ? counts.latestReported : counts.latestOpen).map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    canRespond={responderView}
                    busy={busyId === incident.id}
                    onRespond={() => void act(incident.id, "acknowledge")}
                    onClose={() => void act(incident.id, "close")}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {accountReady && tab !== "overview" ? (
        <div role="tabpanel" id={`incident-panel-${tab}`} aria-labelledby={`incident-tab-${tab}`} className="stack">
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">Search incidents</span>
              <Icon name="search" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, address, or caller" />
            </label>
          </div>
          {!incidentsReady ? <p className="fine">Loading incidents…</p> : null}
          {incidentsReady && visible.length === 0 ? (
            <EmptyState
              title={emptyCopy.title}
              body={emptyCopy.body}
              action={
                tab === "active" && canLog ? (
                  <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                    New incident
                  </button>
                ) : undefined
              }
            />
          ) : null}
          <div className="incident-grid">
            {visible.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                canRespond={responderView}
                busy={busyId === incident.id}
                onRespond={() => void act(incident.id, "acknowledge")}
                onClose={() => void act(incident.id, "close")}
              />
            ))}
          </div>
        </div>
      ) : null}

      {canLog ? <IncidentCreateModal open={createOpen} onClose={closeCreate} /> : null}
    </div>
  );
}

function phaseLabel(phase: IncidentPhase): string {
  if (phase === "responding") return "responding";
  if (phase === "closed") return "closed";
  return "reported";
}

function IncidentCard({
  incident,
  canRespond,
  busy,
  onRespond,
  onClose,
}: {
  incident: Incident;
  canRespond: boolean;
  busy: boolean;
  onRespond: () => void;
  onClose: () => void;
}) {
  const phase = incidentPhase(incident);
  return (
    <article className="incident-card" data-tone={phase === "closed" ? "closed" : phase === "responding" ? "responding" : "reported"}>
      <Link href={`/incidents/${incident.id}`} className="incident-card-link">
        <div className="incident-top">
          <strong>{incident.title}</strong>
          <Badge tone={phase === "responding" ? "live" : phase === "reported" ? "brand" : "wait"}>{phaseLabel(phase)}</Badge>
        </div>
        <span>{incident.address}</span>
        <p className="person-meta">
          {manilaTime(incident.reported_at || incident.created_at)} PHT
          {incident.caller_name ? ` · ${incident.caller_name}` : ""}
          {phase === "responding" && incident.acknowledged_by_username ? ` · ${incident.acknowledged_by_username}` : ""}
          {phase === "reported" && incident.created_by_username ? ` · ${incident.created_by_username}` : ""}
        </p>
      </Link>
      {canRespond && phase === "reported" ? (
        <button type="button" className="btn btn-primary" onClick={onRespond} disabled={busy}>
          {busy ? "Saving…" : "Respond"}
        </button>
      ) : null}
      {canRespond && phase === "responding" ? (
        <button type="button" className="btn btn-danger" onClick={onClose} disabled={busy}>
          {busy ? "Saving…" : "Close incident"}
        </button>
      ) : null}
      {!canRespond && phase === "reported" ? <p className="fine">Waiting for a responder</p> : null}
      {!canRespond && phase === "responding" ? (
        <p className="fine">Responder acknowledged{incident.acknowledged_by_username ? ` · ${incident.acknowledged_by_username}` : ""}</p>
      ) : null}
    </article>
  );
}

export function IncidentsBoard() {
  return (
    <Suspense fallback={<div className="page"><p className="fine">Loading incidents…</p></div>}>
      <IncidentsBoardInner />
    </Suspense>
  );
}
