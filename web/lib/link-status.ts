export type GatewayWifi = "up" | "down";

export type GatewayLink = {
  wifi: GatewayWifi;
  ip: string | null;
  channel: number | null;
  mac: string | null;
  cellular: string | null;
  ssid: string | null;
  phase: string | null;
  trying: string | null;
  detail: string | null;
  seen_at: string | null;
};

export type LinkReport = {
  wifi: GatewayWifi;
  ip: string | null;
  channel: number | null;
  mac: string | null;
  cellular: string | null;
  ssid: string | null;
  phase: string | null;
  trying: string | null;
  detail: string | null;
};

const EMPTY: GatewayLink = {
  wifi: "down",
  ip: null,
  channel: null,
  mac: null,
  cellular: null,
  ssid: null,
  phase: null,
  trying: null,
  detail: null,
  seen_at: null,
};

const globalStore = globalThis as typeof globalThis & { __firealertLink?: GatewayLink };

function store(): GatewayLink {
  if (!globalStore.__firealertLink) globalStore.__firealertLink = { ...EMPTY };
  return globalStore.__firealertLink;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function optionalCode(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  const trimmed = text(value, max);
  if (!trimmed || trimmed === "-") return null;
  return trimmed;
}

export function parseLinkReport(body: unknown): { ok: true; value: LinkReport } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object" };
  }
  const record = body as Record<string, unknown>;
  if (record.wifi !== "up" && record.wifi !== "down") {
    return { ok: false, error: "wifi must be up or down" };
  }
  const ip = record.ip == null || record.ip === "" ? null : text(record.ip, 45);
  if (record.ip != null && record.ip !== "" && ip == null) return { ok: false, error: "ip is not valid" };
  const channel =
    record.channel == null ? null : typeof record.channel === "number" && Number.isInteger(record.channel) ? record.channel : undefined;
  if (channel === undefined || (channel != null && (channel < 0 || channel > 196))) {
    return { ok: false, error: "channel is not valid" };
  }
  const mac = record.mac == null || record.mac === "" ? null : text(record.mac, 17);
  if (record.mac != null && record.mac !== "" && mac == null) return { ok: false, error: "mac is not valid" };
  const cellular = record.cellular == null || record.cellular === "" ? null : text(record.cellular, 32);
  const ssidText = typeof record.ssid === "string" ? record.ssid.trim() : "";
  const ssid = ssidText && ssidText !== "-" && ssidText.length <= 32 ? ssidText : null;
  const phase = optionalCode(record.phase, 24);
  const trying = optionalCode(record.trying, 32);
  const detail = optionalCode(record.detail, 40);
  return { ok: true, value: { wifi: record.wifi, ip, channel, mac, cellular, ssid, phase, trying, detail } };
}

export function noteLink(report: LinkReport, seenAt = new Date().toISOString()): GatewayLink {
  const next: GatewayLink = { ...report, seen_at: seenAt };
  const current = store();
  Object.assign(current, next);
  return { ...current };
}

export function readLink(): GatewayLink {
  return { ...store() };
}

const HEARTBEAT_FRESH_MS = 18_000;
/** Packets land about every 3–5s; allow a few misses before the pill flips to stale. */
const WEARABLE_FRESH_MS = 45_000;

export type GatewayPhase = "up" | "down" | "waiting";
export type WearablePhase = "live" | "stale" | "waiting";

export function gatewayPhase(link: GatewayLink | null, now: number): GatewayPhase {
  if (!link?.seen_at) return "waiting";
  const seen = Date.parse(link.seen_at);
  if (Number.isNaN(seen) || now - seen > HEARTBEAT_FRESH_MS) return "waiting";
  return link.wifi === "up" ? "up" : "down";
}

function packetIsLive(receivedAt: string, now: number) {
  const at = Date.parse(receivedAt);
  if (Number.isNaN(at)) return false;
  return now - at <= WEARABLE_FRESH_MS;
}

export function wearablePhase(crew: { simulated: boolean; received_at: string }[], now: number): WearablePhase {
  const hardware = crew.filter((person) => !person.simulated);
  if (hardware.length === 0) return "waiting";
  if (hardware.some((person) => packetIsLive(person.received_at, now))) return "live";
  return "stale";
}

export function newestHardware<T extends { simulated: boolean; received_at: string }>(crew: T[]): T | null {
  return crew.filter((person) => !person.simulated).sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))[0] ?? null;
}

export type GatewayDiagnosis = {
  title: string;
  summary: string;
  likely: "usb" | "password" | "range" | "connecting" | "ok" | "config" | "unknown";
  steps: string[];
};

function detailLabel(detail: string | null | undefined): string | null {
  if (!detail) return null;
  switch (detail) {
    case "ok":
      return "joined";
    case "connecting":
      return "still joining";
    case "bad_password":
      return "auth rejected (often wrong password)";
    case "ssid_not_found":
      return "network name not found in the air";
    case "not_in_range":
      return "saved name is not visible nearby";
    case "no_saved_network":
      return "gateway has no saved Wi-Fi yet";
    case "scanning":
      return "scanning for saved networks";
    case "scan_failed":
      return "Wi-Fi scan failed";
    case "connection_lost":
      return "Wi-Fi dropped after joining";
    case "disconnected":
      return "disconnected before join finished";
    case "join_failed":
      return "join timed out";
    case "bridge_open":
      return "USB bridge opened; waiting for gateway lines";
    default:
      return detail.replaceAll("_", " ");
  }
}

/** Human diagnosis so "Waiting" is not confused with a bad password. */
export function diagnoseGateway(link: GatewayLink | null, now: number, activeSsid?: string | null): GatewayDiagnosis {
  const phase = gatewayPhase(link, now);
  const trying = link?.trying || activeSsid || null;
  const detail = link?.detail ?? null;
  const detailText = detailLabel(detail);

  if (phase === "up") {
    const name = link?.ssid || trying || "Wi-Fi";
    return {
      title: "Connected",
      summary: `Gateway is on ${name}${link?.ip ? ` at ${link.ip}` : ""}. Password and network name are working.`,
      likely: "ok",
      steps: ["If the wearable pill is still waiting, power the wrist node and keep both boards on the same 2.4 GHz network/channel."],
    };
  }

  if (phase === "waiting") {
    const heardBefore = Boolean(link?.seen_at);
    return {
      title: "Waiting for USB heartbeat",
      summary: heardBefore
        ? "The board has not heard from the gateway recently. This is a USB / bridge problem, not a Wi-Fi password problem."
        : "No gateway heartbeat yet. Until the USB bridge is running, the board cannot tell whether the password is right or wrong.",
      likely: "usb",
      steps: [
        "Plug the gateway (Node B) into this computer over USB.",
        "In web/, run npm run bridge (it auto-finds the gateway COM port; no COMx needed).",
        "Confirm the bridge window prints the chosen port and heartbeat or joining lines.",
        "Only after heartbeats appear should you treat Wi-Fi name/password as the suspect.",
      ],
    };
  }

  if (detail === "bad_password" || detail === "disconnected" || detail === "join_failed") {
    return {
      title: "Wi-Fi join failed",
      summary: `Gateway is talking over USB, but it could not join${trying ? ` “${trying}”` : ""}${detailText ? ` — ${detailText}` : ""}. Wrong password is the most common cause when the name is visible.`,
      likely: "password",
      steps: [
        "Use Show password and compare with the phone hotspot or router settings character by character.",
        "Save again after fixing the password so the bridge pushes wifi\\t… to the gateway.",
        "Hotspots: stay on 2.4 GHz / maximize compatibility; keep the phone awake.",
        "If the name itself might be wrong, check the next diagnosis after a rescan (not in range).",
      ],
    };
  }

  if (detail === "not_in_range" || detail === "ssid_not_found") {
    return {
      title: "Network not in range",
      summary: `USB link is fine. The gateway cannot see${trying ? ` “${trying}”` : " the saved name"} nearby — wrong SSID, 5 GHz-only, hotspot asleep, or out of range. This is usually not the password.`,
      likely: "range",
      steps: [
        "Confirm the exact Wi-Fi name (SSID) on the phone/router, including spaces and capitalization.",
        "Force 2.4 GHz / maximize compatibility on the hotspot.",
        "Stand closer and keep the hotspot screen on.",
        "On a new phone or router, save the new name/password on this Gateway page.",
      ],
    };
  }

  if (detail === "connecting" || detail === "scanning" || link?.phase === "connecting" || link?.phase === "scanning") {
    return {
      title: "Still connecting",
      summary: `Gateway is online over USB and is ${detailText || "joining"}${trying ? ` “${trying}”` : ""}. Wait a few seconds, then tap Check connection again.`,
      likely: "connecting",
      steps: [
        "Leave the bridge running.",
        "If this stays for more than ~20 seconds, re-check the password and that the hotspot is 2.4 GHz.",
      ],
    };
  }

  if (detail === "no_saved_network") {
    return {
      title: "Nothing saved on the gateway yet",
      summary: "USB works, but the gateway has no Wi-Fi credentials stored.",
      likely: "config",
      steps: ["Enter the hotspot or router name and password here, click Save, and keep npm run bridge running so it is pushed over USB."],
    };
  }

  return {
    title: "Wi-Fi down",
    summary: `Gateway heartbeat is fresh, but Wi-Fi is down${trying ? ` (trying ${trying})` : ""}${detailText ? ` — ${detailText}` : ""}.`,
    likely: "unknown",
    steps: [
      "Show password and confirm it matches the hotspot/router.",
      "Confirm 2.4 GHz and that the SSID matches exactly.",
      "Watch the bridge console for “could not join”, “not in range”, or “Wi-Fi OK”.",
    ],
  };
}
