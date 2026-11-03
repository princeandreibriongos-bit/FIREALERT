import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { databaseUrl } from "@/lib/db/client";
import { parseLoginInput } from "@/lib/auth/login-input";
import { authenticateUser } from "@/lib/auth/users";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!databaseUrl()) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured on this server" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseLoginInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  let user;
  try {
    user = await authenticateUser(parsed.value);
  } catch (error) {
    console.error("[FIREALERT] login", error);
    return NextResponse.json({ ok: false, error: "Could not reach the user database" }, { status: 503 });
  }

  if (!user) {
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken({ sub: user.id, username: user.username });
  } catch (error) {
    console.error("[FIREALERT] login", error);
    return NextResponse.json({ ok: false, error: "SESSION_SECRET is not configured on this server" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true, username: user.username });
  response.cookies.set(AUTH_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
