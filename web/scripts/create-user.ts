import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { parseLoginInput } from "../lib/auth/login-input.ts";
import { databaseUrl } from "../lib/db/client.ts";
import { createUser, findUserByUsername } from "../lib/auth/users.ts";

const args = process.argv.slice(2);
const username = args[0];
const password = args[1];

if (!databaseUrl()) {
  console.error("DATABASE_URL is not set. Add it to web/.env.local first.");
  process.exit(1);
}

const parsed = parseLoginInput({ username: username ?? "", password: password ?? "" });
if (!parsed.ok) {
  console.error(parsed.error);
  console.error("Usage: npm run user:create -- <username> <password>");
  process.exit(1);
}

const existing = await findUserByUsername(parsed.value.username);
if (existing) {
  console.error(`User "${parsed.value.username}" already exists.`);
  process.exit(1);
}

const user = await createUser(parsed.value.username, parsed.value.password);
console.log(`Created user "${user.username}" (${user.id}).`);
