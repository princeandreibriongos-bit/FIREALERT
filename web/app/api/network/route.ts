import { NextRequest, NextResponse } from "next/server";
import { parseRouterInput, readRouter, writeRouter } from "@/lib/network-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const router = await readRouter();
  return NextResponse.json({ ok: true, ...router });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseRouterInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const saved = await writeRouter(parsed.value);
  return NextResponse.json({ ok: true, ...saved });
}
