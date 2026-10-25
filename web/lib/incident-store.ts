import { listIncidents, replaceIncidents, type Incident, type IncidentDraft } from "./incidents";
import { boardBackend, readRedisBoard, readSharedBoard, writeSharedIncidents } from "./shared-board";

function sameIncidents(left: Incident[], right: Incident[]): boolean {
  if (left.length !== right.length) return false;
  const byId = new Map(right.map((item) => [item.id, item.status]));
  return left.every((item) => byId.get(item.id) === item.status);
}

function mergeIncidents(local: Incident[], remote: Incident[]): Incident[] {
  const byId = new Map(remote.map((item) => [item.id, item]));
  for (const item of local) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

let lastIncidentPull = 0;

async function maybePullIncidents(): Promise<void> {
  if (boardBackend() !== "shared" || process.env.NODE_ENV !== "development") return;
  const now = Date.now();
  if (lastIncidentPull && now - lastIncidentPull < 30_000) return;
  lastIncidentPull = now;
  try {
    const remote = (await readSharedBoard()).incidents;
    const merged = mergeIncidents(listIncidents(), remote);
    if (!sameIncidents(merged, remote)) await writeSharedIncidents(merged);
    replaceIncidents(merged);
  } catch (error) {
    lastIncidentPull = 0;
    console.error("[FIREALERT] shared incidents", error);
  }
}

export async function loadIncidentList(): Promise<Incident[]> {
  const kind = boardBackend();
  if (kind === "memory") return listIncidents();
  if (kind === "redis") return (await readRedisBoard()).incidents;
  if (process.env.NODE_ENV === "development") {
    await maybePullIncidents();
    return listIncidents();
  }
  return (await readSharedBoard()).incidents;
}

async function rememberIncidents(next: Incident[]): Promise<void> {
  replaceIncidents(next);
  if (boardBackend() === "memory") return;
  try {
    await writeSharedIncidents(next);
  } catch (error) {
    console.error("[FIREALERT] shared incidents", error);
  }
}

export async function createIncident(draft: IncidentDraft): Promise<Incident> {
  const incident: Incident = {
    id: `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...draft,
    status: "open",
    created_at: new Date().toISOString(),
  };
  const current = boardBackend() === "memory" ? listIncidents() : await loadIncidentList();
  await rememberIncidents([incident, ...current]);
  return incident;
}

export async function changeIncidentStatus(id: string, status: "open" | "closed"): Promise<Incident | null> {
  const current = boardBackend() === "memory" ? listIncidents() : await loadIncidentList();
  if (!current.some((item) => item.id === id)) return null;
  const next = current.map((item) => (item.id === id ? { ...item, status } : item));
  await rememberIncidents(next);
  return next.find((item) => item.id === id) ?? null;
}
