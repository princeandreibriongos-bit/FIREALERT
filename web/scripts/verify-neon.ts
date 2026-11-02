import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

async function main() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL missing in web/.env.local");

  const sql = neon(url);
  const ping = await sql`select current_database() as db, now() as at`;
  console.log("postgres_ok", JSON.stringify(ping));

  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  `;
  if (!tables.length) throw new Error("users table missing — run npm run db:push");
  console.log("users_table_ok");

  const username = `probe_${Date.now().toString(36)}`;
  const password = `Probe-${Math.random().toString(36).slice(2)}-9x`;
  const passwordHash = await bcrypt.hash(password, 12);

  const inserted = await sql`
    insert into users (username, password_hash)
    values (${username}, ${passwordHash})
    returning id, username
  `;
  console.log("user_created", inserted[0]?.username);

  const rows = await sql`select id, username, password_hash from users where username = ${username} limit 1`;
  const valid = rows[0] && (await bcrypt.compare(password, rows[0].password_hash as string));
  if (!valid) throw new Error("auth verify failed");
  console.log("auth_ok", rows[0].username);

  await sql`delete from users where username = ${username}`;
  const gone = await sql`select id from users where username = ${username} limit 1`;
  if (gone.length) throw new Error("cleanup failed");
  console.log("cleanup_ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
