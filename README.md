# FIREALERT

Prototype wearable and incident board for the New Makati Central Fire Station capstone. It supplements radio and dispatch. It is not protective equipment, and it does not make tactical or medical decisions.

The wearable and gateway firmware are in `firmware/`. The monitoring board is in `capstone/`.

On a new computer, read **[NEW-PC.md](NEW-PC.md)** before installing or flashing. It has the install list, the USB bridge, and the two saved Wi-Fi networks. The pin map is **[firmware/PINOUT.md](firmware/PINOUT.md)**.

## Updates

- **Monitoring board.** Crew list, physiology, environment, motion and fall, location, signature status, incidents, and advisory driving routes. Sensors that are not installed stay marked awaiting hardware.
- **Fall grace period.** A 10-second cancel window is in the firmware. The Edge Impulse model slot is empty, so motion alone does not raise a cue. Type `fall` on the wearable serial port to start the window. GPIO 4 (pull-up, active low) cancels it.
- **Health alarms.** A high pulse is alarmed only when it stays high while the wearer is not running. A low pulse, low blood oxygen, a high MQ-6 gas count, and a raised alarm each have their own buzzer pattern. The MQ-6 alarm level is a count of 1800, not a percent of the explosive limit. GPIO 4 silences a false alarm. GPIO 40 raises one. The buzzer is GPIO 5. Type `alarm` or `ack` on the wearable serial port to try the buttons before they are wired.
- **Signed telemetry slot.** Packet version 2 carries every capstone field. ECDSA P-256 can sign the prefix once a key is provisioned. A signature checks authenticity and integrity. It does not encrypt the packet. The gateway still accepts the older 24-byte packet.
- **Incidents and routes.** Save an address and the board geocodes it, then requests a driving option from an approximate Malugay Street origin. Routes are advisory.
- **Router form.** Wi-Fi name and password are entered on the dashboard and stored on the computer and on the ESP32. Changing routers does not require an edit to `config.h` after the boards are flashed with this firmware.

## What is live

- **Node A (wearable):** ESP32-S3-DevKitC-1, wearer `FF-01`. Motion is sampled and sent about every 100 ms. Air sensors are polled on a slower non-blocking tick. Wi-Fi on this node is only for learning the gateway channel.
  - SCD40 on GPIO 8/9: CO₂, sensor temperature, humidity.
  - BME688 on GPIO 17/18: air temperature, humidity, pressure. The gas heater is forced off so a heater cycle cannot stall the 100 ms loop, so **gas resistance stays 0**. That 0 is not a gas reading.
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
| Touchscreen and buzzer | Local grace prompt | `TOUCHSCREEN_INSTALLED`, `BUZZER_INSTALLED` |
| ECDSA P-256 | Sign the packet prefix. Not encryption | `ECDSA_SIGNING_ENABLED` |
| Cellular modem | Planned gateway uplink | `CELLULAR_MODEM_INSTALLED` |
| BME688 gas heater | Real gas resistance. Heater is off so the loop stays fast; the column reads 0 | `setGasHeater(0, 0)` in `features.cpp` |

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

- **Gas Ω = 0.** The BME688 heater is off. Temperature, humidity, and pressure on that row are still measured.
- **Heart rate can jump from about 80 to about 160.** The detector treats a second bump in the same pulse (the dicrotic notch, motion, or a loose finger) as another beat. Intervals from 300 ms to 1500 ms are kept, so a doubled 80 bpm beat is stored as 160. A steady finger with one peak per beat stays near the real rate. It is an estimate.
- **SpO₂** is `110 - 25 × (red/IR ratio)`. Values outside 70–100 are blank. 71 and 81 are that formula, not a medical oxygen reading.
- **Red and infrared** are blank when the stored packet has no raw counts. Flash both nodes from this repo so the gateway forwards those fields.
- **Duplicate rows** with the same sequence are the same packet stored twice. Sequence gaps are packets that did not make it through the radio or the bridge.
- **Fall** opens grace from the WEDA-FALL score, the impact heuristic, or the serial command `fall`. A quiet wrist stays `idle` with motion class Clear once the 3-second window is full.
- **GPS** is `—` because no receiver is fitted. **Signature** is `unsigned` because signing is off.

## Work landed on 15 Nov 2026 (PHT)

These commits were made on this tree and were not on GitHub until this push. Older history on `master` was already there.

- Wearable samples the MAX30102 (red + IR) and publishes an estimated heart rate and SpO₂.
- After the SparkFun library opens `Wire`, GPIO 8 and 9 are restored so the SCD40 and MPU-6050 stay on the bus.
- Heart rate is counted from infrared peaks, averaged over a short window.
- The USB bridge starts with the local board and posts on background threads so a slow hosted request cannot stall the serial read.
- Overview, sensors, wearer, and the packet log show pulse and raw light when the packet carries them.
- The shoulder idle/walk model was removed after the MPU-6050 moved to the wrist. The live fall score is the WEDA-FALL magnitude model.
- The board cache, the telemetry write, and the page refresh were shortened so the log moves in about a second instead of minutes.

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
