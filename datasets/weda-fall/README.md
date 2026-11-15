# WEDA-FALL, converted for this wearable

Public wrist recordings from [joaojtmarques/WEDA-FALL](https://github.com/joaojtmarques/WEDA-FALL) (João Marques). The watch was a Fitbit Sense. Younger volunteers acted falls onto a mattress. Older volunteers recorded daily movement only, not falls. Cite that repository when this set is used. It has no license file, so these converted files stay attributed to that project and are not a replacement for recordings from this MPU-6050.

## What is in `10hz/`

| Folder | Trials | Meaning |
| --- | --- | --- |
| `10hz/fall/F01`–`F08` | 350 | Acted wrist falls: slip, trip, sitting, fainting |
| `10hz/adl/D01`–`D11` | 619 | Not falls: walk, jog, stairs, sit, stumble, jump, hit, clap, door |

Each CSV uses the same columns as a wearable export:

```text
timestamp,accX,accY,accZ,gyrX,gyrY,gyrZ
```

`timestamp` is milliseconds from the start of that trial. Acceleration is in g. Gyroscope is in degrees per second. The original files are m/s² and radians per second. The 10 Hz copy is the one closest to this wearable, which sends a fresh sample about every 100 ms.

`fall_timestamps.csv` is the upstream list of when each acted fall starts and ends, in seconds on the original clock. `manifest.csv` is the trial index written by the importer.

## What this set is not

- Not an MPU-6050. The Fitbit gyroscope only steps by about 0.5 rad/s, so a quiet sample jumps by about 29 degrees per second. This board's gyro is finer.
- Not this module's axis directions. X, Y, and Z are the watch axes.
- Not a firefighter fall, and not a fall by the older volunteers.
- Not a recording from the boards on the desk. Those still use `rec fall`, `rec idle`, and `rec walk` on the wearable serial port.

## Live score

`python3 datasets/weda-fall/train_weda.py` fits the magnitude score and writes `model.json`, `firmware/node-a/include/weda_fall.h`, and `web/lib/weda-fall.ts`. The dashboard and the wearable both use those weights. Held-out volunteers are those whose user number is divisible by 5. At threshold 0.72 that split caught 80% of fall trials and also fired on 22% of daily-activity trials.

## Refresh

From the repository root:

```bash
python3 datasets/weda-fall/import_weda.py
```

That clones the 10 Hz files, converts them, and rewrites `10hz/` and `manifest.csv`.
