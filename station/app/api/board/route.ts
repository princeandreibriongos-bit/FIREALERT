import { NextResponse } from "next/server";
import { loadIncidentList } from "@/lib/incident-store";
import { loadGateway } from "@/lib/link-store";
import { readLink } from "@/lib/link-status";
import { boardBackend, primeLive } from "@/lib/shared-board";
import { listTelemetry, readTelemetry } from "@/lib/telemetry-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (process.env.NODE_ENV === "development") primeLive(listTelemetry(), readLink());
    const [items, gateway, incidents] = await Promise.all([readTelemetry(), loadGateway(), loadIncidentList()]);
    return NextResponse.json(
      { ok: true, count: items.length, latest: items[0] ?? null, items, gateway, incidents, store: boardBackend() },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=6" } },
    );
  } catch (error) {
    console.error("[FIREALERT] board", error);
    return NextResponse.json({ ok: false, error: "Shared log unavailable" }, { status: 503 });
  }
}
