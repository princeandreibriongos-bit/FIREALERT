import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const webRoot = dirname(fileURLToPath(import.meta.url)) + "/..";
config({ path: join(webRoot, ".env.local") });

const url = (process.env.DATABASE_URL || "").trim();
if (!url) {
  console.log("no DATABASE_URL");
  process.exit(1);
}
const sql = neon(url);
const rows = await sql`
  select received_at
  from telemetry_packets
  where received_at > now() - interval '30 minutes'
  order by received_at desc
  limit 120
`;
if (!rows.length) {
  console.log("no_recent_packets");
  process.exit(0);
}
const times = rows.map((r) => new Date(String(r.received_at)).getTime()).reverse();
const gaps: number[] = [];
for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
gaps.sort((a, b) => a - b);
const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const at = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
console.log("n=" + gaps.length);
console.log("latest=" + new Date(times[times.length - 1]).toISOString());
console.log(
  "gap_ms min=" +
    gaps[0] +
    " p50=" +
    at(0.5) +
    " avg=" +
    Math.round(avg) +
    " p90=" +
    at(0.9) +
    " max=" +
    gaps[gaps.length - 1],
);
