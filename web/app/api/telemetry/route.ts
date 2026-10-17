import { NextRequest, NextResponse } from "next/server";
import { listTelemetry, logTelemetry, type TelemetryPayload } from "@/lib/telemetry-store";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Expected a JSON object" }, { status: 400 });
  }

  const payload = body as TelemetryPayload;
  const saved = logTelemetry(payload);

  return NextResponse.json({
    ok: true,
    received_at: saved.received_at,
    sequence: payload.sequence ?? null,
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
