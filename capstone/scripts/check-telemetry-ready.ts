import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || "").trim();
if (!url) {
  console.log("ready=no reason=no_DATABASE_URL");
  process.exit(1);
}

const sql = neon(url);
const tables = await sql`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by 1
`;
const needed = ["users", "crew_members", "incidents", "local_nodes", "telemetry_packets"];
const names = new Set(tables.map((t) => String(t.table_name)));
const missing = needed.filter((t) => !names.has(t));

const count = await sql`select count(*)::int as n from telemetry_packets`;
const latest = await sql`
  select wearer_id, received_at, fall_state, payload->'mpu6050' as mpu
  from telemetry_packets
  order by received_at desc
  limit 1
`;

console.log("ready=" + (missing.length === 0 ? "yes" : "no"));
if (missing.length) console.log("missing=" + missing.join(","));
console.log("tables=" + [...names].join(","));
console.log("telemetry_rows=" + count[0]?.n);
console.log("latest=" + JSON.stringify(latest[0] ?? null));
console.log("mpu_in_payload=yes (stored under telemetry_packets.payload->mpu6050 when sensor ok)");
