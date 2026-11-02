import { NextRequest, NextResponse } from "next/server";
import { readTelemetry, saveTelemetry, writeTelemetry } from "@/lib/telemetry-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const saved = await saveTelemetry(body);
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
  try {
    const items = await readTelemetry();
    return NextResponse.json({
      ok: true,
      count: items.length,
      latest: items[0] ?? null,
      items,
    });
  } catch (error) {
    console.error("[FIREALERT] telemetry", error);
    return NextResponse.json({ ok: false, error: "Shared log unavailable" }, { status: 503 });
  }
}

export async function DELETE() {
  await writeTelemetry([]);
  return NextResponse.json({ ok: true });
}
