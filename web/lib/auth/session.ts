import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { AUTH_COOKIE_NAME, SESSION_MAX_AGE_SEC } from "./constants";

export type SessionPayload = {
  sub: string;
  username: string;
};

function sessionSecret(): Uint8Array | null {
  const secret = (process.env.SESSION_SECRET || "").trim();
  if (secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const username = typeof payload.username === "string" ? payload.username : "";
    if (!sub || !username) return null;
    return { sub, username };
  } catch {
    return null;
  }
}

export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === AUTH_COOKIE_NAME) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export function sessionCookieOptions(maxAgeSec = SESSION_MAX_AGE_SEC) {
  // Secure cookies on real HTTPS hosts (Vercel). Local `next start` over http://localhost
  // must stay non-Secure or browsers will drop the session cookie.
  const secure =
    process.env.COOKIE_SECURE === "1" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL === "1");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSec,
  };
}
