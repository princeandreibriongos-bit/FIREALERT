"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Incident } from "@/lib/incidents";
import type { GatewayLink } from "@/lib/link-status";
import { fallNeedsReview, latestByWearer, type NormalizedTelemetry } from "@/lib/telemetry-core";

type BoardResponse = {
  ok: boolean;
  items?: NormalizedTelemetry[];
  incidents?: Incident[];
  gateway?: GatewayLink;
};

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
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const [items, setItems] = useState<NormalizedTelemetry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsReady, setIncidentsReady] = useState(false);
  const [gateway, setGateway] = useState<GatewayLink | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    try {
      const response = await fetch("/api/board");
      if (!response.ok) throw new Error("bad status");
      const json = (await response.json()) as BoardResponse;
      setItems(json.items ?? []);
      setIncidents(json.incidents ?? []);
      if (json.gateway) setGateway(json.gateway);
      setError(null);
    } catch {
      setError("The board could not reach the telemetry service.");
    } finally {
      setIncidentsReady(true);
    }
  }, []);

  useEffect(() => {
    if (onLanding) return;
    void refreshBoard();
    const boardTimer = setInterval(() => void refreshBoard(), 3000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(boardTimer);
      clearInterval(clock);
    };
  }, [onLanding, refreshBoard]);

  const crew = useMemo(() => latestByWearer(items ?? []), [items]);
  const alerts = useMemo(() => crew.filter((person) => fallNeedsReview(person.fall.state)), [crew]);

  const loadSample = useCallback(async () => {
    setBusy("sample");
    try {
      const response = await fetch("/api/demo", { method: "POST" });
      if (!response.ok) setError("Sample crew could not be loaded.");
      await refreshBoard();
    } catch {
      setError("Sample crew could not be loaded.");
    } finally {
      setBusy(null);
    }
  }, [refreshBoard]);

  const clearPackets = useCallback(async () => {
    setBusy("clear");
    try {
      await fetch("/api/telemetry", { method: "DELETE" });
      await refreshBoard();
    } finally {
      setBusy(null);
    }
  }, [refreshBoard]);

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
      refreshTelemetry: refreshBoard,
      refreshIncidents: refreshBoard,
      loadSample,
      clearPackets,
    }),
    [alerts, busy, clearPackets, crew, error, gateway, incidents, incidentsReady, items, loadSample, now, refreshBoard],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}
