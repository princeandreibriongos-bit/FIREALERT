import { NextRequest, NextResponse } from "next/server";
import { noteLink, parseLinkReport, readLink } from "@/lib/link-status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, gateway: readLink() });
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
  return NextResponse.json({ ok: true, gateway: noteLink(parsed.value) });
}
