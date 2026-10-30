import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const url = (process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is not set in web/.env.local");
  process.exit(1);
}

const crewMembers = pgTable("crew_members", {
  wearerId: text("wearer_id").primaryKey(),
  displayName: text("display_name").notNull(),
  callsign: text("callsign").notNull(),
  unit: text("unit").notNull().default("Alpha"),
  role: text("role").notNull().default("firefighter"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

const localNodes = pgTable("local_nodes", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  siteName: text("site_name"),
  internetUp: boolean("internet_up").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

const SAMPLE = [
  { wearerId: "FF-01", displayName: "Rivera, A.", callsign: "FF-01", unit: "Alpha", role: "firefighter", active: true },
  { wearerId: "FF-02", displayName: "Santos, M.", callsign: "FF-02", unit: "Alpha", role: "firefighter", active: true },
  { wearerId: "FF-03", displayName: "Cruz, J.", callsign: "FF-03", unit: "Bravo", role: "firefighter", active: true },
  { wearerId: "FF-04", displayName: "Reyes, K.", callsign: "FF-04", unit: "Bravo", role: "officer", active: true },
];

const db = drizzle(neon(url));

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
