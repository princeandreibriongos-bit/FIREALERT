import { NextResponse } from "next/server";
import { buildSampleCrew } from "@/lib/demo-data";
import { normalizeTelemetry } from "@/lib/telemetry-core";
import { replaceTelemetry } from "@/lib/telemetry-store";
import { signatureStatus } from "@/lib/verify";

export const dynamic = "force-dynamic";

export async function POST() {
  const entries = buildSampleCrew().flatMap(({ raw, receivedAt }) => {
    const entry = normalizeTelemetry(raw, receivedAt, signatureStatus);
    return entry ? [entry] : [];
  });
  replaceTelemetry(entries);
  return NextResponse.json({ ok: true, count: entries.length });
}
