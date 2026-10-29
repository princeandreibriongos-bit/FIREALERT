"""Forward Node B serial JSON lines to the local Next.js API.

Windows Firewall often blocks the ESP32 from POSTing to this PC.
The gateway already prints each payload on USB serial; this script
replays those objects to http://localhost:3000/api/telemetry.
The local API then copies the same readings to the hosted board.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import serial
from serial.tools import list_ports

API_URL = "http://127.0.0.1:3000/api/telemetry"
LINK_URL = "http://127.0.0.1:3000/api/link"
HEARTBEAT = re.compile(
    r"\[node-b\] heartbeat wifi=(up|down) ip=(\S+) ch=(\d+) mac=([0-9A-Fa-f:]+)(?: cellular=(\S+))?(?: ssid=(.*))?$"
)
BAUD = 115200
NETWORK_PATH = Path(__file__).resolve().parent / "data" / "network.json"


def pick_gateway_port() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    for port in list_ports.comports():
        desc = f"{port.device} {port.description} {port.hwid}"
        # Node B enumerates as Espressif USB Serial/JTAG (PID 1001).
        if "VID:PID=303A:1001" in port.hwid.upper().replace(" ", ""):
            if port.device.upper() == "COM5":
                return port.device
    for port in list_ports.comports():
        if "303A" in port.hwid.upper():
            return port.device
    raise SystemExit("No ESP32 COM port found. Pass it explicitly, e.g. python serial-bridge.py COM5")


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
    for port in list_ports.comports():
        hwid = port.hwid.upper().replace(" ", "")
        if "VID:PID=303A:1001" not in hwid:
            continue
        if port.device.upper() == gateway.upper():
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


def push_router(ser: serial.Serial, state: dict) -> None:
    now = time.time()
    if now < state["next"]:
        return
    active, extras = load_saved()
    signature = (active, tuple(extras))
    changed = signature != state["last"]
    down = state.get("wifi") != "up"
    state["next"] = now + 2
    if active is None and not extras:
        return
    if not changed and not down and state["pushes"] >= 1:
        return
    if not changed and down and state["pushes"] >= 1 and now < state.get("retry", 0):
        state["next"] = state["retry"]
        return
    state["retry"] = now + 15
    for creds in extras:
        ser.write(f"also\t{creds[0]}\t{creds[1]}\n".encode("utf-8"))
        print(f"sent saved {creds[0]}", flush=True)
    if active is not None:
        ser.write(f"wifi\t{active[0]}\t{active[1]}\n".encode("utf-8"))
        print(f"sent router {active[0]}", flush=True)
        push_wearable(ser.port, active, state)
    state["last"] = signature
    state["pushes"] += 1


def post_json(url: str, payload: dict) -> int:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "X-Firealert-Bridge": "serial"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


def post_heartbeat(match: re.Match[str], gateway: str, state: dict) -> None:
    wifi = match.group(1)
    if wifi == "down" and state.get("wifi") != "down":
        state["retry"] = time.time()
    state["wifi"] = wifi
    ssid = match.group(6)
    payload: dict[str, object] = {
        "wifi": wifi,
        "ip": match.group(2),
        "channel": int(match.group(3)),
        "mac": match.group(4),
        "cellular": match.group(5) or "not-installed",
    }
    if ssid and ssid != "-":
        payload["ssid"] = ssid
        creds = lookup_ssid(ssid)
        if creds is not None:
            push_wearable(gateway, creds, state)
    status = post_json(LINK_URL, payload)
    print(f"gateway wifi={wifi} ip={match.group(2)} HTTP {status}", flush=True)


def post_payload(obj: dict) -> None:
    status = post_json(API_URL, obj)
    print(f"forwarded seq={obj.get('sequence')} HTTP {status}", flush=True)


def main() -> None:
    port = pick_gateway_port()
    print(f"Reading {port} @ {BAUD} -> {API_URL}", flush=True)
    ser = serial.Serial()
    ser.port = port
    ser.baudrate = BAUD
    ser.timeout = 0.5
    ser.dtr = False
    ser.rts = False
    ser.open()
    buf = b""
    router_state = {"next": time.time() + 1, "pushes": 0, "last": None, "retry": 0, "wifi": "down"}
    while True:
        push_router(ser, router_state)
        chunk = ser.read(512)
        if not chunk:
            continue
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            text = line.decode("utf-8", errors="replace").strip()
            beat = HEARTBEAT.search(text)
            if beat:
                try:
                    post_heartbeat(beat, port, router_state)
                except (urllib.error.URLError, TimeoutError, OSError) as exc:
                    print(f"link post failed: {exc}", flush=True)
                continue
            if not text.startswith("{"):
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


if __name__ == "__main__":
    main()
