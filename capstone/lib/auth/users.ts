import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users, type UserRow } from "../db/schema";
import { verifyPassword } from "./password";
import type { LoginInput } from "./login-input";

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
  return rows[0] ?? null;
}

export async function authenticateUser(input: LoginInput): Promise<UserRow | null> {
  const user = await findUserByUsername(input.username);
  if (!user) return null;
  const valid = await verifyPassword(input.password, user.passwordHash);
  return valid ? user : null;
}

export async function createUser(username: string, password: string): Promise<UserRow> {
  const { hashPassword } = await import("./password");
  const passwordHash = await hashPassword(password);
  const rows = await getDb()
    .insert(users)
    .values({ username, passwordHash })
    .returning();
  return rows[0];
}
