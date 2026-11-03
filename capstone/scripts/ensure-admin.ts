import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { databaseUrl, getDb } from "../lib/db/client";
import { users } from "../lib/db/schema";

async function main() {
  if (!databaseUrl()) throw new Error("DATABASE_URL missing");
  const db = getDb();
  const passwordHash = await hashPassword("admin123");
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, "admin")).limit(1);
  if (existing.length) {
    await db.update(users).set({ passwordHash, role: "admin" }).where(eq(users.username, "admin"));
    console.log("admin_updated");
    return;
  }
  await db.insert(users).values({ username: "admin", passwordHash, role: "admin", displayName: "Station admin" });
  console.log("admin_created");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
