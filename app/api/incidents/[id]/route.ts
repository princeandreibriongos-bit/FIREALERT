import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/request-session";
import { acknowledgeIncident, changeIncidentStatus, loadIncidentList } from "@/lib/incident-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const session = await getRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in to update an incident" }, { status: 401 });
  }
  if (session.role === "commel") {
    return NextResponse.json(
      { ok: false, error: "The station desk logs calls. A local responder acknowledges and closes them." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as { action?: unknown; status?: unknown }) : {};
  const action = record.action === "acknowledge" || record.action === "close" || record.action === "reopen" ? record.action : null;
  const status = record.status === "open" || record.status === "closed" ? record.status : null;
  const intent = action ?? (status === "closed" ? "close" : status === "open" ? "reopen" : null);
  if (!intent) {
    return NextResponse.json({ ok: false, error: "Action must be acknowledge, close, or reopen" }, { status: 400 });
  }

  const current = (await loadIncidentList()).find((item) => item.id === id);
  if (!current) {
    return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
  }

  if (intent === "acknowledge") {
    if (current.status === "closed") {
      return NextResponse.json({ ok: false, error: "This incident is already closed" }, { status: 409 });
    }
    const incident = await acknowledgeIncident(id, { id: session.sub, username: session.username });
    if (!incident) return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
    return NextResponse.json({ ok: true, incident });
  }

  if (intent === "close") {
    if (!current.acknowledged_at) {
      return NextResponse.json({ ok: false, error: "Acknowledge the incident before closing it" }, { status: 409 });
    }
    const incident = await changeIncidentStatus(id, "closed");
    if (!incident) return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
    return NextResponse.json({ ok: true, incident });
  }

  const incident = await changeIncidentStatus(id, "open");
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
  return NextResponse.json({ ok: true, incident });
}
