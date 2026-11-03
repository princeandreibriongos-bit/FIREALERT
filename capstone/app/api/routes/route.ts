import { NextRequest, NextResponse } from "next/server";
import { osmDirectionsUrl, osrmUrl, parseOsrm, type LatLon } from "@/lib/routing";

export const dynamic = "force-dynamic";

function point(lat: number, lon: number): LatLon | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const to = point(Number(params.get("lat")), Number(params.get("lon")));
  const from = point(Number(params.get("fromLat")), Number(params.get("fromLon")));
  if (!to || !from) {
    return NextResponse.json({ ok: false, error: "Coordinates are required" }, { status: 400 });
  }

  const mapUrl = osmDirectionsUrl(from, to);
  try {
    const response = await fetch(osrmUrl(from, to), {
      headers: { "User-Agent": "FIREALERT-capstone/0.1 (educational prototype)" },
      cache: "no-store",
    });
    const body: unknown = await response.json();
    const parsed = parseOsrm(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error, map_url: mapUrl }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      advisory: true,
      note: "Advisory driving options from a public routing service. They do not confirm live closures, fireground access, or emergency-vehicle suitability.",
      map_url: mapUrl,
      routes: parsed.routes,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Routing service unavailable", map_url: mapUrl },
      { status: 502 },
    );
  }
}
