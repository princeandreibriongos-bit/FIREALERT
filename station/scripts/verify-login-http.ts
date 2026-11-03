import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

async function main() {
  const base = (process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL missing");

  const sql = neon(url);
  const username = `http_${Date.now().toString(36)}`;
  const password = `Http-${Math.random().toString(36).slice(2)}-9x`;
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`insert into users (username, password_hash) values (${username}, ${passwordHash})`;

  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const loginJson = (await login.json()) as { ok?: boolean; username?: string; error?: string };
    if (!login.ok || !loginJson.ok) {
      throw new Error(`login failed: ${login.status} ${loginJson.error ?? ""}`);
    }
    const cookie = login.headers.getSetCookie?.() ?? [];
    const session = cookie.find((c) => c.startsWith("firealert_session="));
    if (!session) throw new Error("missing firealert_session cookie");
    console.log("login_http_ok", loginJson.username);

    const me = await fetch(`${base}/api/auth/session`, {
      headers: { Cookie: session.split(";")[0] },
    });
    const meJson = (await me.json()) as { ok?: boolean; username?: string };
    if (!me.ok || !meJson.ok || meJson.username !== username) {
      throw new Error("session check failed");
    }
    console.log("session_http_ok", meJson.username);
  } finally {
    await sql`delete from users where username = ${username}`;
    console.log("cleanup_ok");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
