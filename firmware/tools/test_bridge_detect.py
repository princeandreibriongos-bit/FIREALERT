"""Port picker regressions: a remembered COM port must not hide the gateway."""

from __future__ import annotations

import importlib.util
from pathlib import Path


def load_bridge():
    path = Path(__file__).resolve().parent / "serial-bridge.py"
    spec = importlib.util.spec_from_file_location("firealert_serial_bridge", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Port:
    def __init__(self, device, vid=None, pid=None, serial_number=None, hwid=""):
        self.device = device
        self.vid = vid
        self.pid = pid
        self.serial_number = serial_number
        self.hwid = hwid


def main() -> None:
    bridge = load_bridge()
    assert bridge.is_gateway_candidate(Port("COM5", vid=0x1A86, pid=0x55D4))
    assert bridge.is_gateway_candidate(Port("COM9", hwid="USB VID_1A86&PID_55D4"))
    assert not bridge.is_gateway_candidate(Port("COM1", vid=0x046D, pid=0xC52B, hwid="USB VID_046D"))

    wearable = Port("COM3", vid=0x1A86, pid=0x55D3, serial_number="B81F3FD818EC")
    gateway = Port("COM7", vid=0x1A86, pid=0x55D4, serial_number="ABC")
    known = Port("COM4", vid=0x303A, pid=0x1001, serial_number="14:C1:9F:C8:57:D8")
    probes: list[str] = []

    def probe(device: str):
        probes.append(device)
        return {"COM7": True, "COM3": False}.get(device)

    assert bridge.choose_among([wearable, gateway], probe=probe, remembered="COM3") == "COM7"
    assert probes == ["COM7"]
    assert bridge.choose_among([wearable], probe=probe, remembered="COM3") is None
    probes.clear()
    assert bridge.choose_among([known, gateway], probe=probe, remembered="COM3") == "COM4"
    assert probes == []

    line = (
        "[node-b] heartbeat wifi=up ip=192.168.43.1 ch=6 mac=14:C1:9F:C8:57:D8 "
        "cellular=not-installed ssid=My Hotspot phase=connected trying=My Hotspot detail=ok"
    )
    hit = bridge.HEARTBEAT.search(line)
    assert hit is not None and hit.group(6) == "My Hotspot"
    print("bridge detection tests ok")


if __name__ == "__main__":
    main()
