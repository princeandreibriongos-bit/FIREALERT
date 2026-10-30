import { databaseUrl, getDb } from "./db/client";
import { localNodes, telemetryPackets } from "./db/schema";
import type { NormalizedTelemetry } from "./telemetry-core";

const DEFAULT_NODE_ID = "site-local-1";

/**
 * Persist a packet for the local-first → cloud workflow.
 * - Always lands as sync_status=local on the site node.
 * - When DATABASE_URL points at Neon (station cloud) and FIREALERT_CLOUD_SYNC is not "off",
 *   mark it cloud immediately so the station board can read it.
 */
export async function persistTelemetryPacket(entry: NormalizedTelemetry, incidentId: string | null = null): Promise<void> {
  if (!databaseUrl()) return;

  const cloudSync = (process.env.FIREALERT_CLOUD_SYNC || "on").trim().toLowerCase() !== "off";
  const nodeId = (process.env.FIREALERT_NODE_ID || DEFAULT_NODE_ID).trim() || DEFAULT_NODE_ID;
  const now = new Date().toISOString();
  const db = getDb();

  await db
    .insert(localNodes)
    .values({
      id: nodeId,
      label: "Incident-site gateway",
      siteName: "On-scene local node",
      incidentId,
      lastSeenAt: now,
      internetUp: cloudSync,
    })
    .onConflictDoUpdate({
      target: localNodes.id,
      set: {
        lastSeenAt: now,
        internetUp: cloudSync,
        incidentId: incidentId ?? undefined,
      },
    });

  await db.insert(telemetryPackets).values({
    incidentId,
    wearerId: entry.wearer_id,
    nodeId,
    receivedAt: entry.received_at,
    sequence: entry.sequence,
    gateway: entry.gateway,
    fallState: entry.fall.state,
    signatureStatus: entry.signature.status,
    payload: entry,
    syncStatus: cloudSync ? "cloud" : "local",
    syncedAt: cloudSync ? now : null,
  });
}

export async function markPendingPacketsCloud(limit = 100): Promise<number> {
  if (!databaseUrl()) return 0;
  const db = getDb();
  const { sql } = await import("drizzle-orm");
  const result = await db.execute(sql`
    update telemetry_packets
    set sync_status = 'cloud', synced_at = now()
    where id in (
      select id from telemetry_packets
      where sync_status in ('local', 'pending')
      order by received_at asc
      limit ${limit}
    )
  `);
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}
