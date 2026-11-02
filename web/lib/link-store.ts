import { noteLink, readLink, type GatewayLink, type LinkReport } from "./link-status";
import { boardBackend, noteGateway, readRedisBoard, readSharedBoard, writeSharedGateway } from "./shared-board";

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
  if (kind === "memory" || (kind === "shared" && process.env.NODE_ENV === "development")) return readLink();
  if (kind === "redis") return (await readRedisBoard()).gateway;
  return (await readSharedBoard()).gateway;
}
