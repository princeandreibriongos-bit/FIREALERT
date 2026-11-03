import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { capItems, EMPTY_GATEWAY, packetKey, parseBoard, type SharedBoard } from "./board-shape";
import type { Incident } from "./incidents";
import type { GatewayLink } from "./link-status";
import { redisCommand, redisConfig } from "./redis-rest";
import type { NormalizedTelemetry } from "./telemetry-core";

/**
 * The previous namespace (firealert-makati-b81f3fd818ec) is stuck over the
 * free 10,000 requests/day cap, so every heartbeat written there was dropped.
 * This document is a fresh namespace. Writes are coalesced so one board plus
 * the gateway stay inside that cap.
 */
const BOARD_URL = (process.env.FIREALERT_BOARD_URL || "").trim() || "https://mantledb.sh/v2/firealert-nmcfs-live/board";
const READ_CACHE_MS = 25_000;
const WRITE_GAP_MS = 25_000;
const FAIL_BACKOFF_START_MS = 60_000;
const FAIL_BACKOFF_MAX_MS = 15 * 60_000;
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
let latestIncidents: Incident[] = [];
let itemsBased = false;
let cache: { at: number; doc: SharedBoard } | null = null;
let inflight: Promise<SharedBoard> | null = null;
let pending: Record<string, unknown> = {};
let chain: Promise<void> = Promise.resolve();
let lastWriteSlot = -1;
let writeBackoffUntil = 0;
let readBackoffUntil = 0;
let writeFailStreak = 0;
let diskTried = false;
let primed = false;

function emptyBoard(): SharedBoard {
  return { items: [], gateway: { ...EMPTY_GATEWAY }, incidents: [] };
}

function publishingFromMemory(): boolean {
  return boardBackend() === "shared" && process.env.NODE_ENV === "development";
}

function boardPath(): string {
  const override = (process.env.FIREALERT_BOARD_FILE || "").trim();
  if (override) return override;
  return path.join(process.cwd(), "data", "live-board.json");
}

function fallbackPath(): string {
  return path.join(os.tmpdir(), "firealert-live-board.json");
}

async function readDisk(): Promise<SharedBoard | null> {
  for (const target of [boardPath(), fallbackPath()]) {
    try {
      return parseBoard(JSON.parse(await readFile(target, "utf8")));
    } catch {
      // Missing or unreadable. Try the next location.
    }
  }
  return null;
}

async function saveDisk(doc: SharedBoard | undefined): Promise<void> {
  if (!doc) return;
  const body = JSON.stringify(doc);
  try {
    await mkdir(path.dirname(boardPath()), { recursive: true });
    await writeFile(boardPath(), body);
    return;
  } catch {
    // The project directory can be read-only on a host. Keep a temp copy.
  }
  try {
    await writeFile(fallbackPath(), body);
  } catch {
    // A failed local copy must not block the heartbeat.
  }
}

async function hydrateFromDisk(): Promise<void> {
  if (diskTried) return;
  diskTried = true;
  if (cache) return;
  const doc = await readDisk();
  if (!doc) return;
  cache = { at: 0, doc };
  latestItems = doc.items;
  latestGateway = doc.gateway;
  latestIncidents = doc.incidents;
}

function seenMs(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function remember(doc: SharedBoard, trusted: boolean): void {
  const gateway = seenMs(latestGateway.seen_at) >= seenMs(doc.gateway.seen_at) ? latestGateway : doc.gateway;
  const items = seenMs(latestItems[0]?.received_at) >= seenMs(doc.items[0]?.received_at) ? latestItems : doc.items;
  const incidents = doc.incidents.length >= latestIncidents.length ? doc.incidents : latestIncidents;
  const merged: SharedBoard = { items, gateway, incidents };
  cache = { at: trusted ? Date.now() : (cache?.at ?? 0), doc: merged };
  latestItems = items;
  latestGateway = gateway;
  latestIncidents = incidents;
  if (trusted) itemsBased = true;
}

function mergePending(partial: Record<string, unknown>): void {
  if (Array.isArray(partial.items)) latestItems = partial.items as NormalizedTelemetry[];
  if (partial.gateway && typeof partial.gateway === "object") latestGateway = partial.gateway as GatewayLink;
  if (Array.isArray(partial.incidents)) latestIncidents = partial.incidents as Incident[];
  pending = { ...pending, ...partial };
  cache = {
    at: Date.now(),
    doc: { items: latestItems, gateway: latestGateway, incidents: latestIncidents },
  };
}

function armWriteBackoff(): void {
  writeFailStreak += 1;
  const delay = Math.min(FAIL_BACKOFF_MAX_MS, FAIL_BACKOFF_START_MS * 2 ** Math.min(writeFailStreak - 1, 4));
  writeBackoffUntil = Date.now() + delay;
}

function armReadBackoff(): void {
  if (Date.now() < readBackoffUntil) return;
  readBackoffUntil = Date.now() + FAIL_BACKOFF_START_MS;
}

async function flushPending(): Promise<void> {
  if (Object.keys(pending).length === 0) return;
  const now = Date.now();
  const slot = Math.floor(now / WRITE_GAP_MS);
  if (slot === lastWriteSlot || now < writeBackoffUntil) return;
  const body = pending;
  pending = {};
  try {
    await patchBoard(body);
    lastWriteSlot = slot;
    writeFailStreak = 0;
    writeBackoffUntil = 0;
    await saveDisk(cache?.doc);
  } catch (error) {
    pending = { ...body, ...pending };
    armWriteBackoff();
    console.error("[FIREALERT] shared log", error);
  }
}

function publishShared(partial: Record<string, unknown>): Promise<void> {
  mergePending(partial);
  const run = chain.then(flushPending);
  chain = run.catch(() => undefined);
  return run;
}

export function primeLive(items: NormalizedTelemetry[], gateway: GatewayLink): void {
  if (primed || !publishingFromMemory()) return;
  primed = true;
  const partial: Record<string, unknown> = {};
  if (items.length) {
    latestItems = capItems(items);
    itemsBased = true;
    partial.items = latestItems;
  }
  if (gateway.seen_at) partial.gateway = gateway;
  if (Object.keys(partial).length === 0) return;
  void publishShared(partial);
}

export function noteItems(items: NormalizedTelemetry[]): void {
  if (!publishingFromMemory()) return;
  itemsBased = true;
  void publishShared({ items: capItems(items) });
}

export function noteGateway(gateway: GatewayLink): void {
  if (!publishingFromMemory()) return;
  void publishShared({ gateway });
}

async function patchBoard(partial: Record<string, unknown>): Promise<void> {
  const headers = { "Content-Type": "application/json", "User-Agent": "FIREALERT-board" };
  const response = await fetch(BOARD_URL, {
    method: "PATCH",
    headers,
    body: JSON.stringify(partial),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) {
    const created = await fetch(BOARD_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ items: latestItems, gateway: latestGateway, incidents: latestIncidents, ...partial }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!created.ok) throw new Error(`shared log HTTP ${created.status}`);
    itemsBased = true;
    return;
  }
  if (!response.ok) throw new Error(`shared log HTTP ${response.status}`);
  itemsBased = true;
}

async function fetchBoard(): Promise<SharedBoard> {
  await hydrateFromDisk();
  if (Date.now() < readBackoffUntil) return cache?.doc ?? (await readDisk()) ?? emptyBoard();
  try {
    const response = await fetch(BOARD_URL, {
      cache: "no-store",
      headers: { "User-Agent": "FIREALERT-board" },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) {
      const doc = emptyBoard();
      remember(doc, true);
      return doc;
    }
    if (response.status === 429 || response.status >= 500) {
      armReadBackoff();
      console.error(`[FIREALERT] shared log HTTP ${response.status}`);
      return cache?.doc ?? (await readDisk()) ?? emptyBoard();
    }
    if (!response.ok) throw new Error(`shared log HTTP ${response.status}`);
    const doc = parseBoard(await response.json());
    readBackoffUntil = 0;
    remember(doc, true);
    return doc;
  } catch (error) {
    armReadBackoff();
    console.error("[FIREALERT] shared log", error);
    return cache?.doc ?? (await readDisk()) ?? emptyBoard();
  }
}

export async function readSharedBoard(): Promise<SharedBoard> {
  await hydrateFromDisk();
  if (cache && cache.at !== 0 && Date.now() - cache.at < READ_CACHE_MS) return cache.doc;
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
  await publishShared({ incidents });
}

export async function writeSharedGateway(gateway: GatewayLink): Promise<void> {
  if (boardBackend() === "redis") {
    await redisCommand(["SET", LINK_KEY, JSON.stringify(gateway)]);
    return;
  }
  if (boardBackend() !== "shared") return;
  await publishShared({ gateway });
}

export async function writeSharedItems(items: NormalizedTelemetry[]): Promise<void> {
  if (boardBackend() === "redis") {
    await redisCommand(["DEL", TELEMETRY_KEY]);
    if (items.length) await redisCommand(["RPUSH", TELEMETRY_KEY, ...items.slice(0, 250).map((item) => JSON.stringify(item))]);
    return;
  }
  if (boardBackend() !== "shared") return;
  itemsBased = true;
  await publishShared({ items: capItems(items) });
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
  if (boardBackend() !== "shared") return;
  if (!itemsBased) await readSharedBoard();
  const id = packetKey(entry);
  const base = itemsBased ? latestItems : [];
  const items = capItems([entry, ...base.filter((item) => packetKey(item) !== id)]);
  latestItems = items;
  // A failed read must not replace the stored log with a one-packet list.
  if (!itemsBased) return;
  await publishShared({ items });
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
