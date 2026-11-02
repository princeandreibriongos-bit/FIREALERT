import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });
const sql = neon((process.env.DATABASE_URL || "").trim());
const rows = await sql`
  select received_at, sequence,
         payload->'activity' as activity,
         payload->'mpu6050'->>'installed' as mpu_installed,
         payload->'mpu6050'->'accel_g'->>'x' as ax
  from telemetry_packets
  order by received_at desc
  limit 5
`;
for (const row of rows) {
  console.log(
    String(row.received_at),
    "seq=" + row.sequence,
    "mpu=" + row.mpu_installed,
    "ax=" + row.ax,
    "activity=" + JSON.stringify(row.activity),
  );
}
