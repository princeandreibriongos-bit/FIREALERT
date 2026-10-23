import { NextRequest, NextResponse } from "next/server";
import { setIncidentStatus } from "@/lib/incidents";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const status =
    typeof body === "object" && body !== null && "status" in body ? (body as { status?: unknown }).status : null;
  if (status !== "open" && status !== "closed") {
    return NextResponse.json({ ok: false, error: "Status must be open or closed" }, { status: 400 });
  }

  const incident = setIncidentStatus(id, status);
  if (!incident) {
    return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, incident });
}
