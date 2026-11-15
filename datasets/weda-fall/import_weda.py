#!/usr/bin/env python3
"""Download WEDA-FALL 10 Hz wrist recordings and write FIREALERT CSVs.

Source: https://github.com/joaojtmarques/WEDA-FALL
Fitbit Sense on the wrist. Acceleration is m/s^2 and gyroscope is rad/s.
This script converts those to g and degrees per second, which is what the
MPU-6050 firmware stores. Axes stay in the watch frame. They are not rotated
onto this project's module.

The upstream repository has no license file. Keep the citation in README.md.
"""

from __future__ import annotations

import csv
import math
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "10hz"
CLONE = ROOT / ".upstream"
G = 9.80665
RAD_TO_DEG = 180.0 / math.pi
MAX_GYRO_GAP_S = 0.08

FALLS = {f"F{i:02d}" for i in range(1, 9)}
ADLS = {f"D{i:02d}" for i in range(1, 12)}


def run(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def ensure_upstream() -> Path:
    marker = CLONE / "dataset" / "10Hz"
    if marker.is_dir():
        return marker
    if CLONE.exists():
        shutil.rmtree(CLONE)
    run(
        [
            "git",
            "clone",
            "--depth",
            "1",
            "--filter=blob:none",
            "--sparse",
            "https://github.com/joaojtmarques/WEDA-FALL.git",
            str(CLONE),
        ]
    )
    run(["git", "sparse-checkout", "set", "--no-cone", "dataset/10Hz", "dataset/fall_timestamps.csv"], cwd=CLONE)
    stamps = CLONE / "dataset" / "fall_timestamps.csv"
    if stamps.is_file():
        shutil.copyfile(stamps, ROOT / "fall_timestamps.csv")
    return marker


def read_series(path: Path, time_key: str, axes: tuple[str, str, str]) -> list[tuple[float, float, float, float]]:
    rows: list[tuple[float, float, float, float]] = []
    with path.open(newline="") as handle:
        for row in csv.DictReader(handle):
            rows.append(
                (
                    float(row[time_key]),
                    float(row[axes[0]]),
                    float(row[axes[1]]),
                    float(row[axes[2]]),
                )
            )
    rows.sort(key=lambda item: item[0])
    return rows


def nearest_gyro(
    gyros: list[tuple[float, float, float, float]], times: list[float], when: float
) -> tuple[float, float, float] | None:
    lo = 0
    hi = len(times)
    while lo < hi:
        mid = (lo + hi) // 2
        if times[mid] < when:
            lo = mid + 1
        else:
            hi = mid
    best: tuple[float, float, float, float] | None = None
    gap = MAX_GYRO_GAP_S
    for index in (lo - 1, lo):
        if index < 0 or index >= len(gyros):
            continue
        sample = gyros[index]
        delta = abs(sample[0] - when)
        if delta <= gap:
            gap = delta
            best = sample
    if best is None:
        return None
    return best[1], best[2], best[3]


def convert_trial(accel_path: Path, dest: Path) -> int:
    gyro_path = accel_path.with_name(accel_path.name.replace("_accel.csv", "_gyro.csv"))
    if not gyro_path.is_file():
        return 0
    accels = read_series(accel_path, "accel_time_list", ("accel_x_list", "accel_y_list", "accel_z_list"))
    gyros = read_series(gyro_path, "gyro_time_list", ("gyro_x_list", "gyro_y_list", "gyro_z_list"))
    if not accels or not gyros:
        return 0
    gyro_times = [row[0] for row in gyros]
    start = accels[0][0]
    dest.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with dest.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["timestamp", "accX", "accY", "accZ", "gyrX", "gyrY", "gyrZ"])
        for t, ax, ay, az in accels:
            gyro = nearest_gyro(gyros, gyro_times, t)
            if gyro is None:
                continue
            gx, gy, gz = gyro
            writer.writerow(
                [
                    f"{(t - start) * 1000.0:.1f}",
                    f"{ax / G:.6f}",
                    f"{ay / G:.6f}",
                    f"{az / G:.6f}",
                    f"{gx * RAD_TO_DEG:.6f}",
                    f"{gy * RAD_TO_DEG:.6f}",
                    f"{gz * RAD_TO_DEG:.6f}",
                ]
            )
            written += 1
    if written == 0:
        dest.unlink(missing_ok=True)
    return written


def main() -> int:
    source = ensure_upstream()
    if OUT.exists():
        shutil.rmtree(OUT)
    manifest = ROOT / "manifest.csv"
    trials = 0
    rows = 0
    with manifest.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["group", "code", "trial", "rows", "file"])
        for code_dir in sorted(p for p in source.iterdir() if p.is_dir()):
            code = code_dir.name
            if code in FALLS:
                group = "fall"
            elif code in ADLS:
                group = "adl"
            else:
                continue
            for accel in sorted(code_dir.glob("*_accel.csv")):
                trial = accel.name[: -len("_accel.csv")]
                dest = OUT / group / code / f"{trial}.csv"
                count = convert_trial(accel, dest)
                if count == 0:
                    continue
                rel = dest.relative_to(ROOT).as_posix()
                writer.writerow([group, code, trial, count, rel])
                trials += 1
                rows += count
    print(f"trials={trials} rows={rows} out={OUT}")
    return 0 if trials else 1


if __name__ == "__main__":
    sys.exit(main())
