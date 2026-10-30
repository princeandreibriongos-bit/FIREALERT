import { desc, eq } from "drizzle-orm";
import { databaseUrl, getDb } from "./db/client";
import { incidents as incidentsTable, type IncidentRow } from "./db/schema";
import { addIncident, listIncidents, replaceIncidents, setIncidentStatus, type Incident, type IncidentDraft } from "./incidents";
import { boardBackend, readRedisBoard, readSharedBoard, writeSharedIncidents } from "./shared-board";

function rowToIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    title: row.title,
    address: row.address,
    notes: row.notes,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status === "closed" ? "closed" : "open",
    created_at: row.createdAt,
    reported_at: row.reportedAt,
    created_by_user_id: row.createdByUserId,
    created_by_username: row.createdByUsername,
    closed_at: row.closedAt,
    caller_name: row.callerName,
    caller_contact: row.callerContact,
  };
}

function usePostgres(): boolean {
  return Boolean(databaseUrl());
}

async function loadFromPostgres(): Promise<Incident[]> {
  const rows = await getDb().select().from(incidentsTable).orderBy(desc(incidentsTable.reportedAt));
  return rows.map(rowToIncident);
}

export async function loadIncidentList(): Promise<Incident[]> {
  if (usePostgres()) {
    try {
      const rows = await loadFromPostgres();
      replaceIncidents(rows);
      return rows;
    } catch (error) {
      console.error("[FIREALERT] postgres incidents", error);
    }
  }

  const kind = boardBackend();
  if (kind === "memory") return listIncidents();
  if (kind === "redis") return (await readRedisBoard()).incidents as Incident[];
  return (await readSharedBoard()).incidents as Incident[];
}

async function rememberShared(next: Incident[]): Promise<void> {
  replaceIncidents(next);
  if (boardBackend() === "memory") return;
  try {
    await writeSharedIncidents(next);
  } catch (error) {
    console.error("[FIREALERT] shared incidents", error);
  }
}

export async function createIncident(
  draft: IncidentDraft,
  actor?: { id: string; username: string } | null,
): Promise<Incident> {
  if (usePostgres()) {
    const now = new Date().toISOString();
    const id = `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const reportedAt = draft.reported_at || now;
    const [row] = await getDb()
      .insert(incidentsTable)
      .values({
        id,
        title: draft.title,
        address: draft.address,
        notes: draft.notes,
        latitude: draft.latitude,
        longitude: draft.longitude,
        status: "open",
        createdByUserId: actor?.id ?? null,
        createdByUsername: actor?.username ?? null,
        reportedAt,
        createdAt: now,
        callerName: draft.caller_name ?? null,
        callerContact: draft.caller_contact ?? null,
      })
      .returning();
    const incident = rowToIncident(row);
    const current = await loadIncidentList();
    await rememberShared([incident, ...current.filter((item) => item.id !== incident.id)]);
    return incident;
  }

  const incident = addIncident(draft, actor);
  const current = boardBackend() === "memory" ? listIncidents() : await loadIncidentList();
  await rememberShared([incident, ...current.filter((item) => item.id !== incident.id)]);
  return incident;
}

export async function changeIncidentStatus(id: string, status: "open" | "closed"): Promise<Incident | null> {
  if (usePostgres()) {
    const closedAt = status === "closed" ? new Date().toISOString() : null;
    const rows = await getDb()
      .update(incidentsTable)
      .set({ status, closedAt })
      .where(eq(incidentsTable.id, id))
      .returning();
    if (!rows[0]) return null;
    const incident = rowToIncident(rows[0]);
    const current = await loadIncidentList();
    await rememberShared(current.map((item) => (item.id === id ? incident : item)));
    return incident;
  }

  const current = boardBackend() === "memory" ? listIncidents() : await loadIncidentList();
  if (!current.some((item) => item.id === id)) return null;
  setIncidentStatus(id, status);
  const next = listIncidents();
  await rememberShared(next);
  return next.find((item) => item.id === id) ?? null;
}
