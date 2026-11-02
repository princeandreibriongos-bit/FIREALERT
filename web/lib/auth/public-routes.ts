const BOARD_PREFIXES = [
  "/overview",
  "/sensors",
  "/crew",
  "/incidents",
  "/log",
  "/gateway",
  "/system",
];

export function isLandingPath(pathname: string): boolean {
  return pathname === "/";
}

export function isBoardPath(pathname: string): boolean {
  return BOARD_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPublicRequest(pathname: string, method: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/login") return true;
  if (pathname === "/api/auth/login" && method === "POST") return true;
  if (pathname === "/api/auth/session" && method === "GET") return true;
  if (pathname === "/api/auth/logout" && method === "POST") return true;

  // Wearable / gateway / USB bridge uplink (no browser session).
  if (pathname === "/api/telemetry" && method === "POST") return true;
  if (pathname === "/api/link" && method === "POST") return true;
  if (pathname === "/api/network" && method === "GET") return true;

  return false;
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login") || value === "/") {
    return "/overview";
  }
  return value;
}
