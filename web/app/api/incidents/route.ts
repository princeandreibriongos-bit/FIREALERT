import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";
import { createIncident, loadIncidentList } from "@/lib/incident-store";
import { parseIncidentInput } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, incidents: await loadIncidentList() });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseIncidentInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  let draft = parsed.value;
  let geocoded = false;
  if (draft.latitude == null || draft.longitude == null) {
    const point = await geocodeAddress(draft.address);
    if (!point) {
      return NextResponse.json(
        { ok: false, error: "No map point for that address. Enter latitude and longitude." },
        { status: 422 },
      );
    }
    draft = { ...draft, latitude: point.latitude, longitude: point.longitude };
    geocoded = true;
  }

  const incident = await createIncident(draft);
  return NextResponse.json({ ok: true, incident, geocoded });
}
