import { NextRequest, NextResponse } from "next/server";
import { listTelemetry, logTelemetry, replaceTelemetry } from "@/lib/telemetry-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const saved = logTelemetry(body);
  if (!saved) {
    return NextResponse.json({ ok: false, error: "Expected a JSON object" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    received_at: saved.received_at,
    sequence: saved.sequence,
    wearer_id: saved.wearer_id,
    signature: saved.signature.status,
  });
}

export async function GET() {
  const items = listTelemetry();
  return NextResponse.json({
    ok: true,
    count: items.length,
    latest: items[0] ?? null,
    items,
  });
}

export async function DELETE() {
  replaceTelemetry([]);
  return NextResponse.json({ ok: true });
}
