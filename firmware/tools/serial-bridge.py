"""Forward Node B serial JSON lines to the local Next.js API.

Windows Firewall often blocks the ESP32 from POSTing to this PC.
The gateway already prints each payload on USB serial; this script
replays those objects to http://localhost:3000/api/telemetry.
The local API then copies the same readings to the hosted board.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import serial
from serial.tools import list_ports

LOCAL_ORIGIN = "http://127.0.0.1:3000"
# The dashboard in this project reads the shared log. The hosted board is what
# writes that log. Localhost alone stays on the PC and never turns this page live.
# Hosted is first so a dead localhost cannot hold the heartbeat past the fresh window.
HOSTED_ORIGIN = "https://firealert-three.vercel.app"
API_URL = f"{LOCAL_ORIGIN}/api/telemetry"
LINK_URL = f"{LOCAL_ORIGIN}/api/link"
API_URLS = [f"{HOSTED_ORIGIN}/api/telemetry", API_URL]
LINK_URLS = [f"{HOSTED_ORIGIN}/api/link", LINK_URL]
# New firmware adds phase/trying/detail; older builds still match without them.
HEARTBEAT = re.compile(
    r"\[node-b\] heartbeat wifi=(up|down) ip=(\S+) ch=(\d+) mac=([0-9A-Fa-f:]+)"
    r"(?: cellular=(\S+))?(?: ssid=(.*?))?"
    r"(?: phase=(\S+))?(?: trying=(.*?))?(?: detail=(\S+))?$"
)
JOIN_FAIL = re.compile(
    r"\[node-b\] could not join (.+?) \(status (\d+)(?: detail=(\S+))?\)\s*$"
)
JOINING = re.compile(r"\[node-b\] joining (.+)\s*$")
NOT_IN_RANGE = re.compile(r"\[node-b\] none of the saved networks are in range:")
WIFI_OK = re.compile(r"\[node-b\] Wi-Fi OK\s+SSID=(.+?)\s+IP=")
NO_ROUTER = re.compile(r"\[node-b\] no router yet")
BAUD = 115200
NETWORK_PATH = Path(__file__).resolve().parent / "data" / "network.json"
PORT_MEMORY_PATH = Path(__file__).resolve().parent / "data" / "bridge-port.json"
# Prefer the known Node B USB serial from NEW-PC.md; COM numbers change per PC/device.
KNOWN_GATEWAY_SERIALS = {"14C19FC857D8"}
KNOWN_WEARABLE_SERIALS = {"B81F3FD818EC"}
PROBE_SECONDS = 6.0
WAIT_RETRY_SEC = 2.0
# A port that prints [node-a] is the wearable. Do not sit on it.
WEARABLE_SKIP_SEC = 45.0
# A quiet extra port gets another chance soon; reopening also resets the ESP.
SILENT_SKIP_SEC = 8.0
SILENT_GIVE_UP_SEC = 12.0

STATUS_DETAIL = {
    "1": "ssid_not_found",
    "4": "bad_password",
    "5": "connection_lost",
    "6": "disconnected",
}


def normalize_serial(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^0-9A-Fa-f]", "", value).upper()


def port_serial(port: object) -> str:
    return normalize_serial(getattr(port, "serial_number", None) or "")


def is_gateway_candidate(port: object) -> bool:
    """Accept Espressif native USB and the UART bridges used on ESP32 DevKits.

    Replacement boards often enumerate as CH9102 (1A86:55D4) rather than CH343.
    A remembered COM number is not an identity, so the VID check has to be wide
    and the [node-b] probe decides which port is actually the gateway.
    """
    vid = getattr(port, "vid", None)
    if vid in (0x303A, 0x1A86, 0x10C4, 0x0403):
        return True  # Espressif, WCH (CH340/CH343/CH9102), CP210x, FTDI
    hwid = (getattr(port, "hwid", "") or "").upper().replace(" ", "")
    return any(tag in hwid for tag in ("VID:PID=303A:", "VID:PID=1A86:", "VID:PID=10C4:", "VID:PID=0403:", "VID_303A", "VID_1A86", "VID_10C4", "VID_0403"))


def list_esp32_ports() -> list:
    return [port for port in list_ports.comports() if is_gateway_candidate(port)]


def remember_port(device: str) -> None:
    try:
        PORT_MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        PORT_MEMORY_PATH.write_text(json.dumps({"port": device}, indent=2) + "\n", encoding="utf-8")
    except OSError as exc:
        print(f"could not remember {device}: {exc}", flush=True)


def recalled_port() -> str | None:
    try:
        data = json.loads(PORT_MEMORY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    port = data.get("port")
    return port if isinstance(port, str) and port.strip() else None


def open_quiet(device: str, timeout: float = 0.3) -> serial.Serial:
    ser = serial.Serial()
    ser.port = device
    ser.baudrate = BAUD
    ser.timeout = timeout
    ser.dtr = False
    ser.rts = False
    ser.open()
    return ser


def probe_is_gateway(device: str) -> bool | None:
    """Return True if serial shows [node-b], False for [node-a], None if quiet/unknown."""
    try:
        ser = open_quiet(device)
    except serial.SerialException as exc:
        print(f"probe {device} skipped: {exc}", flush=True)
        return None
    buf = b""
    deadline = time.time() + PROBE_SECONDS
    try:
        while time.time() < deadline:
            chunk = ser.read(256)
            if chunk:
                buf += chunk
                if b"[node-b]" in buf:
                    return True
                if b"[node-a]" in buf:
                    return False
    finally:
        try:
            ser.close()
        except serial.SerialException:
            pass
    return None


def describe_ports(ports: list) -> str:
    parts: list[str] = []
    for port in ports:
        serial_no = port_serial(port) or "?"
        parts.append(f"{port.device} (USB SN {serial_no})")
    return ", ".join(parts) if parts else "(none)"


class Rescan(Exception):
    """The open port is not the gateway. Caller should try another one."""

    def __init__(self, port: str, reason: str) -> None:
        super().__init__(reason)
        self.port = port
        self.reason = reason


def choose_among(ports: list, probe=probe_is_gateway, remembered: str | None = None) -> str | None:
    """Pick the gateway COM port. A remembered port is only a tie-break.

    The last bug was trusting bridge-port.json or the only plugged-in board.
    Windows reuses COM numbers, so that port is often the wearable, and the
    gateway then never shows up on the board.
    """
    if not ports:
        return None

    by_gateway_sn = [p for p in ports if port_serial(p) in KNOWN_GATEWAY_SERIALS]
    if by_gateway_sn:
        print(f"Gateway USB serial on {by_gateway_sn[0].device}", flush=True)
        return by_gateway_sn[0].device

    candidates = [p for p in ports if port_serial(p) not in KNOWN_WEARABLE_SERIALS]
    if not candidates:
        print(f"Only the wearable is plugged in ({describe_ports(ports)}). Waiting for Node B.", flush=True)
        return None

    if remembered is None:
        remembered = recalled_port() or ""
    remembered = remembered.upper()
    if len(candidates) > 1:
        print(f"Several ESP32 ports: {describe_ports(candidates)}. Probing for [node-b]…", flush=True)

    confirmed: list[str] = []
    quiet: list[str] = []
    for port in candidates:
        verdict = probe(port.device)
        if verdict is True:
            print(f"Auto-selected gateway {port.device}", flush=True)
            confirmed.append(port.device)
        elif verdict is False:
            print(f"Skipping wearable {port.device}", flush=True)
        else:
            quiet.append(port.device)

    if confirmed:
        if remembered:
            for device in confirmed:
                if device.upper() == remembered:
                    return device
        return confirmed[0]
    if not quiet:
        return None
    if remembered:
        for device in quiet:
            if device.upper() == remembered:
                print(f"Using remembered quiet port {device} (no banner yet)", flush=True)
                return device
    print(f"Using quiet ESP32 port {quiet[0]} (no banner yet)", flush=True)
    return quiet[0]


def pick_gateway_port(*, wait: bool = True, skip: set[str] | None = None) -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]

    skipped = {item.upper() for item in (skip or set())}
    waited = False
    while True:
        ports = [port for port in list_esp32_ports() if port.device.upper() not in skipped]
        chosen = choose_among(ports)
        if chosen:
            if waited:
                print(f"Found gateway on {chosen}", flush=True)
            return chosen

        if not wait:
            raise SystemExit(
                "No ESP32 COM port found. Plug in the gateway, or pass a port: python serial-bridge.py COM7"
            )
        if not waited:
            print("Waiting for gateway USB… (plug Node B in; COM number can change)", flush=True)
            waited = True
        else:
            print(f"Still waiting… ports seen: {describe_ports(list_ports.comports())}", flush=True)
        time.sleep(WAIT_RETRY_SEC)


def credentials_from(source: dict) -> tuple[str, str] | None:
    ssid = str(source.get("ssid") or "").strip()
    password = source.get("password")
    if not isinstance(password, str):
        password = ""
    if not ssid or len(ssid) > 32 or len(password) > 63:
        return None
    if any(ch in ssid or ch in password for ch in "\t\r\n"):
        return None
    return ssid, password


def load_saved() -> tuple[tuple[str, str] | None, list[tuple[str, str]]]:
    try:
        data = json.loads(NETWORK_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, []
    if not isinstance(data, dict):
        return None, []
    profiles: list[tuple[str, str]] = []
    for key in ("router", "hotspot"):
        raw = data.get(key)
        if isinstance(raw, dict):
            creds = credentials_from(raw)
            if creds is not None and creds not in profiles:
                profiles.append(creds)
    active_name = data.get("active")
    active = None
    if active_name in ("router", "hotspot") and isinstance(data.get(active_name), dict):
        active = credentials_from(data[active_name])
    if active is None:
        active = credentials_from(data)
    extras = [creds for creds in profiles if creds != active]
    return active, extras


def lookup_ssid(ssid: str) -> tuple[str, str] | None:
    active, extras = load_saved()
    for creds in [active, *extras]:
        if creds is not None and creds[0] == ssid:
            return creds
    return None


def wearable_ports(gateway: str) -> list[str]:
    found: list[str] = []
    for port in list_esp32_ports():
        if port.device.upper() == gateway.upper():
            continue
        # Skip known gateway USB serial when both boards are present.
        if port_serial(port) in KNOWN_GATEWAY_SERIALS:
            continue
        found.append(port.device)
    return found


def push_wearable(gateway: str, creds: tuple[str, str], state: dict) -> None:
    if state.get("wearable_last") == creds:
        return
    ports = wearable_ports(gateway)
    if not ports:
        return
    line = f"wifi\t{creds[0]}\t{creds[1]}\n".encode("utf-8")
    for device in ports:
        wearable = serial.Serial()
        wearable.port = device
        wearable.baudrate = BAUD
        wearable.timeout = 0.2
        wearable.dtr = False
        wearable.rts = False
        try:
            wearable.open()
            wearable.write(line)
            wearable.close()
        except serial.SerialException as exc:
            print(f"wearable {device} not updated: {exc}", flush=True)
            continue
        print(f"sent wearable {device} {creds[0]}", flush=True)
        state["wearable_last"] = creds


def looks_like_5ghz(ssid: str) -> bool:
    upper = ssid.upper()
    return "5G" in upper or "5GHZ" in upper or "5 GHZ" in upper


def warn_ssid_issues(active: tuple[str, str] | None, extras: list[tuple[str, str]], state: dict) -> None:
    if state.get("ssid_warned"):
        return
    names = [c[0] for c in ([active] if active else []) + extras]
    bad = [name for name in names if looks_like_5ghz(name)]
    if not bad:
        return
    state["ssid_warned"] = True
    print(
        "WARNING: ESP32 only joins 2.4 GHz Wi-Fi. "
        f"Saved name(s) look 5 GHz: {', '.join(bad)}. "
        "Use a 2.4 GHz SSID (phone hotspot with maximize compatibility, or the router's 2.4 GHz name).",
        flush=True,
    )


def push_router(ser: serial.Serial, state: dict) -> None:
    now = time.time()
    if now < state["next"]:
        return
    active, extras = load_saved()
    signature = (active, tuple(extras))
    changed = signature != state["last"]
    down = state.get("wifi") != "up"
    silent = state.get("rx_lines", 0) == 0
    # When the board never answers, back off hard — resending every few seconds just floods UART.
    retry_after = 45.0 if silent else 15.0
    state["next"] = now + 2
    if active is None and not extras:
        return
    if not changed and not down and state["pushes"] >= 1:
        return
    if not changed and down and state["pushes"] >= 1 and now < state.get("retry", 0):
        state["next"] = state["retry"]
        return
    state["retry"] = now + retry_after
    warn_ssid_issues(active, extras, state)
    for creds in extras:
        ser.write(f"also\t{creds[0]}\t{creds[1]}\n".encode("utf-8"))
        print(f"sent saved {creds[0]}", flush=True)
    if active is not None:
        ser.write(f"wifi\t{active[0]}\t{active[1]}\n".encode("utf-8"))
        print(f"sent router {active[0]}", flush=True)
        push_wearable(ser.port, active, state)
    state["last"] = signature
    state["pushes"] += 1
    if silent and state["pushes"] == 1:
        print(
            "No serial text from the gateway yet. "
            "If this board is CH343-only, reflash Node B with the latest firmware "
            "(CDC+UART mirror). Until heartbeats appear, Wi-Fi status cannot be verified.",
            flush=True,
        )
    elif silent and state["pushes"] in (2, 4, 8):
        print(
            f"Still silent on {ser.port} after {state['pushes']} pushes. "
            "Reflash firmware/node-b, or confirm the cable is the gateway UART/CH343 port.",
            flush=True,
        )


def post_json(url: str, payload: dict) -> int:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "FIREALERT-bridge",
            "X-Firealert-Bridge": "serial",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=2.5) as resp:
        return resp.status


def post_each(urls: list[str], payload: dict) -> str:
    notes: list[str] = []
    for url in urls:
        host = url.split("/")[2]
        try:
            notes.append(f"{host} {post_json(url, payload)}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            notes.append(f"{host} failed ({exc})")
    return ", ".join(notes)


def link_payload(state: dict) -> dict[str, object]:
    payload: dict[str, object] = {
        "wifi": state.get("wifi") or "down",
        "ip": state.get("ip") or "0.0.0.0",
        "channel": int(state.get("channel") or 0),
        "mac": state.get("mac") or "00:00:00:00:00:00",
        "cellular": state.get("cellular") or "not-installed",
    }
    ssid = state.get("ssid")
    if ssid and ssid != "-":
        payload["ssid"] = ssid
    for key in ("phase", "trying", "detail"):
        value = state.get(key)
        if value and value != "-":
            payload[key] = value
    return payload


def post_link_state(state: dict, note: str) -> None:
    print(f"{note} {post_each(LINK_URLS, link_payload(state))}", flush=True)


def post_heartbeat(match: re.Match[str], gateway: str, state: dict) -> None:
    wifi = match.group(1)
    if wifi == "down" and state.get("wifi") != "down":
        state["retry"] = time.time()
    state["wifi"] = wifi
    state["ip"] = match.group(2)
    state["channel"] = int(match.group(3))
    state["mac"] = match.group(4)
    state["cellular"] = match.group(5) or "not-installed"
    ssid = (match.group(6) or "").strip()
    phase = match.group(7)
    trying = match.group(8)
    detail = match.group(9)
    if ssid and ssid != "-":
        state["ssid"] = ssid
        creds = lookup_ssid(ssid)
        if creds is not None:
            push_wearable(gateway, creds, state)
    else:
        state["ssid"] = None
    if phase:
        state["phase"] = phase
    if trying:
        state["trying"] = trying
    if detail:
        state["detail"] = detail
    post_link_state(state, f"gateway wifi={wifi} ip={match.group(2)} detail={state.get('detail') or '-'}")


def apply_diag_line(text: str, state: dict) -> bool:
    """Parse non-heartbeat USB lines so the board can isolate Wi-Fi errors without waiting for a reflash."""
    fail = JOIN_FAIL.search(text)
    if fail:
        state["wifi"] = "down"
        state["trying"] = fail.group(1).strip()
        state["phase"] = "idle"
        state["detail"] = fail.group(3) or STATUS_DETAIL.get(fail.group(2), "join_failed")
        state["ssid"] = None
        post_link_state(state, f"join fail trying={state['trying']} detail={state['detail']}")
        return True
    joining = JOINING.search(text)
    if joining:
        state["wifi"] = "down"
        state["trying"] = joining.group(1).strip()
        state["phase"] = "connecting"
        state["detail"] = "connecting"
        state["ssid"] = None
        post_link_state(state, f"joining {state['trying']}")
        return True
    if NOT_IN_RANGE.search(text):
        state["wifi"] = "down"
        state["phase"] = "hold"
        state["detail"] = "not_in_range"
        state["ssid"] = None
        post_link_state(state, "saved networks not in range")
        return True
    ok = WIFI_OK.search(text)
    if ok:
        state["wifi"] = "up"
        state["ssid"] = ok.group(1).strip()
        state["trying"] = state["ssid"]
        state["phase"] = "connected"
        state["detail"] = "ok"
        post_link_state(state, f"wifi ok ssid={state['ssid']}")
        return True
    if NO_ROUTER.search(text):
        state["wifi"] = "down"
        state["phase"] = "idle"
        state["detail"] = "no_saved_network"
        state["trying"] = "-"
        state["ssid"] = None
        post_link_state(state, "no saved network on gateway")
        return True
    return False


def post_payload(obj: dict) -> None:
    print(f"forwarded seq={obj.get('sequence')} {post_each(API_URLS, obj)}", flush=True)


def fresh_router_state() -> dict:
    return {
        "next": time.time() + 1,
        "pushes": 0,
        "last": None,
        "retry": 0,
        "wifi": "down",
        "ip": "0.0.0.0",
        "channel": 0,
        "mac": "00:00:00:00:00:00",
        "cellular": "not-installed",
        "ssid": None,
        "phase": "idle",
        "trying": "-",
        "detail": "bridge_open",
        "wearable_last": None,
        "rx_lines": 0,
        "ssid_warned": False,
    }


def serve_port(port: str) -> None:
    print(f"Reading {port} @ {BAUD} -> hosted board and {API_URL}", flush=True)
    ser = open_quiet(port, timeout=0.5)
    buf = b""
    router_state = fresh_router_state()
    last_idle_note = 0.0
    opened_at = time.time()
    saw_node_b = False
    try:
        while True:
            try:
                push_router(ser, router_state)
                chunk = ser.read(512)
            except serial.SerialException as exc:
                print(f"USB lost on {port}: {exc}", flush=True)
                raise
            now = time.time()
            if chunk:
                buf += chunk
            elif router_state.get("rx_lines", 0) == 0 and now - last_idle_note > 20:
                last_idle_note = now
                print(
                    "Listening… (no [node-b] lines yet — reflash Node B if this port stays quiet)",
                    flush=True,
                )
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue
                if text.startswith("[node-a]"):
                    print(f"{port} is the wearable ({text[:80]}). Looking for the gateway.", flush=True)
                    raise Rescan(port, "wearable")
                if "[node-b]" in text and not saw_node_b:
                    saw_node_b = True
                    remember_port(port)
                    print(f"Gateway detected on {port}", flush=True)
                router_state["rx_lines"] = int(router_state.get("rx_lines", 0)) + 1
                beat = HEARTBEAT.search(text)
                if beat:
                    try:
                        post_heartbeat(beat, port, router_state)
                    except (urllib.error.URLError, TimeoutError, OSError) as exc:
                        print(f"link post failed: {exc}", flush=True)
                    continue
                try:
                    if apply_diag_line(text, router_state):
                        continue
                except (urllib.error.URLError, TimeoutError, OSError) as exc:
                    print(f"link diag post failed: {exc}", flush=True)
                    continue
                if not text.startswith("{"):
                    # Show other firmware lines so silent failures are visible.
                    if text.startswith("[node-b]") or text.startswith("[node-a]"):
                        print(text, flush=True)
                    continue
                try:
                    obj = json.loads(text)
                except json.JSONDecodeError:
                    print(f"skip bad json: {text[:80]}", flush=True)
                    continue
                try:
                    post_payload(obj)
                except (urllib.error.URLError, TimeoutError, OSError) as exc:
                    print(f"API post failed: {exc}", flush=True)
                    time.sleep(1)
            if not saw_node_b and now - opened_at > SILENT_GIVE_UP_SEC:
                others = [item.device for item in list_esp32_ports() if item.device.upper() != port.upper()]
                if others:
                    print(f"No [node-b] on {port}. Trying {', '.join(others)}.", flush=True)
                    raise Rescan(port, "silent")
    finally:
        try:
            ser.close()
        except serial.SerialException:
            pass


def main() -> None:
    print("FIREALERT USB bridge — auto-detects the gateway COM port.", flush=True)
    print("Leave this window open. Unplug/replug or swap boards; it will re-find USB.", flush=True)
    print(f"Heartbeats are posted to {HOSTED_ORIGIN} first, then {LOCAL_ORIGIN}.", flush=True)
    skip_until: dict[str, float] = {}
    while True:
        now = time.time()
        skip = {device for device, until in skip_until.items() if until > now}
        try:
            port = pick_gateway_port(wait=True, skip=skip)
            serve_port(port)
        except Rescan as exc:
            hold = WEARABLE_SKIP_SEC if exc.reason == "wearable" else SILENT_SKIP_SEC
            skip_until[exc.port] = time.time() + hold
            print(f"Re-scanning ({exc.reason} on {exc.port})…", flush=True)
            time.sleep(0.4)
        except serial.SerialException:
            print("Re-scanning for gateway USB…", flush=True)
            time.sleep(WAIT_RETRY_SEC)


if __name__ == "__main__":
    main()
