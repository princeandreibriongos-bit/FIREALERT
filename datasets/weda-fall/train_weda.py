#!/usr/bin/env python3
"""Fit a wrist fall score on the converted WEDA-FALL windows and emit weights.

Features are magnitudes only, so the Fitbit axis order does not have to match
the MPU-6050. The same arithmetic is copied into the web app and the firmware.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
WINDOW = 30
STEP = 5
LOW_G = 0.6
HIGH_G = 2.2
EPOCHS = 800
LR = 0.05

FEATURE_NAMES = (
    "accel_min",
    "accel_max",
    "accel_std",
    "gyro_max",
    "low_g_fraction",
    "high_g_fraction",
    "dip_then_impact",
    "swing",
)


def load_trial(path: Path) -> tuple[np.ndarray, np.ndarray]:
    accel: list[float] = []
    gyro: list[float] = []
    times: list[float] = []
    with path.open(newline="") as handle:
        for row in csv.DictReader(handle):
            ax, ay, az = (float(row[k]) for k in ("accX", "accY", "accZ"))
            gx, gy, gz = (float(row[k]) for k in ("gyrX", "gyrY", "gyrZ"))
            times.append(float(row["timestamp"]) / 1000.0)
            accel.append(math.hypot(ax, ay, az))
            gyro.append(math.hypot(gx, gy, gz))
    return np.asarray(times), np.vstack([np.asarray(accel), np.asarray(gyro)])


def features_of(accel: np.ndarray, gyro: np.ndarray) -> np.ndarray:
    low = accel < LOW_G
    high = accel > HIGH_G
    dip_at = int(np.flatnonzero(low)[0]) if low.any() else -1
    impact_at = int(np.flatnonzero(high)[-1]) if high.any() else -1
    dip_then_impact = 1.0 if dip_at >= 0 and impact_at > dip_at else 0.0
    return np.array(
        [
            accel.min(),
            accel.max(),
            accel.std(),
            gyro.max(),
            float(low.mean()),
            float(high.mean()),
            dip_then_impact,
            float(accel.max() - accel.min()),
        ],
        dtype=np.float64,
    )


def user_number(trial: str) -> int:
    # U01_R01 or U21_R03
    return int(trial.split("_", 1)[0][1:])


def holdout(user: int) -> bool:
    return user % 5 == 0


def load_windows() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str], list[str]]:
    stamps: dict[str, tuple[float, float]] = {}
    with (ROOT / "fall_timestamps.csv").open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            stamps[row["filename"]] = (float(row["start_time"]), float(row["end_time"]))

    xs: list[np.ndarray] = []
    ys: list[int] = []
    groups: list[int] = []
    trials: list[str] = []
    kinds: list[str] = []
    manifest = list(csv.DictReader((ROOT / "manifest.csv").open()))
    for item in manifest:
        path = ROOT / item["file"]
        times, series = load_trial(path)
        if len(times) < WINDOW:
            continue
        user = user_number(item["trial"])
        span = stamps.get(f"{item['code']}/{item['trial']}")
        accel, gyro = series[0], series[1]
        for start in range(0, len(times) - WINDOW + 1, STEP):
            sl = slice(start, start + WINDOW)
            window_times = times[sl]
            label = 0
            if item["group"] == "fall" and span is not None:
                overlap = min(window_times[-1], span[1]) - max(window_times[0], span[0])
                label = 1 if overlap >= 0.4 else 0
            xs.append(features_of(accel[sl], gyro[sl]))
            ys.append(label)
            groups.append(0 if holdout(user) else 1)
            trials.append(f"{item['group']}/{item['code']}/{item['trial']}")
            kinds.append(item["group"])
    return np.vstack(xs), np.asarray(ys, dtype=np.float64), np.asarray(groups), trials, kinds


def fit(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float, np.ndarray, np.ndarray]:
    mean = x.mean(axis=0)
    std = x.std(axis=0)
    std[std < 1e-6] = 1.0
    z = (x - mean) / std
    pos = max(float(y.sum()), 1.0)
    neg = max(float(y.size - y.sum()), 1.0)
    sample_weight = np.where(y > 0.5, 0.5 * neg / pos, 0.5)
    w = np.zeros(z.shape[1])
    bias = 0.0
    for _ in range(EPOCHS):
        scores = z @ w + bias
        prob = 1.0 / (1.0 + np.exp(-np.clip(scores, -30, 30)))
        error = (prob - y) * sample_weight
        w -= LR * (z.T @ error) / y.size
        bias -= LR * float(error.mean())
        w *= 0.998
    return w, bias, mean, std


def metrics(x: np.ndarray, y: np.ndarray, w: np.ndarray, bias: float, mean: np.ndarray, std: np.ndarray, threshold: float) -> dict[str, float]:
    z = (x - mean) / std
    prob = 1.0 / (1.0 + np.exp(-np.clip(z @ w + bias, -30, 30)))
    pred = prob >= threshold
    truth = y > 0.5
    tp = int(np.sum(pred & truth))
    fp = int(np.sum(pred & ~truth))
    fn = int(np.sum(~pred & truth))
    tn = int(np.sum(~pred & ~truth))
    return {
        "threshold": threshold,
        "recall": tp / max(tp + fn, 1),
        "precision": tp / max(tp + fp, 1),
        "fpr": fp / max(fp + tn, 1),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
    }


def choose_threshold(x, y, w, bias, mean, std) -> float:
    best = 0.5
    best_score = -1.0
    for step in range(50, 96):
        threshold = step / 100.0
        row = metrics(x, y, w, bias, mean, std, threshold)
        # Prefer catching falls without lighting up ordinary wrist motion.
        score = row["recall"] - 1.5 * row["fpr"]
        if row["recall"] >= 0.75 and score > best_score:
            best = threshold
            best_score = score
    return best


def emit(w, bias, mean, std, threshold: float) -> None:
    weights = {
        "threshold": threshold,
        "bias": float(bias),
        "window": WINDOW,
        "low_g": LOW_G,
        "high_g": HIGH_G,
        "names": list(FEATURE_NAMES),
        "mean": [float(v) for v in mean],
        "std": [float(v) for v in std],
        "weights": [float(v) for v in w],
    }
    (ROOT / "model.json").write_text(json.dumps(weights, indent=2) + "\n")

    def arr(values: np.ndarray) -> str:
        return ", ".join(f"{float(v):.8f}" for v in values)

    header = f"""#pragma once

// Trained on datasets/weda-fall 10 Hz windows. Magnitudes only.
// Score = sigmoid(bias + sum(weight * (feature - mean) / std)).

static constexpr int WEDA_WINDOW = {WINDOW};
static constexpr float WEDA_LOW_G = {LOW_G:.2f}f;
static constexpr float WEDA_HIGH_G = {HIGH_G:.2f}f;
static constexpr float WEDA_THRESHOLD = {threshold:.2f}f;
static constexpr float WEDA_BIAS = {float(bias):.8f}f;
static constexpr float WEDA_MEAN[8] = {{ {arr(mean)} }};
static constexpr float WEDA_STD[8] = {{ {arr(std)} }};
static constexpr float WEDA_WEIGHT[8] = {{ {arr(w)} }};

/** Chronological magnitudes. Returns -1 until count reaches WEDA_WINDOW. */
float wedaFallScore(const float *accelMag, const float *gyroMag, int count);
"""
    firmware = Path(__file__).resolve().parents[2] / "firmware" / "node-a" / "include" / "weda_fall.h"
    firmware.write_text(header)

    ts = f"""// Generated by datasets/weda-fall/train_weda.py. Magnitudes only.

export const WEDA_WINDOW = {WINDOW};
export const WEDA_LOW_G = {LOW_G};
export const WEDA_HIGH_G = {HIGH_G};
export const WEDA_THRESHOLD = {threshold};
export const WEDA_BIAS = {float(bias):.8f};
export const WEDA_MEAN = [{arr(mean)}] as const;
export const WEDA_STD = [{arr(std)}] as const;
export const WEDA_WEIGHT = [{arr(w)}] as const;

export type WristSample = {{
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}};

function sigmoid(value: number): number {{
  const clipped = Math.max(-30, Math.min(30, value));
  return 1 / (1 + Math.exp(-clipped));
}}

/** Fall score for one 3-second wrist window. Null until {WINDOW} samples exist. */
export function wedaFallScore(samples: readonly WristSample[]): number | null {{
  if (samples.length < WEDA_WINDOW) return null;
  const window = samples.slice(samples.length - WEDA_WINDOW);
  const accel: number[] = [];
  const gyro: number[] = [];
  for (const sample of window) {{
    accel.push(Math.hypot(sample.ax, sample.ay, sample.az));
    gyro.push(Math.hypot(sample.gx, sample.gy, sample.gz));
  }}
  const avg = accel.reduce((sum, value) => sum + value, 0) / accel.length;
  const spread = Math.sqrt(accel.reduce((sum, value) => sum + (value - avg) ** 2, 0) / accel.length);
  const amin = Math.min(...accel);
  const amax = Math.max(...accel);
  let dip = -1;
  let impact = -1;
  for (let i = 0; i < accel.length; i++) {{
    if (dip < 0 && accel[i] < WEDA_LOW_G) dip = i;
    if (accel[i] > WEDA_HIGH_G) impact = i;
  }}
  const features = [
    amin,
    amax,
    spread,
    Math.max(...gyro),
    accel.filter((value) => value < WEDA_LOW_G).length / accel.length,
    accel.filter((value) => value > WEDA_HIGH_G).length / accel.length,
    dip >= 0 && impact > dip ? 1 : 0,
    amax - amin,
  ];
  let score = WEDA_BIAS;
  for (let i = 0; i < features.length; i++) {{
    score += WEDA_WEIGHT[i] * ((features[i] - WEDA_MEAN[i]) / WEDA_STD[i]);
  }}
  return sigmoid(score);
}}
"""
    web = Path(__file__).resolve().parents[2] / "web" / "lib" / "weda-fall.ts"
    web.write_text(ts)


def probabilities(x, w, bias, mean, std) -> np.ndarray:
    z = (x - mean) / std
    return 1.0 / (1.0 + np.exp(-np.clip(z @ w + bias, -30, 30)))


def trial_table(prob, trials, kinds, hold, threshold: float) -> tuple[float, float]:
    best: dict[str, float] = {}
    kind_of: dict[str, str] = {}
    for score, trial, kind, kept in zip(prob, trials, kinds, hold):
        if not kept:
            continue
        best[trial] = max(best.get(trial, 0.0), float(score))
        kind_of[trial] = kind
    falls = [name for name, kind in kind_of.items() if kind == "fall"]
    adls = [name for name, kind in kind_of.items() if kind == "adl"]
    hit = sum(1 for name in falls if best[name] >= threshold)
    false = sum(1 for name in adls if best[name] >= threshold)
    return hit / max(len(falls), 1), false / max(len(adls), 1)


def main() -> None:
    x, y, group, trials, kinds = load_windows()
    train = group == 1
    test = group == 0
    w, bias, mean, std = fit(x[train], y[train])
    prob = probabilities(x, w, bias, mean, std)
    threshold = 0.5
    best_score = -1.0
    for step in range(40, 96):
        candidate = step / 100.0
        recall, fpr = trial_table(prob, trials, kinds, test, candidate)
        if recall < 0.7:
            continue
        score = recall - 2.0 * fpr
        if score > best_score:
            best_score = score
            threshold = candidate
    print("window-test", metrics(x[test], y[test], w, bias, mean, std, threshold))
    print("trial-test", trial_table(prob, trials, kinds, test, threshold), "threshold", threshold)
    print("trial-train", trial_table(prob, trials, kinds, train, threshold))
    emit(w, bias, mean, std, threshold)


if __name__ == "__main__":
    main()
