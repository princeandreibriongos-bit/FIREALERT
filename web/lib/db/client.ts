import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzleNeon<typeof schema>>;

let db: Database | null = null;

/** Pooled DATABASE_URL for Next.js / serverless query traffic. */
export function databaseUrl(): string | null {
  const url = (process.env.DATABASE_URL || "").trim();
  return url || null;
}

function neonHost(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export function getDb() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set (run neon env pull into web/.env.local)");
  if (!db) {
    if (neonHost(url)) {
      // HTTP neon() driver fits Next.js route handlers / Vercel serverless.
      db = drizzleNeon(neon(url), { schema });
    } else {
      const pool = new Pool({ connectionString: url, max: 5 });
      db = drizzlePg(pool, { schema }) as unknown as Database;
    }
  }
  return db;
}
