export type Incident = {
  id: string;
  title: string;
  address: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  status: "open" | "closed";
  created_at: string;
  reported_at: string;
  created_by_user_id: string | null;
  created_by_username: string | null;
  closed_at: string | null;
  caller_name: string | null;
  caller_contact: string | null;
};

export type IncidentDraft = {
  title: string;
  address: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  reported_at?: string | null;
  caller_name?: string | null;
  caller_contact?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max: number): string | null {
  const next = text(value, max);
  return next || null;
}

function coord(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

export function parseIncidentInput(body: unknown): { ok: true; value: IncidentDraft } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Expected a JSON object" };
  const title = text(body.title, 80);
  const address = text(body.address, 160);
  const notes = text(body.notes, 500);
  if (!title) return { ok: false, error: "Title is required" };
  if (!address) return { ok: false, error: "Address is required" };

  const latitude = coord(body.latitude);
  const longitude = coord(body.longitude);
  if (latitude === undefined || longitude === undefined) {
    return { ok: false, error: "Coordinates must be numbers" };
  }
  if ((latitude == null) !== (longitude == null)) {
    return { ok: false, error: "Enter both latitude and longitude, or leave both empty" };
  }
  if (latitude != null && longitude != null && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
    return { ok: false, error: "Coordinates are out of range" };
  }

  const reportedRaw = optionalText(body.reported_at, 40);
  if (reportedRaw) {
    const parsed = Date.parse(reportedRaw);
    if (Number.isNaN(parsed)) return { ok: false, error: "reported_at must be a valid date-time" };
  }

  return {
    ok: true,
    value: {
      title,
      address,
      notes,
      latitude,
      longitude,
      reported_at: reportedRaw,
      caller_name: optionalText(body.caller_name, 80),
      caller_contact: optionalText(body.caller_contact, 40),
    },
  };
}

const globalStore = globalThis as typeof globalThis & { __firealertIncidents?: Incident[] };

function incidents(): Incident[] {
  if (!globalStore.__firealertIncidents) globalStore.__firealertIncidents = [];
  return globalStore.__firealertIncidents;
}

export function listIncidents(): Incident[] {
  return incidents();
}

export function addIncident(draft: IncidentDraft, actor?: { id: string; username: string } | null): Incident {
  const now = new Date().toISOString();
  const incident: Incident = {
    id: `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: draft.title,
    address: draft.address,
    notes: draft.notes,
    latitude: draft.latitude,
    longitude: draft.longitude,
    status: "open",
    created_at: now,
    reported_at: draft.reported_at || now,
    created_by_user_id: actor?.id ?? null,
    created_by_username: actor?.username ?? null,
    closed_at: null,
    caller_name: draft.caller_name ?? null,
    caller_contact: draft.caller_contact ?? null,
  };
  incidents().unshift(incident);
  return incident;
}

export function setIncidentStatus(id: string, status: "open" | "closed"): Incident | null {
  const incident = incidents().find((item) => item.id === id);
  if (!incident) return null;
  incident.status = status;
  incident.closed_at = status === "closed" ? new Date().toISOString() : null;
  return incident;
}

export function replaceIncidents(next: Incident[]): void {
  const items = incidents();
  items.splice(0, items.length, ...next);
}
