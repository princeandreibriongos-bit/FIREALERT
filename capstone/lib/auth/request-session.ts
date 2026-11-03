import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME } from "./constants";
import { verifySessionToken, type SessionPayload } from "./session";

export async function getRequestSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
