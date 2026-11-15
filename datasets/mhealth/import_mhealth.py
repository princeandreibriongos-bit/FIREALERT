#!/usr/bin/env python3
"""Convert the public mHealth right-wrist recordings into this wearable's units.

Source: Oresti Banos et al., UCI mHealth (CC BY 4.0). Shimmer2 on the right wrist,
50 Hz. Acceleration is m/s^2 and gyroscope is degrees per second. This keeps
standing, sitting, and lying as idle, walking as walk, and jogging plus running
as run. Samples are kept every 100 ms so they line up with the wearable.
"""

from __future__ import annotations

import csv
import zipfile
from pathlib import Path

G = 9.80665
ROOT = Path(__file__).resolve().parent
ZIP_CANDIDATES = (
    Path("/tmp/datasets/mhealth.zip"),
    ROOT / ".upstream" / "mhealth.zip",
)
LABELS = {1: "idle", 2: "idle", 3: "idle", 4: "walk", 10: "run", 11: "run"}
SOURCE = {1: "stand", 2: "sit", 3: "lie", 4: "walk", 10: "jog", 11: "run"}
# 0-based columns. The README numbers the wrist accel as columns 15-17.
WRIST_ACC = (14, 15, 16)
WRIST_GYR = (17, 18, 19)
LABEL_COL = 23


def find_zip() -> Path:
    for path in ZIP_CANDIDATES:
        if path.is_file():
            return path
    raise SystemExit("mHealth zip not found. Download it to /tmp/datasets/mhealth.zip and run this again.")


def convert() -> None:
    out_root = ROOT / "10hz"
    if out_root.exists():
        for path in out_root.rglob("*.csv"):
            path.unlink()
    manifest_rows: list[list[str]] = []
    counts = {"idle": 0, "walk": 0, "run": 0}
    with zipfile.ZipFile(find_zip()) as archive:
        names = sorted(name for name in archive.namelist() if name.endswith(".log") and "subject" in name)
        for name in names:
            subject = int(name.rsplit("subject", 1)[1].split(".", 1)[0])
            segment: list[tuple[float, float, float, float, float, float]] = []
            segment_label = 0
            part = 0

            def flush() -> None:
                nonlocal part, segment, segment_label
                label = LABELS.get(segment_label)
                # 50 Hz -> 10 Hz. Drop a short fragment that cannot fill one window.
                kept = segment[::5]
                if label and len(kept) >= 30:
                    part += 1
                    source = SOURCE[segment_label]
                    relative = Path("10hz") / label / f"s{subject:02d}_{source}_{part:02d}.csv"
                    target = ROOT / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open("w", newline="") as handle:
                        writer = csv.writer(handle)
                        writer.writerow(["timestamp", "accX", "accY", "accZ", "gyrX", "gyrY", "gyrZ"])
                        for index, sample in enumerate(kept):
                            writer.writerow([index * 100, *[f"{value:.6f}" for value in sample]])
                    manifest_rows.append([str(subject), label, source, str(len(kept)), relative.as_posix()])
                    counts[label] += len(kept)
                segment = []
                segment_label = 0

            with archive.open(name) as handle:
                for raw in handle:
                    fields = raw.split()
                    if len(fields) <= LABEL_COL:
                        continue
                    code = int(float(fields[LABEL_COL]))
                    if code != segment_label:
                        flush()
                        segment_label = code
                    if code not in LABELS:
                        continue
                    accel = tuple(float(fields[column]) / G for column in WRIST_ACC)
                    gyro = tuple(float(fields[column]) for column in WRIST_GYR)
                    segment.append((*accel, *gyro))
            flush()

    with (ROOT / "manifest.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["subject", "label", "source", "rows", "file"])
        writer.writerows(manifest_rows)
    print(f"trials {len(manifest_rows)} samples {counts}")


if __name__ == "__main__":
    convert()
