export function fmt(value: number | null | undefined, digits = 0, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

const manilaDateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const manilaClockFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const manilaDayFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function manilaTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return manilaDateTime.format(date);
}

export function manilaClock(now: number): string {
  return manilaClockFormat.format(now);
}

export function manilaDay(now: number): string {
  return manilaDayFormat.format(now);
}

export function ageLabel(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "unknown time";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function uiLabel(state: string): string {
  switch (state) {
    case "requested_not_installed":
      return "Requested · part not installed";
    case "installed":
      return "Installed";
    case "active":
      return "Active";
    default:
      return "Not installed";
  }
}

export function vecText(value: { x: number | null; y: number | null; z: number | null } | null, digits = 2): string {
  if (!value) return "—";
  return [value.x, value.y, value.z].map((n) => (n == null ? "—" : n.toFixed(digits))).join("  ");
}

export function vecMagnitude(value: { x: number | null; y: number | null; z: number | null } | null): number | null {
  if (!value || value.x == null || value.y == null || value.z == null) return null;
  return Math.hypot(value.x, value.y, value.z);
}
