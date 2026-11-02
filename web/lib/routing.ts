export type LatLon = { latitude: number; longitude: number };

export type RouteOption = {
  distance_m: number;
  duration_s: number;
  coordinates: [number, number][];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function osrmUrl(from: LatLon, to: LatLon): string {
  const path = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  return `https://router.project-osrm.org/route/v1/driving/${path}?overview=simplified&geometries=geojson&alternatives=true&steps=false`;
}

export function osmDirectionsUrl(from: LatLon, to: LatLon): string {
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.latitude}%2C${from.longitude}%3B${to.latitude}%2C${to.longitude}`;
}

export function parseOsrm(body: unknown): { ok: true; routes: RouteOption[] } | { ok: false; error: string } {
  if (!isRecord(body) || body.code !== "Ok" || !Array.isArray(body.routes)) {
    return { ok: false, error: "Routing service did not return a route" };
  }

  const routes: RouteOption[] = [];
  for (const route of body.routes) {
    if (!isRecord(route)) continue;
    const distance = num(route.distance);
    const duration = num(route.duration);
    const geometry = isRecord(route.geometry) ? route.geometry : null;
    const pairs = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const coordinates: [number, number][] = [];
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lon = num(pair[0]);
      const lat = num(pair[1]);
      if (lon == null || lat == null) continue;
      coordinates.push([lon, lat]);
    }
    if (distance == null || duration == null) continue;
    routes.push({ distance_m: distance, duration_s: duration, coordinates });
  }

  if (!routes.length) return { ok: false, error: "Routing service did not return a route" };
  return { ok: true, routes };
}
