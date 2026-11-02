import { noteLink, readLink, type GatewayLink, type LinkReport } from "./link-status";
import { boardBackend, noteGateway, readRedisBoard, readSharedBoard, writeSharedGateway } from "./shared-board";

function newerLink(local: GatewayLink, remote: GatewayLink): GatewayLink {
  const localAt = Date.parse(local.seen_at ?? "");
  const remoteAt = Date.parse(remote.seen_at ?? "");
  if (Number.isNaN(localAt)) return Number.isNaN(remoteAt) ? local : remote;
  if (Number.isNaN(remoteAt)) return local;
  return localAt >= remoteAt ? local : remote;
}

export async function saveLinkReport(report: LinkReport, seenAt = new Date().toISOString()): Promise<GatewayLink> {
  const saved = noteLink(report, seenAt);
  const kind = boardBackend();
  if (kind === "memory") return saved;
  try {
    if (kind === "shared" && process.env.NODE_ENV === "development") noteGateway(saved);
    else await writeSharedGateway(saved);
  } catch (error) {
    console.error("[FIREALERT] shared log", error);
  }
  return saved;
}

export async function loadGateway(): Promise<GatewayLink> {
  const kind = boardBackend();
  const local = readLink();
  if (kind === "memory") return local;
  try {
    const remote = kind === "redis" ? (await readRedisBoard()).gateway : (await readSharedBoard()).gateway;
    return newerLink(local, remote);
  } catch (error) {
    console.error("[FIREALERT] gateway read", error);
    return local;
  }
}
