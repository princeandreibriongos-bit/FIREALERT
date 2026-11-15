#!/usr/bin/env python3
"""Fit idle / walk / run on the converted mHealth wrist windows.

Magnitudes only, so the Shimmer axis order does not have to match the MPU-6050.
The same arithmetic is copied into the web app and the firmware.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
WINDOW = 30
STEP = 10
EPOCHS = 500
LR = 0.15
CLASSES = ("idle", "walk", "run")
FEATURE_NAMES = (
    "accel_mean",
    "accel_std",
    "accel_max",
    "accel_min",
    "accel_step",
)


def load_windows() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features: list[np.ndarray] = []
    labels: list[int] = []
    groups: list[int] = []
    with (ROOT / "manifest.csv").open(newline="") as handle:
        for row in csv.DictReader(handle):
            subject = int(row["subject"])
            label = CLASSES.index(row["label"])
            accel: list[float] = []
            gyro: list[float] = []
            with (ROOT / row["file"]).open(newline="") as trial:
                for sample in csv.DictReader(trial):
                    ax, ay, az = float(sample["accX"]), float(sample["accY"]), float(sample["accZ"])
                    gx, gy, gz = float(sample["gyrX"]), float(sample["gyrY"]), float(sample["gyrZ"])
                    accel.append(float(np.sqrt(ax * ax + ay * ay + az * az)))
                    gyro.append(float(np.sqrt(gx * gx + gy * gy + gz * gz)))
            values_a = np.asarray(accel)
            values_g = np.asarray(gyro)
            for start in range(0, len(values_a) - WINDOW + 1, STEP):
                features.append(feature_row(values_a[start : start + WINDOW], values_g[start : start + WINDOW]))
                labels.append(label)
                groups.append(0 if subject % 5 == 0 else 1)
    return np.vstack(features), np.asarray(labels), np.asarray(groups)


def feature_row(accel: np.ndarray, gyro: np.ndarray) -> np.ndarray:
    delta = np.abs(np.diff(accel)).mean() if len(accel) > 1 else 0.0
    # The public wrist gyro barely changes in this set, so it is not a feature.
    # A live MPU-6050 gyro would otherwise dominate the score.
    del gyro
    return np.array(
        [
            accel.mean(),
            accel.std(),
            accel.max(),
            accel.min(),
            delta,
        ],
        dtype=np.float64,
    )


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=1, keepdims=True)


def fit(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    counts = np.bincount(y, minlength=3).astype(np.float64)
    weights = x.shape[0] / (3.0 * np.maximum(counts, 1.0))
    sample_w = weights[y]
    coeff = np.zeros((3, x.shape[1]), dtype=np.float64)
    bias = np.zeros(3, dtype=np.float64)
    for _ in range(EPOCHS):
        probs = softmax(x @ coeff.T + bias)
        residual = probs
        residual[np.arange(len(y)), y] -= 1.0
        residual *= sample_w[:, None]
        grad_w = residual.T @ x / len(y) + 0.001 * coeff
        grad_b = residual.mean(axis=0)
        coeff -= LR * grad_w
        bias -= LR * grad_b
    return coeff, bias


def confusion(pred: np.ndarray, y: np.ndarray) -> list[list[int]]:
    table = [[0, 0, 0] for _ in range(3)]
    for guess, truth in zip(pred, y):
        table[int(truth)][int(guess)] += 1
    return table


def emit(coeff: np.ndarray, bias: np.ndarray, mean: np.ndarray, std: np.ndarray, minimum: float) -> None:
    payload = {
        "classes": list(CLASSES),
        "minimum": minimum,
        "window": WINDOW,
        "names": list(FEATURE_NAMES),
        "mean": [float(v) for v in mean],
        "std": [float(v) for v in std],
        "bias": [float(v) for v in bias],
        "weights": [[float(v) for v in row] for row in coeff],
    }
    (ROOT / "model.json").write_text(json.dumps(payload, indent=2) + "\n")

    def arr(values: np.ndarray) -> str:
        return ", ".join(f"{float(v):.8f}" for v in np.ravel(values))

    weight_rows = ",\n  ".join("{ " + ", ".join(f"{float(v):.8f}" for v in row) + " }" for row in coeff)
    header = f"""#pragma once

// Trained on datasets/mhealth 10 Hz windows. Worn on the left wrist.
// Magnitudes only, so the right-wrist source is not mirrored.
// Classes: 0 idle, 1 walk, 2 run. Confidence is the softmax probability.

static constexpr int ACTIVITY_WINDOW = {WINDOW};
static constexpr float ACTIVITY_MIN = {minimum:.2f}f;
static constexpr int ACTIVITY_FEATURES = 5;
static constexpr float ACTIVITY_MEAN[ACTIVITY_FEATURES] = {{ {arr(mean)} }};
static constexpr float ACTIVITY_STD[ACTIVITY_FEATURES] = {{ {arr(std)} }};
static constexpr float ACTIVITY_BIAS[3] = {{ {arr(bias)} }};
static constexpr float ACTIVITY_WEIGHT[3][ACTIVITY_FEATURES] = {{
  {weight_rows}
}};

/** Chronological magnitudes. Writes the class name and confidence. Returns false until the window is full. */
bool activityPredict(const float *accelMag, const float *gyroMag, int count, char *label, int labelSize, float *confidence);
"""
    firmware = Path(__file__).resolve().parents[2] / "firmware" / "node-a" / "include" / "activity_model.h"
    firmware.write_text(header)

    ts_rows = ",\n  ".join("[" + ", ".join(f"{float(v):.8f}" for v in row) + "]" for row in coeff)
    ts = f"""// Generated by datasets/mhealth/train_activity.py. Magnitudes only.

export const ACTIVITY_WINDOW = {WINDOW};
export const ACTIVITY_MIN = {minimum};
export const ACTIVITY_CLASSES = ["idle", "walk", "run"] as const;
export const ACTIVITY_MEAN = [{arr(mean)}] as const;
export const ACTIVITY_STD = [{arr(std)}] as const;
export const ACTIVITY_BIAS = [{arr(bias)}] as const;
export const ACTIVITY_WEIGHT = [
  {ts_rows},
] as const;

type ActivitySample = {{ ax: number; ay: number; az: number; gx: number; gy: number; gz: number }};

/** Idle, walk, or run for one 3-second wrist window. Null until {WINDOW} samples exist. */
export function activityScore(samples: readonly ActivitySample[]): {{ label: "idle" | "walk" | "run" | "clear"; score: number }} | null {{
  if (samples.length < ACTIVITY_WINDOW) return null;
  const window = samples.slice(samples.length - ACTIVITY_WINDOW);
  const accel: number[] = [];
  for (const sample of window) accel.push(Math.hypot(sample.ax, sample.ay, sample.az));
  const avg = accel.reduce((sum, value) => sum + value, 0) / accel.length;
  const spread = Math.sqrt(accel.reduce((sum, value) => sum + (value - avg) ** 2, 0) / accel.length);
  let step = 0;
  for (let i = 1; i < accel.length; i++) step += Math.abs(accel[i] - accel[i - 1]);
  step /= accel.length - 1;
  const features = [avg, spread, Math.max(...accel), Math.min(...accel), step];
  const logits = ACTIVITY_BIAS.map((bias, cls) => {{
    let score = bias;
    for (let i = 0; i < features.length; i++) score += ACTIVITY_WEIGHT[cls][i] * ((features[i] - ACTIVITY_MEAN[i]) / ACTIVITY_STD[i]);
    return score;
  }});
  const peak = Math.max(...logits);
  const exp = logits.map((value) => Math.exp(Math.max(-30, Math.min(30, value - peak))));
  const total = exp.reduce((sum, value) => sum + value, 0);
  let best = 0;
  for (let i = 1; i < exp.length; i++) if (exp[i] > exp[best]) best = i;
  const confidence = exp[best] / total;
  const label = confidence >= ACTIVITY_MIN ? ACTIVITY_CLASSES[best] : "clear";
  return {{ label, score: confidence }};
}}
"""
    web = Path(__file__).resolve().parents[2] / "web" / "lib" / "activity-model.ts"
    web.write_text(ts)


def main() -> None:
    x, y, group = load_windows()
    train = group == 1
    mean = x[train].mean(axis=0)
    std = np.maximum(x[train].std(axis=0), 1e-6)
    scaled = (x - mean) / std
    coeff, bias = fit(scaled[train], y[train])
    probs = softmax(scaled @ coeff.T + bias)
    pred = probs.argmax(axis=1)
    minimum = 0.45
    print("train", confusion(pred[train], y[train]), "acc", float((pred[train] == y[train]).mean()))
    print("test", confusion(pred[~train], y[~train]), "acc", float((pred[~train] == y[~train]).mean()))
    print("windows", len(y), "train", int(train.sum()), "test", int((~train).sum()))
    emit(coeff, bias, mean, std, minimum)


if __name__ == "__main__":
    main()
