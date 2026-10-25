"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Incident } from "@/lib/incidents";
import type { GatewayLink } from "@/lib/link-status";
import { fallNeedsReview, latestByWearer, type NormalizedTelemetry } from "@/lib/telemetry-core";

type TelemetryResponse = { ok: boolean; count: number; items: NormalizedTelemetry[] };

type BoardValue = {
  items: NormalizedTelemetry[] | null;
  error: string | null;
  incidents: Incident[];
  incidentsReady: boolean;
  gateway: GatewayLink | null;
  now: number;
  crew: NormalizedTelemetry[];
  alerts: NormalizedTelemetry[];
  busy: string | null;
  refreshTelemetry: () => Promise<void>;
  refreshIncidents: () => Promise<void>;
  loadSample: () => Promise<void>;
  clearPackets: () => Promise<void>;
};

const BoardContext = createContext<BoardValue | null>(null);

export function useBoard(): BoardValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoard must be used inside BoardProvider");
  return value;
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NormalizedTelemetry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsReady, setIncidentsReady] = useState(false);
  const [gateway, setGateway] = useState<GatewayLink | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  const refreshTelemetry = useCallback(async () => {
    try {
      const response = await fetch("/api/telemetry", { cache: "no-store" });
      if (!response.ok) throw new Error("bad status");
      const json = (await response.json()) as TelemetryResponse;
      setItems(json.items);
      setError(null);
    } catch {
      setError("The board could not reach the telemetry service.");
    }
  }, []);

  const refreshIncidents = useCallback(async () => {
    try {
      const response = await fetch("/api/incidents", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as { incidents: Incident[] };
      setIncidents(json.incidents);
    } catch {
      // Keep the last list when a refresh fails.
    } finally {
      setIncidentsReady(true);
    }
  }, []);

  const refreshLink = useCallback(async () => {
    try {
      const response = await fetch("/api/link", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as { gateway?: GatewayLink };
      if (json.gateway) setGateway(json.gateway);
    } catch {
      // Keep the last heartbeat when a refresh fails.
    }
  }, []);

  useEffect(() => {
    void refreshTelemetry();
    void refreshIncidents();
    void refreshLink();
    const telemetryTimer = setInterval(() => void refreshTelemetry(), 2000);
    const linkTimer = setInterval(() => void refreshLink(), 2000);
    const incidentTimer = setInterval(() => void refreshIncidents(), 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(telemetryTimer);
      clearInterval(linkTimer);
      clearInterval(incidentTimer);
      clearInterval(clock);
    };
  }, [refreshIncidents, refreshLink, refreshTelemetry]);

  const crew = useMemo(() => latestByWearer(items ?? []), [items]);
  const alerts = useMemo(() => crew.filter((person) => fallNeedsReview(person.fall.state)), [crew]);

  const loadSample = useCallback(async () => {
    setBusy("sample");
    try {
      const response = await fetch("/api/demo", { method: "POST" });
      if (!response.ok) setError("Sample crew could not be loaded.");
      await refreshTelemetry();
    } catch {
      setError("Sample crew could not be loaded.");
    } finally {
      setBusy(null);
    }
  }, [refreshTelemetry]);

  const clearPackets = useCallback(async () => {
    setBusy("clear");
    try {
      await fetch("/api/telemetry", { method: "DELETE" });
      await refreshTelemetry();
    } finally {
      setBusy(null);
    }
  }, [refreshTelemetry]);

  const value = useMemo<BoardValue>(
    () => ({
      items,
      error,
      incidents,
      incidentsReady,
      gateway,
      now,
      crew,
      alerts,
      busy,
      refreshTelemetry,
      refreshIncidents,
      loadSample,
      clearPackets,
    }),
    [
      alerts,
      busy,
      clearPackets,
      crew,
      error,
      gateway,
      incidents,
      incidentsReady,
      items,
      loadSample,
      now,
      refreshIncidents,
      refreshTelemetry,
    ],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}
