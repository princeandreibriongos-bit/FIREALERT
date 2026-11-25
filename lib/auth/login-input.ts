export type LoginInput = { username: string; password: string };

export function parseLoginInput(body: unknown): { ok: true; value: LoginInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Expected a JSON object" };
  }
  const username = typeof (body as { username?: unknown }).username === "string" ? (body as { username: string }).username.trim() : "";
  const password = typeof (body as { password?: unknown }).password === "string" ? (body as { password: string }).password : "";
  if (!username || !password) {
    return { ok: false, error: "Username and password are required" };
  }
  if (username.length < 3 || username.length > 32) {
    return { ok: false, error: "Username must be 3–32 characters" };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return { ok: false, error: "Username may only use letters, numbers, dots, dashes, and underscores" };
  }
  if (password.length < 8 || password.length > 128) {
    return { ok: false, error: "Password must be 8–128 characters" };
  }
  return { ok: true, value: { username, password } };
}
