import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** Pooled DATABASE_URL for Next.js / serverless query traffic. */
export function databaseUrl(): string | null {
  const url = (process.env.DATABASE_URL || "").trim();
  return url || null;
}

export function getDb() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set (run neon env pull into web/.env.local)");
  if (!db) {
    // HTTP neon() driver fits Next.js route handlers / Vercel serverless.
    const sql = neon(url);
    db = drizzle(sql, { schema });
  }
  return db;
}
