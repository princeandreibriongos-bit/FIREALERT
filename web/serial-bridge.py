"""Forward Node B serial JSON lines to the local Next.js API.

Windows Firewall often blocks the ESP32 from POSTing to this PC.
The gateway already prints each payload on USB serial; this script
replays those objects to http://localhost:3000/api/telemetry.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

import serial
from serial.tools import list_ports

API_URL = "http://127.0.0.1:3000/api/telemetry"
BAUD = 115200


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


def post_payload(obj: dict) -> None:
    data = json.dumps(obj).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={"Content-Type": "application/json", "X-Firealert-Bridge": "serial"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"forwarded seq={obj.get('sequence')} HTTP {resp.status}", flush=True)


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
    while True:
        chunk = ser.read(512)
        if not chunk:
            continue
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            text = line.decode("utf-8", errors="replace").strip()
            if not text.startswith("{"):
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError:
                print(f"skip bad json: {text[:80]}", flush=True)
                continue
            try:
                post_payload(obj)
            except urllib.error.URLError as exc:
                print(f"API post failed: {exc}", flush=True)
                time.sleep(1)


if __name__ == "__main__":
    main()
