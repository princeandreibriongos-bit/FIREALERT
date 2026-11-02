import { eq } from "drizzle-orm";
import { databaseUrl, getDb } from "./db/client";
import { crewMembers, type CrewMemberRow } from "./db/schema";

export type CrewMember = {
  wearer_id: string;
  display_name: string;
  callsign: string;
  unit: string;
  role: string;
  active: boolean;
};

export const SAMPLE_ROSTER: CrewMember[] = [
  { wearer_id: "FF-01", display_name: "Rivera, A.", callsign: "FF-01", unit: "Alpha", role: "firefighter", active: true },
  { wearer_id: "FF-02", display_name: "Santos, M.", callsign: "FF-02", unit: "Alpha", role: "firefighter", active: true },
  { wearer_id: "FF-03", display_name: "Cruz, J.", callsign: "FF-03", unit: "Bravo", role: "firefighter", active: true },
  { wearer_id: "FF-04", display_name: "Reyes, K.", callsign: "FF-04", unit: "Bravo", role: "officer", active: true },
];

function rowToCrew(row: CrewMemberRow): CrewMember {
  return {
    wearer_id: row.wearerId,
    display_name: row.displayName,
    callsign: row.callsign,
    unit: row.unit,
    role: row.role,
    active: row.active,
  };
}

export async function listCrew(activeOnly = true): Promise<CrewMember[]> {
  if (!databaseUrl()) return SAMPLE_ROSTER.filter((member) => (activeOnly ? member.active : true));
  const db = getDb();
  const rows = activeOnly
    ? await db.select().from(crewMembers).where(eq(crewMembers.active, true))
    : await db.select().from(crewMembers);
  return rows.map(rowToCrew);
}

export async function seedSampleRoster(): Promise<{ upserted: number }> {
  if (!databaseUrl()) throw new Error("DATABASE_URL is not set");
  const db = getDb();
  let upserted = 0;
  for (const member of SAMPLE_ROSTER) {
    await db
      .insert(crewMembers)
      .values({
        wearerId: member.wearer_id,
        displayName: member.display_name,
        callsign: member.callsign,
        unit: member.unit,
        role: member.role,
        active: member.active,
      })
      .onConflictDoUpdate({
        target: crewMembers.wearerId,
        set: {
          displayName: member.display_name,
          callsign: member.callsign,
          unit: member.unit,
          role: member.role,
          active: member.active,
        },
      });
    upserted += 1;
  }

  return { upserted };
}
