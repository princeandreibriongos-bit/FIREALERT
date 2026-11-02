/**
 * Export MPU-6050 samples from Neon into a labeled CSV for Edge Impulse / HAR.
 *
 * Examples (run from web/):
 *   npm run dataset:list
 *   npm run dataset:export -- --label idle --last 3m
 *   npm run dataset:export -- --label walk --from "2026-10-31 16:00" --to "2026-10-31 16:03"
 *   npm run dataset:export -- --label fall --from "2026-10-31T16:10:00+08:00" --to "2026-10-31T16:12:00+08:00"
 *
 * Default timezone for bare "YYYY-MM-DD HH:MM" times is +08:00 (Asia/Manila).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..");
config({ path: join(webRoot, ".env.local") });
config({ path: join(webRoot, ".env") });

type Args = {
  label: string;
  from: string | null;
  to: string | null;
  last: string | null;
  wearer: string | null;
  out: string | null;
  list: boolean;
  limit: number;
  help: boolean;
};

type MpuPayload = {
  ok?: boolean;
  accel_g?: { x?: number | null; y?: number | null; z?: number | null } | null;
  gyro_dps?: { x?: number | null; y?: number | null; z?: number | null } | null;
};

type Row = {
  received_at: string;
  sequence: number | null;
  wearer_id: string;
  mpu: MpuPayload | null;
};

function printHelp() {
  console.log(`FIREALERT MPU CSV export

Usage:
  npm run dataset:list
  npm run dataset:export -- --label <name> --last <duration>
  npm run dataset:export -- --label <name> --from "<time>" --to "<time>"

Options:
  --label <name>     Activity label (idle, walk, run, jump, fall, ...)
  --from <time>      Start (ISO or "YYYY-MM-DD HH:MM" in +08:00)
  --to <time>        End (same formats)
  --last <duration>  e.g. 90s, 3m, 10m (instead of --from/--to)
  --wearer <id>      Filter wearer_id (default: all)
  --out <path>       Output CSV path (default: datasets/mpu/<label>-<stamp>.csv)
  --limit <n>        Max rows (default 200000)
  --list             Show recent telemetry windows (no export)
  --help             This text

CSV columns (Edge Impulse time-series):
  timestamp,accX,accY,accZ,gyrX,gyrY,gyrZ
  Label is set in the Edge Impulse upload UI (not a CSV column).
`);
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    label: "",
    from: null,
    to: null,
    last: null,
    wearer: null,
    out: null,
    list: false,
    limit: 200000,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null || v.startsWith("--")) throw new Error(`Missing value after ${a}`);
      return v;
    };
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--list") out.list = true;
    else if (a === "--label") out.label = next().trim();
    else if (a === "--from") out.from = next();
    else if (a === "--to") out.to = next();
    else if (a === "--last") out.last = next();
    else if (a === "--wearer") out.wearer = next();
    else if (a === "--out") out.out = next();
    else if (a === "--limit") out.limit = Number(next());
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function parseDurationMs(raw: string): number {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([smh])$/i);
  if (!m) throw new Error(`Bad --last value "${raw}" (use 90s, 3m, or 1h)`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "s") return Math.round(n * 1000);
  if (unit === "m") return Math.round(n * 60_000);
  return Math.round(n * 3_600_000);
}

/** Bare local wall times are treated as UTC+08:00. */
function parseWhen(raw: string): Date {
  const s = raw.trim();
  if (!s) throw new Error("Empty time");
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const normalized = s.replace(" ", "T");
    const withSec = /:\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}:00`;
    const d = new Date(`${withSec}+08:00`);
    if (Number.isNaN(d.getTime())) throw new Error(`Bad time: ${raw}`);
    return d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Bad time: ${raw}`);
  return d;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function stampForFile(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

async function listRecent(sql: ReturnType<typeof neon>, limit: number) {
  const summary = await sql`
    select
      count(*)::int as n,
      min(received_at) as first_at,
      max(received_at) as last_at
    from telemetry_packets
  `;
  const buckets = await sql`
    select
      date_trunc('minute', received_at) as minute,
      count(*)::int as n,
      count(*) filter (
        where (payload->'mpu6050'->>'installed') = 'true'
           or (payload->'mpu6050'->>'ok') = 'true'
           or jsonb_typeof(payload->'mpu6050'->'accel_g'->'x') = 'number'
      )::int as mpu_ok
    from telemetry_packets
    where received_at > now() - interval '6 hours'
    group by 1
    order by 1 desc
    limit ${limit}
  `;
  console.log("telemetry_total=" + (summary[0]?.n ?? 0));
  console.log("first_at=" + (summary[0]?.first_at ?? "none"));
  console.log("last_at=" + (summary[0]?.last_at ?? "none"));
  console.log("recent_minutes (local wall ≈ UTC+8):");
  for (const b of buckets) {
    const minute = new Date(String(b.minute));
    const local = minute.toLocaleString("en-PH", { timeZone: "Asia/Manila", hour12: false });
    console.log(`  ${local}  packets=${b.n}  mpu_ok=${b.mpu_ok}`);
  }
  if (!buckets.length) {
    console.log("  (no packets in the last 6 hours — run bridge + wearable, then record)");
  }
}

async function exportCsv(args: Args) {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) {
    console.error("DATABASE_URL missing. Put it in web/.env.local (neon env pull).");
    process.exit(1);
  }
  const sql = neon(url);

  if (args.list || args.help) {
    if (args.help) printHelp();
    if (args.list) await listRecent(sql, 40);
    return;
  }

  if (!args.label) {
    console.error("Need --label (e.g. idle, walk, run, jump, fall). Use --help.");
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(args.label)) {
    console.error("Label must be letters/numbers/_/- only.");
    process.exit(1);
  }

  let from: Date;
  let to: Date;
  if (args.last) {
    to = new Date();
    from = new Date(to.getTime() - parseDurationMs(args.last));
  } else if (args.from && args.to) {
    from = parseWhen(args.from);
    to = parseWhen(args.to);
  } else {
    console.error("Provide --last <duration> OR both --from and --to.");
    process.exit(1);
  }
  if (to.getTime() <= from.getTime()) {
    console.error("--to must be after --from");
    process.exit(1);
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const rows = (await sql`
    select
      received_at,
      sequence,
      wearer_id,
      payload->'mpu6050' as mpu
    from telemetry_packets
    where received_at >= ${fromIso}::timestamptz
      and received_at <= ${toIso}::timestamptz
      and (${args.wearer}::text is null or wearer_id = ${args.wearer})
    order by received_at asc
    limit ${args.limit}
  `) as Row[];

  // Edge Impulse requires a column named exactly "timestamp" (ms).
  // Do not include a label column — set the label in the upload UI.
  const lines: string[] = ["timestamp,accX,accY,accZ,gyrX,gyrY,gyrZ"];
  let skipped = 0;
  let firstTs: number | null = null;
  for (const row of rows) {
    const mpu = row.mpu;
    const ax = num(mpu?.accel_g?.x);
    const ay = num(mpu?.accel_g?.y);
    const az = num(mpu?.accel_g?.z);
    const gx = num(mpu?.gyro_dps?.x);
    const gy = num(mpu?.gyro_dps?.y);
    const gz = num(mpu?.gyro_dps?.z);
    if (ax == null || ay == null || az == null || gx == null || gy == null || gz == null) {
      skipped += 1;
      continue;
    }
    const absTs = new Date(row.received_at).getTime();
    if (firstTs == null) firstTs = absTs;
    // Relative ms from start of this take — EI parses this reliably.
    const ts = absTs - firstTs;
    lines.push(
      [String(ts), ax.toFixed(6), ay.toFixed(6), az.toFixed(6), gx.toFixed(6), gy.toFixed(6), gz.toFixed(6)].join(
        ",",
      ),
    );
  }

  // Edge Impulse auto-labels files named: <label>.<unique-id>.csv
  const outPath = resolve(
    args.out
      ? args.out
      : join(repoRoot, "datasets", "mpu", `${args.label}.${stampForFile()}.csv`),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  const kept = lines.length - 1;
  console.log(`label=${args.label}`);
  console.log(`from=${fromIso}`);
  console.log(`to=${toIso}`);
  console.log(`packets_seen=${rows.length}`);
  console.log(`mpu_rows_written=${kept}`);
  console.log(`skipped_no_mpu=${skipped}`);
  console.log(`out=${outPath}`);
  if (kept === 0) {
    console.log("No MPU rows in that window. Run: npm run dataset:list");
    process.exit(2);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help && !args.list) {
    printHelp();
    process.exit(0);
  }
  await exportCsv(args);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
