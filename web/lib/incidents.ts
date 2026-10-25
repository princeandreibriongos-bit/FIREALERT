export type Incident = {
  id: string;
  title: string;
  address: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
  status: "open" | "closed";
  created_at: string;
};

export type IncidentDraft = {
  title: string;
  address: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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
  return { ok: true, value: { title, address, notes, latitude, longitude } };
}

const globalStore = globalThis as typeof globalThis & { __firealertIncidents?: Incident[] };

function incidents(): Incident[] {
  if (!globalStore.__firealertIncidents) globalStore.__firealertIncidents = [];
  return globalStore.__firealertIncidents;
}

export function listIncidents(): Incident[] {
  return incidents();
}

export function addIncident(draft: IncidentDraft): Incident {
  const incident: Incident = {
    id: `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...draft,
    status: "open",
    created_at: new Date().toISOString(),
  };
  incidents().unshift(incident);
  return incident;
}

export function setIncidentStatus(id: string, status: "open" | "closed"): Incident | null {
  const incident = incidents().find((item) => item.id === id);
  if (!incident) return null;
  incident.status = status;
  return incident;
}

export function replaceIncidents(next: Incident[]): void {
  const items = incidents();
  items.splice(0, items.length, ...next);
}
