import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const ACCOUNTS = [
  { username: "admin", password: "admin123", role: "admin" },
  { username: "commel", password: "commel123", role: "commel" },
  { username: "responder", password: "responder123", role: "responder" },
] as const;

async function main() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL missing");
  const sql = neon(url);
  await sql`alter table users alter column role set default 'responder'`;
  for (const account of ACCOUNTS) {
    const hash = await bcrypt.hash(account.password, 12);
    const existing = await sql`select id from users where username = ${account.username} limit 1`;
    if (existing.length) {
      await sql`update users set password_hash = ${hash}, role = ${account.role} where username = ${account.username}`;
      console.log("updated", account.username, account.role);
    } else {
      await sql`insert into users (username, password_hash, role) values (${account.username}, ${hash}, ${account.role})`;
      console.log("created", account.username, account.role);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
