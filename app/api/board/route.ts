import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/request-session";
import { loadIncidentList } from "@/lib/incident-store";
import { loadGateway } from "@/lib/link-store";
import { readLink } from "@/lib/link-status";
import { boardBackend, primeLive } from "@/lib/shared-board";
import { listTelemetry, readTelemetry } from "@/lib/telemetry-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getRequestSession();
    const incidents = await loadIncidentList();
    if (session?.role === "commel") {
      return NextResponse.json(
        { ok: true, count: 0, latest: null, items: [], gateway: null, incidents, store: "incidents" },
        { headers: { "Cache-Control": "private, max-age=0" } },
      );
    }
    if (process.env.NODE_ENV === "development") primeLive(listTelemetry(), readLink());
    const [items, gateway] = await Promise.all([readTelemetry(), loadGateway()]);
    return NextResponse.json(
      { ok: true, count: items.length, latest: items[0] ?? null, items, gateway, incidents, store: boardBackend() },
      { headers: { "Cache-Control": "private, max-age=0" } },
    );
  } catch (error) {
    console.error("[FIREALERT] board", error);
    return NextResponse.json({ ok: false, error: "Shared log unavailable" }, { status: 503 });
  }
}
