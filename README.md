# FIREALERT

Prototype wearable and incident board for the New Makati Central Fire Station capstone. It supplements radio and dispatch. It is not protective equipment, and it does not make tactical or medical decisions.

The wearable and gateway firmware are in `firmware/`. The monitoring board is in `web/`.

On a new computer, read **[NEW-PC.md](NEW-PC.md)** before installing or flashing. It has the install list, the USB bridge, and the two saved Wi-Fi networks. The pin map is **[firmware/PINOUT.md](firmware/PINOUT.md)**.

## Updates

What is on `master` now. Flash **both** boards after pulling, or the wearable can decide an alarm that the gateway never forwards.

- **Station photograph.** The New Makati Central Fire Station picture stays behind the board (`web/public/station-bg.jpg`). Panels are dark glass over that photo. Titles are a plain sans (Geist). Numbers and clocks stay monospaced. Status color is only green, amber, and red.
- **Health alarms, decided on the wearable.** A high pulse alarms only if it stays high while the wrist is not running: 120 bpm when idle, 150 bpm when walking, for about 8 seconds. A run with a high pulse is labeled exertion, not an alarm. A low pulse (45 bpm or under, ignoring anything under 30) waits about 10 seconds. Estimated SpO₂ at or under 92% waits about 8 seconds; at or under 88% waits about 5 seconds. A doubled or halved pulse while the wrist is still is marked suspect and is not alarmed. The board speaks the firmware decision. It does not re-decide from one sample.
- **MQ-6 gas alarm.** The buzzer sounds when the raw ADC count stays at or above **1800** for about 5 seconds. It clears below **1500**. That number is not a percent of the explosive limit. BME688 gas resistance is a separate reading and does not raise this alarm. The heater needs about 10–15 minutes after each power-up.
- **Buttons and buzzer.** GPIO 4 (active low) cancels fall grace and silences a health or gas alarm until the reading recovers. GPIO 40 raises an alarm. GPIO 5 is the buzzer at 2.7 kHz. Each condition has its own pattern: raised alarm, gas, critical health, fall distress, low SpO₂, low pulse, high pulse, fall grace. Serial `alarm` and `ack` do the same thing before the buttons are wired. `fall` still opens the 10-second cancel window.
- **Packet size stayed put.** Health and gas travel in unused flag bits (`FLAG_HR_HIGH` through `FLAG_GAS_HIGH`). The packed ESP-NOW packet is still 187 bytes.
- **Shared log.** A dev server no longer posts every packet to the hosted log. Writes wait 2 seconds apart. An HTTP 429 waits about 15 seconds and does not drop the local board. Local `POST /api/telemetry` was already succeeding when that red line appeared.
- **Sensors that are reporting.** SCD40, MAX30102 (estimated pulse and SpO₂), MPU-6050 on the left wrist (idle, walk, run, and the WEDA-FALL score), BME688 with the gas heater on (320 °C, 150 ms, off the motion loop), and the MQ-6 count.
- **Incidents and routes.** Save an address and the board geocodes it, then requests a driving option from an approximate Malugay Street origin. Routes are advisory.
- **Router form.** Wi-Fi name and password are entered on the dashboard and stored on the computer and on the ESP32. Changing routers does not require an edit to `config.h` after the boards are flashed with this firmware.

## What is live

- **Node A (wearable):** ESP32-S3-DevKitC-1, wearer `FF-01`. Motion is sampled and sent about every 100 ms. Air sensors are polled on a slower non-blocking tick. Wi-Fi on this node is only for learning the gateway channel.
  - SCD40 on GPIO 8/9: CO₂, sensor temperature, humidity.
  - BME688 on GPIO 17/18: air temperature, humidity, pressure, and gas resistance. The heater is on (320 °C, 150 ms) and does not block the motion loop. That resistance is not the MQ-6 alarm.
  - MAX30102 on GPIO 8/9: estimated heart rate and SpO₂ while a finger covers the glass. Not a clinical reading. See [Reading limits](#reading-limits).
  - MPU-6050 on GPIO 8/9, **VCC on 3.3 V**: acceleration and gyro. Powering this module from 5 V pulls SDA/SCL above 3.3 V and locks the pulse sensor.
  - MQ-6: heater on the devkit 5 V pin, analog output on GPIO 1 through a resistor divider. The log shows a raw ADC count, not %LEL.
  - MPU-6050 is worn on the **left wrist**. The motion class is idle, walk, or run from acceleration magnitude. Fall grace opens from the WEDA-FALL magnitude score (3 seconds, threshold 0.72) or from the impact heuristic.
- **Node B (gateway):** Receives ESP-NOW, prints JSON on USB, and can POST a link heartbeat to the hosted board. Live wearer packets reach the dashboard through the USB bridge, not through a direct ESP32 POST to the laptop.
- **Web board:** `http://localhost:3000` from `web/`. Use `npm start` after `npm run build` for a test or demo. Use `npm run dev` only while editing the site. **Load sample crew** fills FF-01 and FF-02 with simulated packets so the layout can be reviewed without hardware.

Packet path: Node A ESP-NOW → Node B USB serial → `web/serial-bridge.py` (local post and hosted post on background threads) → `POST /api/telemetry`. The API answers immediately and writes the log in the background. The board refreshes about twice a second.

## Placeholders

Slots exist. The parts are not installed, and the firmware does not probe a missing I2C address. Turn a flag on only after that driver is linked.

| Slot | Role | Flag |
| --- | --- | --- |
| GPS | A satellite fix, or a last-known point that is not the current position | `GPS_ENABLED` |
| 2000 mAh LiPo gauge | Battery percent | `BATTERY_SENSE_ENABLED` |
| Touchscreen | Local grace prompt on a display. The buzzer is already fitted on GPIO 5 | `TOUCHSCREEN_INSTALLED` |
| ECDSA P-256 | Sign the packet prefix. Not encryption | `ECDSA_SIGNING_ENABLED` |
| Cellular modem | Planned gateway uplink | `CELLULAR_MODEM_INSTALLED` |
| BME688 gas heater | On. Resistance is published. It is not an LPG or CO alarm | `setGasHeater(320, 150)` in `features.cpp` |

## Router

On the board, open **Router**, enter the Wi-Fi name and password, and click **Save router**. The board project stores that in its own `data/network.json`, which is not committed.

Then either:

- Plug in the gateway and run `npm run bridge`. It auto-finds the COM port (no `COMx` needed) and sends the saved router over USB.
- Leave the gateway online. About every 20 seconds it reads `GET /api/network` and joins the saved router.

Flash Node A and Node B once with this firmware so they can store the router. After that flash, later router changes are only the form. `config.h` is used only on a board that has never saved credentials. Do not commit a real Wi-Fi password.

Anyone who can open the dashboard can read the saved password.

## Firmware

Open each PlatformIO project separately:

- `firmware/node-a`
- `firmware/node-b`

Wearer id, telemetry URL, Node B MAC, and the ESP-NOW channel are still in:

- `firmware/node-a/include/config.h`
- `firmware/node-b/include/config.h`

**Pin map (all boards, all modules):** see **[firmware/PINOUT.md](firmware/PINOUT.md)**.

Summary for Node A: SCD40, MAX30102 (`0x57`, INT open), and MPU-6050 share **GPIO 8 (SDA)** and **GPIO 9 (SCL)**. GPIO 8 is SDA. GPIO 9 is SCL. By default the BME688 uses a **second I2C bus** on **GPIO 17 (SDA)** and **GPIO 18 (SCL)** (`BME688_SEPARATE_I2C_BUS` in `config.h`). MQ-6 analog is **GPIO 1**. GPS uses UART **15/16**. Cancel button is **GPIO 4**. Raise-alarm button is **GPIO 40**. Buzzer is **GPIO 5**. The full map is **PINOUT.md**.

## Motion model

The shoulder idle/walk model is gone. The live score is a magnitude logistic regression trained on the converted [WEDA-FALL](datasets/weda-fall/README.md) 10 Hz wrist windows (30 samples, about 3 seconds). The same weights sit in `web/lib/weda-fall.ts` and `firmware/node-a/include/weda_fall.h`. Features are accel min, max, spread, gyro max, the share of samples under 0.6 g and over 2.2 g, whether a dip comes before an impact, and the accel swing. Axes are not used, because the Fitbit and this MPU-6050 are not mounted the same way.

On held-out volunteers (user number divisible by 5) a threshold of 0.72 caught 80% of fall trials and also fired on 22% of daily-activity trials. Those falls were acted onto a mattress by younger volunteers. This is a review cue, not a medical alarm. The freefall-then-impact check still opens grace on its own. Type `fall` on the wearable serial port to open it by hand.

The dashboard scores packets that are already arriving, so the wearer page updates before a new flash. The wearable itself opens grace only after both boards are flashed with this firmware. Motion class stays **Waiting** until 30 fresh samples land inside 4 seconds (about a 10 Hz stream). A fall score at or above the threshold is labeled **Fall** and the board holds **grace** for 10 seconds. Otherwise the same window is labeled **Idle**, **Walk**, or **Run**. `cancelled` from the wearable clears the fall hold. A device state of grace, distress, or possible is left as the wearable sent it.

The wearable’s MPU-6050 is on the **left wrist**. Idle, walk, and run come from the public [mHealth](datasets/mhealth/README.md) recordings (standing, sitting, lying, walking, jogging, and running), converted to g and kept at 10 Hz. That sensor was on the volunteers’ right wrist. The live score uses acceleration magnitude only, which is the same on a left wrist, so the weights are not flipped. Held-out volunteers 5 and 10 were classified correctly on 99.7% of 3-second windows. The published gyroscope in that set barely moves. Climbing, crawling, and a real fireground gait were not in the training set.

Record new takes with the sensor on the left wrist. Open the wearable serial port at 115200 and type one line:

```text
rec idle
rec walk
rec fall
rec off
```

`rec` marks the next 45 seconds. Keep that one motion steady. The packet log shows **Recording walk** (or whichever label). Both boards must be flashed with this firmware or the gateway drops the longer packet. Then, from `web/`, with `DATABASE_URL` in `.env.local`:

```bash
npm run dataset:export -- --label walk --tagged --last 2h
```

That writes `datasets/mpu/walk.<stamp>.csv` with columns `timestamp,accX,accY,accZ,gyrX,gyrY,gyrZ`. Those files are takes from this wearable. The public wrist set is separate, in [datasets/weda-fall](datasets/weda-fall/README.md). Do not mix either one with the old shoulder recordings.

## Reading limits

These show up in the packet log and are properties of this firmware, not a broken dashboard column.

- **BME gas resistance** is ohms from the heater, not the MQ-6 count and not a percent LEL. A 0 there means that sample had no resistance yet, not that the heater is switched off.
- **Heart rate can jump from about 80 to about 160.** The detector treats a second bump in the same pulse (the dicrotic notch, motion, or a loose finger) as another beat. Intervals from 300 ms to 1500 ms are kept, so a doubled 80 bpm beat is stored as 160. A steady finger with one peak per beat stays near the real rate. It is an estimate.
- **SpO₂** is `110 - 25 × (red/IR ratio)`. Values outside 70–100 are blank. 71 and 81 are that formula, not a medical oxygen reading.
- **Red and infrared** are blank when the stored packet has no raw counts. Flash both nodes from this repo so the gateway forwards those fields.
- **Duplicate rows** with the same sequence are the same packet stored twice. Sequence gaps are packets that did not make it through the radio or the bridge.
- **Fall** opens grace from the WEDA-FALL score, the impact heuristic, or the serial command `fall`. A quiet wrist stays `idle` with motion class Clear once the 3-second window is full.
- **GPS** is `—` because no receiver is fitted. **Signature** is `unsigned` because signing is off.

## Record of work (15 Nov 2026, PHT)

These are on `master` at GitHub. Pull, then flash Node A and Node B together. Restart `npm run dev` in `web/` after the pull.

| Commit | What it did |
| --- | --- |
| `d15f63c` | Forward-declared `sharedBusOn` so Node A compiles. The SCD40 address check was calling it before the declaration. |
| `e3ce478` | Cross-checks the MPU-6050 with the pulse. High heart rate during a run is exertion. Low pulse and low SpO₂ alarm on their own. GPIO 4 silences, GPIO 40 raises, GPIO 5 buzzes. The board prints a sentence for each decision. |
| `6a37d5b` | MQ-6 alarm at a raw count of 1800, held 5 seconds, clear below 1500. Same cancel button. Not a percent LEL. |
| `1fcfba8` | Shared hosted log waits 2 seconds between writes and backs off about 15 seconds on HTTP 429. The local board keeps the packet. |
| `8847f5f` | First restyle of the board: token-based dark surfaces. |
| `d748560` | Put `/station-bg.jpg` back and replaced the serif titles with Geist so the board stays a monitoring tool. |

Earlier the same day, and already on `master` before those commits: MAX30102 red and infrared with an estimated pulse and SpO₂, the shared I2C bus restored after the SparkFun library opens `Wire`, the USB bridge posting off the serial thread, the wrist idle/walk/run and WEDA-FALL scores, and the BME688 heater publishing gas resistance without stalling the 100 ms loop.

To see health and gas sentences on the board, both firmware images have to be the ones that send the `health` object. A gateway flashed earlier will still show the raw numbers and will omit the alarm sentence.

## Web app

The board is in `web/`. Run the commands in this section from that folder.

### Starting the board

`npm start` and `npm run dev` both listen on port 3000. Start only one of them. The second fails with `EADDRINUSE`.

For a test or a demo, serve the built site. `npm run dev` compiles each page the first time it is opened, so changing tabs is slow until that compile finishes.

After the website code changes, build once, then start. On Linux use the same two commands in bash:

```bash
npm run build
npm start
```

Leave that window open and open http://localhost:3000

The next time the computer starts, `npm start` is enough until the website code changes again. Run `npm run build` again only after a change under `web/`.

While editing the site, stop `npm start` with Ctrl+C, then:

```bash
npm run dev
```

`npm run dev` starts the site and the USB bridge together. Plug in both boards first. The bridge reads the gateway serial port and posts each packet to `http://127.0.0.1:3000/api/telemetry`. The wearable is not opened by the site; it sends radio packets to the gateway. Close any serial monitor on the gateway port before starting, or the bridge cannot lock that port.

`npm run bridge` still starts the bridge alone. One bridge only: a second copy cannot open the same port.

The public landing page is open without login. Board routes (`/overview`, `/crew`, `/incidents`, and the rest of the shell) require a signed-in station account.

### Demo admin login

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `admin123` |

Change this password before any real station deployment. Create additional users from the separate board project with `npm run user:create -- <username> <password>`.

`npm test` checks packet normalization, signature verification, route parsing, and router-field validation.

If Windows Firewall blocks the ESP32 from POSTing to the PC, keep the gateway on USB and run:

```bash
npm run bridge
```

That auto-finds the gateway COM port (it will not stay on the wearable), forwards Node B serial JSON to the hosted board and to `/api/telemetry`, and pushes the saved router to the gateway. Optional override: `python serial-bridge.py COM7`. Restart the bridge after updating it. A window left open from before this fix keeps the old port and the gateway stays on last seen.

Main routes:

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- `POST /api/telemetry` and `GET /api/telemetry`
- `POST /api/demo` for the sample crew
- `GET` and `PUT /api/network`
- `GET` and `POST /api/incidents`, `PATCH /api/incidents/:id`
- `GET /api/crew`
- `GET /api/routes` for advisory driving options

## Neon Postgres setup

Login users, crew roster, incidents, local nodes, and telemetry history live in **Neon Postgres** (project console: [https://console.neon.tech](https://console.neon.tech)). The app uses Drizzle ORM with the `@neondatabase/serverless` HTTP driver and the pooled `DATABASE_URL`.

### 1. Neon account and project (website)

1. Open [https://console.neon.tech](https://console.neon.tech) and sign in (or create an account).
2. Create or open an organization, then a Postgres project (this repo is linked to project `withered-boat-44245331` on branch `production` when using the team Neon account).
3. In the project, open **Dashboard → Connection details**. Copy the **pooled** connection string (host contains `-pooler`) for runtime queries, and note the **direct** (non-pooler) URL for migrations if you pull both.

You can also create a free project from scratch, then point this app at it with the CLI steps below.

### 2. Neon CLI (recommended for this repo)

From any machine with Node.js:

```bash
npm i -g neon@latest
# if that fails: use npx neon@latest in place of neon below
neon login
```

If `neon login` opens a browser, finish sign-in there. Then, in the separate board project:

```bash
npx neon skills -y
neon init -y --org-id <YOUR_ORG_ID> --project-id <YOUR_PROJECT_ID> --branch production --services postgres
neon deploy
neon env pull --file .env.local -s postgres
```

`neon deploy` applies that project's `neon.ts`. `neon env pull` writes `DATABASE_URL` and related vars into its `.env.local`. Do not commit `.env.local`.

Also set a session signing secret in that project's `.env.local` (any long random string):

```env
SESSION_SECRET=replace-with-a-long-random-string
```

Org / project IDs for the existing FIREALERT Neon project:

| Setting | Value |
| --- | --- |
| Org ID | `org-sweet-dust-25386727` |
| Project ID | `withered-boat-44245331` |
| Branch | `production` |

Those values are also stored in `.neon` after `neon init`.

### 3. Schema, seed, and admin user

Run these in the separate board project, not in this firmware repository:

```bash
npm install
npm run db:push
npm run db:seed
node --experimental-strip-types scripts/ensure-admin.ts
npm run verify:neon
```

- `db:push` creates/updates tables from the board project's `lib/db/schema.ts` (users, crew_members, incidents, incident_assignments, local_nodes, telemetry_packets).
- `db:seed` loads sample crew (FF-01 … FF-04) and a local node row.
- `ensure-admin.ts` creates or resets the demo account **`admin` / `admin123`**.
- `verify:neon` runs a live Postgres + auth probe.

Then start the board from `web/` with `npm run build` and `npm start`, as in [Starting the board](#starting-the-board). Sign in at http://localhost:3000 with `admin` / `admin123`. You should land on `/overview`.

### 4. Manual connection string (no CLI)

If you prefer the website only:

1. Neon Console → your project → **Connect**.
2. Choose the pooled connection string.
3. In the separate board project, create `.env.local`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
SESSION_SECRET=replace-with-a-long-random-string
```

4. Run the schema / seed / ensure-admin commands from section 3.

### Env vars used by the app

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon URL for Next.js API routes (required) |
| `DATABASE_URL_UNPOOLED` | Direct URL (migrations / tooling; pulled by Neon CLI) |
| `SESSION_SECRET` | Signs the JWT cookie for board login |

## Limits

- Not a substitute for SCBA, VHF radio, dispatch, or certified gas instruments.
- No indoor positioning. A last-known GPS point is labeled and is not the current position.
- ESP-NOW is one hop from wearable to gateway, not an automatic mesh.
- ISO/IEC 25010 evaluation with station users has not been run.
