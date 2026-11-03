import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { getDb } from "../lib/db/client";
import { crewMembers, localNodes } from "../lib/db/schema";

if (!(process.env.DATABASE_URL || "").trim()) {
  console.error("DATABASE_URL is not set in capstone/.env.local");
  process.exit(1);
}

const db = getDb();

const SAMPLE = [
  { wearerId: "FF-01", displayName: "Rivera, A.", callsign: "FF-01", unit: "Alpha", role: "firefighter", active: true },
  { wearerId: "FF-02", displayName: "Santos, M.", callsign: "FF-02", unit: "Alpha", role: "firefighter", active: true },
  { wearerId: "FF-03", displayName: "Cruz, J.", callsign: "FF-03", unit: "Bravo", role: "firefighter", active: true },
  { wearerId: "FF-04", displayName: "Reyes, K.", callsign: "FF-04", unit: "Bravo", role: "officer", active: true },
];

for (const member of SAMPLE) {
  await db
    .insert(crewMembers)
    .values(member)
    .onConflictDoUpdate({
      target: crewMembers.wearerId,
      set: {
        displayName: member.displayName,
        callsign: member.callsign,
        unit: member.unit,
        role: member.role,
        active: member.active,
      },
    });
}

await db
  .insert(localNodes)
  .values({
    id: "site-local-1",
    label: "Incident-site gateway",
    siteName: "On-scene local node",
    internetUp: false,
  })
  .onConflictDoNothing();

console.log(`Seeded ${SAMPLE.length} crew members + local node site-local-1`);
