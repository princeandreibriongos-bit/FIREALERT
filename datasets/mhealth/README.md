# mHealth wrist recordings, converted for this wearable

Public recordings from the [UCI mHealth dataset](https://archive.ics.uci.edu/dataset/319/mhealth+dataset) (Oresti Banos, Rafael Garcia, Alejandro Saez, University of Granada). Ten volunteers wore a Shimmer2 on the right wrist, the chest, and the left ankle. This copy keeps that wrist accelerometer and gyroscope only. This wearable’s MPU-6050 is on the **left wrist**. The live score uses acceleration magnitude, which does not change when the same motion is on the other wrist, so the weights are not mirrored. Cite that dataset when these files are used. The license is CC BY 4.0.

## What is in `10hz/`

| Folder | Source activities | Label on the board |
| --- | --- | --- |
| `10hz/idle` | Standing still, sitting, lying down | Idle |
| `10hz/walk` | Walking | Walk |
| `10hz/run` | Jogging and running | Run |

Each CSV uses the wearable columns `timestamp,accX,accY,accZ,gyrX,gyrY,gyrZ`. Acceleration is in g. Gyroscope is in degrees per second, which is how the source file already stored it. `timestamp` is milliseconds from the start of that bout, one row every 100 ms. The original stream is 50 Hz.

`manifest.csv` lists the subject, the board label, the original activity, the row count, and the file.

## Live score

`python3 datasets/mhealth/train_activity.py` fits idle / walk / run and writes `model.json`, `firmware/node-a/include/activity_model.h`, and `web/lib/activity-model.ts`. The features are acceleration magnitude only: mean, spread, max, min, and the average step-to-step change. The published wrist gyroscope in this set barely moves, so it is not used. A live MPU-6050 gyro would otherwise swamp the score.

Held-out volunteers are subjects 5 and 10. On that split, 99.7% of the 3-second windows landed on the right class. These are scripted one-minute bouts, not a fireground. Stairs, crawling, and tool work were not trained.

## Refresh

From the repository root, with the UCI zip at `/tmp/datasets/mhealth.zip`:

```bash
python3 datasets/mhealth/import_mhealth.py
python3 datasets/mhealth/train_activity.py
```
