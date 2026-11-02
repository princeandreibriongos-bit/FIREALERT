import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

async function main() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL missing");
  const sql = neon(url);
  const hash = await bcrypt.hash("admin123", 12);
  const existing = await sql`select id from users where username = 'admin' limit 1`;
  if (existing.length) {
    await sql`update users set password_hash = ${hash} where username = 'admin'`;
    console.log("admin_updated");
    return;
  }
  await sql`insert into users (username, password_hash) values ('admin', ${hash})`;
  console.log("admin_created");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
