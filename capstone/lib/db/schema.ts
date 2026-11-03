import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Station operators who take civilian calls and monitor the board. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** dispatcher | admin | viewer */
  role: text("role").notNull().default("dispatcher"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/**
 * Civilian-reported call logged at New Makati Central Fire Station.
 * Responders go on-site; station users monitor remotely when the site node has uplink.
 */
export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  address: text("address").notNull(),
  notes: text("notes").notNull().default(""),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  /** open | closed */
  status: text("status").notNull().default("open"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByUsername: text("created_by_username"),
  /** Wall-clock of the civilian call (date + time). */
  reportedAt: timestamp("reported_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
  callerName: text("caller_name"),
  callerContact: text("caller_contact"),
});

/** On-site wearable roster (sample crew for now). */
export const crewMembers = pgTable("crew_members", {
  wearerId: text("wearer_id").primaryKey(),
  displayName: text("display_name").notNull(),
  callsign: text("callsign").notNull(),
  unit: text("unit").notNull().default("Alpha"),
  /** firefighter | officer | medic */
  role: text("role").notNull().default("firefighter"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/** Which crew is assigned to which incident on site. */
export const incidentAssignments = pgTable(
  "incident_assignments",
  {
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    wearerId: text("wearer_id")
      .notNull()
      .references(() => crewMembers.wearerId, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.incidentId, table.wearerId] })],
);

/**
 * Field gateway / local node at the incident site.
 * Telemetry lands here first; cloud sync only when internet is up.
 */
export const localNodes = pgTable("local_nodes", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  siteName: text("site_name"),
  incidentId: text("incident_id").references(() => incidents.id, { onDelete: "set null" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }),
  internetUp: boolean("internet_up").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/**
 * Sensor / wearable packets.
 * sync_status: local (on-site only) → pending (queued) → cloud (visible at station).
 */
export const telemetryPackets = pgTable("telemetry_packets", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: text("incident_id").references(() => incidents.id, { onDelete: "set null" }),
  wearerId: text("wearer_id").notNull(),
  nodeId: text("node_id").references(() => localNodes.id, { onDelete: "set null" }),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  sequence: integer("sequence"),
  gateway: text("gateway"),
  fallState: text("fall_state"),
  signatureStatus: text("signature_status"),
  payload: jsonb("payload").notNull(),
  /** local | pending | cloud */
  syncStatus: text("sync_status").notNull().default("local"),
  syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type CrewMemberRow = typeof crewMembers.$inferSelect;
export type TelemetryPacketRow = typeof telemetryPackets.$inferSelect;
export type LocalNodeRow = typeof localNodes.$inferSelect;
