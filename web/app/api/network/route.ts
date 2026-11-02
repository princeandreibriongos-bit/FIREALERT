import { NextRequest, NextResponse } from "next/server";
import {
  activateStoredProfile,
  activeCredentials,
  parseRouterInput,
  readStoredNetworks,
  writeRouterProfile,
  type NetworkKind,
} from "@/lib/network-config";

export const dynamic = "force-dynamic";

function isKind(value: unknown): value is NetworkKind {
  return value === "router" || value === "hotspot";
}

export async function GET() {
  const stored = await readStoredNetworks();
  return NextResponse.json({
    ok: true,
    ...activeCredentials(stored),
    active: stored.active,
    router: stored.router,
    hotspot: stored.hotspot,
  });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body === "object" && body !== null && "activate" in body) {
    const activate = (body as { activate?: unknown }).activate;
    if (!isKind(activate)) {
      return NextResponse.json({ ok: false, error: "Choose the room router or the phone hotspot" }, { status: 400 });
    }
    const switched = await activateStoredProfile(activate);
    if (!switched.ok) {
      return NextResponse.json({ ok: false, error: switched.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      ...activeCredentials(switched.stored),
      active: switched.stored.active,
      router: switched.stored.router,
      hotspot: switched.stored.hotspot,
    });
  }

  const parsed = parseRouterInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const kind = typeof body === "object" && body !== null && isKind((body as { kind?: unknown }).kind)
    ? (body as { kind: NetworkKind }).kind
    : "router";
  const stored = await writeRouterProfile(kind, parsed.value);
  return NextResponse.json({
    ok: true,
    ...activeCredentials(stored),
    active: stored.active,
    router: stored.router,
    hotspot: stored.hotspot,
  });
}
