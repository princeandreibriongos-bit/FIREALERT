/** Station accounts. Crew-member roles (firefighter, officer) are separate. */
export type AccountRole = "commel" | "responder" | "admin";

const FIELD_PAGES = ["/overview", "/sensors", "/crew", "/log", "/gateway", "/system"];

export function parseAccountRole(value: unknown): AccountRole {
  if (value === "commel" || value === "dispatcher") return "commel";
  if (value === "responder") return "responder";
  if (value === "admin") return "admin";
  return "admin";
}

export function roleLabel(role: AccountRole): string {
  if (role === "commel") return "Commel";
  if (role === "responder") return "Local responder";
  return "Admin";
}

export function homeForRole(role: AccountRole): string {
  return role === "commel" ? "/incidents" : "/overview";
}

export function isFieldPage(pathname: string): boolean {
  return FIELD_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Commel logs calls only. Sensors, crew, packets, and the gateway stay on site. */
export function commelAllows(pathname: string, method: string): boolean {
  if (pathname === "/incidents" || pathname.startsWith("/incidents/")) return true;
  if (pathname.startsWith("/api/incidents")) return true;
  if (pathname.startsWith("/api/routes")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/board" && method === "GET") return true;
  return false;
}

export function sessionMayOpen(role: AccountRole, pathname: string, method: string): boolean {
  if (role !== "commel") return true;
  if (pathname.startsWith("/api/")) return commelAllows(pathname, method);
  if (isFieldPage(pathname)) return false;
  return commelAllows(pathname, method) || pathname === "/";
}
