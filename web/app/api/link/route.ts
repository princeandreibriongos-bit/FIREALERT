import { NextRequest, NextResponse } from "next/server";
import { loadGateway, saveLinkReport } from "@/lib/link-store";
import { parseLinkReport } from "@/lib/link-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, gateway: await loadGateway() });
  } catch (error) {
    console.error("[FIREALERT] link", error);
    return NextResponse.json({ ok: false, error: "Shared log unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseLinkReport(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  return NextResponse.json({ ok: true, gateway: await saveLinkReport(parsed.value) });
}
