import { capItems, EMPTY_GATEWAY, packetKey, parseBoard, type SharedBoard } from "./board-shape";
import type { Incident } from "./incidents";
import type { GatewayLink } from "./link-status";
import { redisCommand, redisConfig } from "./redis-rest";
import type { NormalizedTelemetry } from "./telemetry-core";

const BOARD_URL = "https://mantledb.sh/v2/firealert-makati-b81f3fd818ec/board";
const PUBLISH_GAP_MS = 4_000;
const TELEMETRY_KEY = "firealert:telemetry";
const LINK_KEY = "firealert:link";
const INCIDENTS_KEY = "firealert:incidents";

export type BoardBackend = "redis" | "shared" | "memory";

export function boardBackend(): BoardBackend {
  if (redisConfig()) return "redis";
  if (process.env.FIREALERT_SHARED === "off") return "memory";
  return "shared";
}

let latestItems: NormalizedTelemetry[] = [];
let latestGateway: GatewayLink = { ...EMPTY_GATEWAY };
let itemsDirty = false;
let gatewayDirty = false;
let pending: ReturnType<typeof setTimeout> | null = null;
let lastSent = 0;
let primed = false;
let cache: { at: number; doc: SharedBoard } | null = null;
let cacheGeneration = 0;
let inflight: Promise<SharedBoard> | null = null;

function publishingFromMemory(): boolean {
  return boardBackend() === "shared" && process.env.NODE_ENV === "development";
}

export function primeLive(items: NormalizedTelemetry[], gateway: GatewayLink): void {
  if (primed || !publishingFromMemory()) return;
  primed = true;
  if (items.length) {
    latestItems = items;
    itemsDirty = true;
  }
  if (gateway.seen_at) {
    latestGateway = gateway;
    gatewayDirty = true;
  }
  schedule();
}

export function noteItems(items: NormalizedTelemetry[]): void {
  if (!publishingFromMemory()) return;
  latestItems = items;
  itemsDirty = true;
  schedule();
}

export function noteGateway(gateway: GatewayLink): void {
  if (!publishingFromMemory()) return;
  latestGateway = gateway;
  gatewayDirty = true;
  schedule();
}

function schedule(): void {
  if (pending) return;
  const delay = Math.max(0, PUBLISH_GAP_MS - (Date.now() - lastSent));
  pending = setTimeout(() => {
    void flush();
  }, delay);
}

async function flush(): Promise<void> {
  pending = null;
  const body: Record<string, unknown> = {};
  if (itemsDirty) {
    body.items = capItems(latestItems);
    itemsDirty = false;
  }
  if (gatewayDirty) {
    body.gateway = latestGateway;
    gatewayDirty = false;
  }
  if (Object.keys(body).length === 0) return;
  try {
    await patchBoard(body);
    lastSent = Date.now();
    const count = Array.isArray(body.items) ? body.items.length : null;
    console.log(`[FIREALERT] shared log${count == null ? "" : ` items=${count}`}${body.gateway ? " gateway" : ""}`);
  } catch (error) {
    console.error("[FIREALERT] shared log", error);
    if (body.items) itemsDirty = true;
    if (body.gateway) gatewayDirty = true;
  }
  if (itemsDirty || gatewayDirty) schedule();
}

function invalidateCache(): void {
  cacheGeneration += 1;
  cache = null;
}

async function patchBoard(partial: Record<string, unknown>): Promise<void> {
  const response = await fetch(BOARD_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) {
    const created = await fetch(BOARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [], gateway: { ...EMPTY_GATEWAY }, incidents: [], ...partial }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!created.ok) throw new Error(`shared log HTTP ${created.status}`);
    invalidateCache();
    return;
  }
  if (!response.ok) throw new Error(`shared log HTTP ${response.status}`);
  invalidateCache();
}

async function fetchBoard(): Promise<SharedBoard> {
  const generation = cacheGeneration;
  const response = await fetch(BOARD_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (response.status === 404) return { items: [], gateway: { ...EMPTY_GATEWAY }, incidents: [] };
  if (!response.ok) throw new Error(`shared log HTTP ${response.status}`);
  const doc = parseBoard(await response.json());
  if (generation === cacheGeneration) cache = { at: Date.now(), doc };
  return doc;
}

export async function readSharedBoard(): Promise<SharedBoard> {
  if (cache && Date.now() - cache.at < 2000) return cache.doc;
  if (!inflight) {
    inflight = fetchBoard().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function writeSharedIncidents(incidents: Incident[]): Promise<void> {
  if (boardBackend() === "redis") {
    await redisCommand(["SET", INCIDENTS_KEY, JSON.stringify(incidents)]);
    return;
  }
  if (boardBackend() !== "shared") return;
  await patchBoard({ incidents });
}

export async function writeSharedGateway(gateway: GatewayLink): Promise<void> {
  if (boardBackend() === "redis") {
    await redisCommand(["SET", LINK_KEY, JSON.stringify(gateway)]);
    return;
  }
  if (boardBackend() !== "shared") return;
  await patchBoard({ gateway });
}

export async function writeSharedItems(items: NormalizedTelemetry[]): Promise<void> {
  if (boardBackend() === "redis") {
    await redisCommand(["DEL", TELEMETRY_KEY]);
    if (items.length) await redisCommand(["RPUSH", TELEMETRY_KEY, ...items.slice(0, 250).map((item) => JSON.stringify(item))]);
    return;
  }
  if (boardBackend() !== "shared") return;
  await patchBoard({ items: capItems(items) });
}

export async function appendSharedItem(entry: NormalizedTelemetry): Promise<void> {
  if (boardBackend() === "redis") {
    const recent = await redisCommand(["LRANGE", TELEMETRY_KEY, 0, 40]);
    const id = packetKey(entry);
    if (Array.isArray(recent)) {
      for (const row of recent) {
        if (typeof row !== "string") continue;
        try {
          if (packetKey(JSON.parse(row) as NormalizedTelemetry) === id) return;
        } catch {
          // Ignore a corrupt row and keep the new packet.
        }
      }
    }
    await redisCommand(["LPUSH", TELEMETRY_KEY, JSON.stringify(entry)]);
    await redisCommand(["LTRIM", TELEMETRY_KEY, 0, 249]);
    return;
  }
  const current = await readSharedBoard();
  const id = packetKey(entry);
  if (current.items.some((item) => packetKey(item) === id)) return;
  await writeSharedItems([entry, ...current.items]);
}

export async function readRedisBoard(): Promise<SharedBoard> {
  const [itemsRaw, linkRaw, incidentsRaw] = await Promise.all([
    redisCommand(["LRANGE", TELEMETRY_KEY, 0, 249]),
    redisCommand(["GET", LINK_KEY]),
    redisCommand(["GET", INCIDENTS_KEY]),
  ]);
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.flatMap((row) => {
        if (typeof row !== "string") return [];
        try {
          return [JSON.parse(row)];
        } catch {
          return [];
        }
      })
    : [];
  let gateway: unknown = null;
  let incidents: unknown = [];
  if (typeof linkRaw === "string") {
    try {
      gateway = JSON.parse(linkRaw);
    } catch {
      gateway = null;
    }
  }
  if (typeof incidentsRaw === "string") {
    try {
      incidents = JSON.parse(incidentsRaw);
    } catch {
      incidents = [];
    }
  }
  return parseBoard({ items, gateway, incidents });
}
