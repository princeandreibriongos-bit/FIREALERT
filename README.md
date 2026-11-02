# FIREALERT

Prototype wearable and incident board for the New Makati Central Fire Station capstone. It supplements radio and dispatch. It is not protective equipment, and it does not make tactical or medical decisions.

The stack is an ESP32-S3 wrist node, an ESP32-S3 field gateway, and a Next.js board.

On a new computer, read **[NEW-PC.md](NEW-PC.md)** before installing or flashing. It has the install list, the USB bridge, and the two saved Wi-Fi networks. The pin map is **[firmware/PINOUT.md](firmware/PINOUT.md)**.

## Updates

- **Monitoring board.** Crew list, physiology, environment, motion and fall, location, signature status, incidents, and advisory driving routes. Sensors that are not installed stay marked awaiting hardware.
- **Fall grace period.** A 10-second cancel window is in the firmware. The Edge Impulse model slot is empty, so motion alone does not raise a cue. Type `fall` on the wearable serial port to start the window. GPIO 4 (pull-up, active low) cancels it.
- **Signed telemetry slot.** Packet version 2 carries every capstone field. ECDSA P-256 can sign the prefix once a key is provisioned. A signature checks authenticity and integrity. It does not encrypt the packet. The gateway still accepts the older 24-byte packet.
- **Incidents and routes.** Save an address and the board geocodes it, then requests a driving option from an approximate Malugay Street origin. Routes are advisory.
- **Router form.** Wi-Fi name and password are entered on the dashboard and stored on the computer and on the ESP32. Changing routers does not require an edit to `config.h` after the boards are flashed with this firmware.

## What is live

- **Node A (wearable):** ESP32-S3 reads the SCD40 (CO₂, sensor temperature, humidity) and the BME688 (device air temperature, humidity, pressure, gas resistance) on the same I2C bus, then sends ESP-NOW to the gateway. Wi-Fi on this node is only for learning the gateway channel.
- **Node B (gateway):** Receives ESP-NOW and POSTs JSON. Wi-Fi is the stand-in uplink until a cellular modem is installed.
- **Web board:** `http://localhost:3000` after `npm run dev`. **Load sample crew** fills FF-01 and FF-02 with simulated packets so the layout can be reviewed without hardware.

## Placeholders

Slots exist. The parts are not installed, and the firmware does not probe a missing I2C address. Turn a flag on only after that driver is linked.

| Slot | Role | Flag |
| --- | --- | --- |
| MAX30102 `0x57` | Heart rate and estimated SpO₂. Not a clinical measurement | `MAX30102_ENABLED` |
| BME688 `0x77` / `0x76` | Device air temperature, humidity, pressure, gas resistance. Not CO₂ and not core body temperature | `BME688_ENABLED` (driver linked) |
| MPU-6050 `0x68` | Acceleration and gyro for the fall model | `MPU6050_ENABLED` |
| GPS | A satellite fix, or a last-known point that is not the current position | `GPS_ENABLED` |
| 2000 mAh LiPo gauge | Battery percent | `BATTERY_SENSE_ENABLED` |
| Touchscreen and buzzer | Local grace prompt | `TOUCHSCREEN_INSTALLED`, `BUZZER_INSTALLED` |
| Edge Impulse model | On-device fall inference | `predictFall()` returns false |
| ECDSA P-256 | Sign the packet prefix. Not encryption | `ECDSA_SIGNING_ENABLED` |
| Cellular modem | Planned gateway uplink | `CELLULAR_MODEM_INSTALLED` |

## Router

On the board, open **Router**, enter the Wi-Fi name and password, and click **Save router**. The file is `web/data/network.json` and is not committed.

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

Summary for Node A: SCD40 on **GPIO 8 (SDA)** and **GPIO 9 (SCL)**. By default the BME688 uses a **second I2C bus** on **GPIO 17 (SDA)** and **GPIO 18 (SCL)** so each sensor can use its own dupont wires (`BME688_SEPARATE_I2C_BUS` in `config.h`). GPS uses UART **15/16**; cancel button **GPIO 4**; see **PINOUT.md** for the full map.

## Web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

The public landing page is open without login. Board routes (`/overview`, `/crew`, `/incidents`, and the rest of the shell) require a signed-in station account.

### Demo admin login

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `admin123` |

Change this password before any real station deployment. Create additional users with `npm run user:create -- <username> <password>` from `web/`.

`npm test` checks packet normalization, signature verification, route parsing, and router-field validation.

If Windows Firewall blocks the ESP32 from POSTing to the PC, keep the gateway on USB and run:

```bash
npm run bridge
```

That auto-finds the gateway COM port, forwards Node B serial JSON to `/api/telemetry`, and pushes the saved router to the board. Optional override: `python serial-bridge.py COM7`.

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

If `neon login` opens a browser, finish sign-in there. Then from the **repository root** (`FIREALERT/`):

```bash
npx neon skills -y
neon init -y --org-id <YOUR_ORG_ID> --project-id <YOUR_PROJECT_ID> --branch production --services postgres
neon deploy
neon env pull --file web/.env.local -s postgres
```

`neon deploy` applies `neon.ts`. `neon env pull` writes `DATABASE_URL` and related vars into `web/.env.local`. Do not commit `.env.local`.

Also set a session signing secret in `web/.env.local` (any long random string):

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

```bash
cd web
npm install
npm run db:push
npm run db:seed
node --experimental-strip-types scripts/ensure-admin.ts
npm run verify:neon
```

- `db:push` creates/updates tables from `web/lib/db/schema.ts` (users, crew_members, incidents, incident_assignments, local_nodes, telemetry_packets).
- `db:seed` loads sample crew (FF-01 … FF-04) and a local node row.
- `ensure-admin.ts` creates or resets the demo account **`admin` / `admin123`**.
- `verify:neon` runs a live Postgres + auth probe.

Then start the board:

```bash
npm run dev
```

Open http://localhost:3000 → use **Sign in** with `admin` / `admin123` → you should land on `/overview`.

### 4. Manual connection string (no CLI)

If you prefer the website only:

1. Neon Console → your project → **Connect**.
2. Choose the pooled connection string.
3. Create `web/.env.local`:

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
