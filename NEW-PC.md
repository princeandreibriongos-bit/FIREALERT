# New PC setup

Read this file first on a machine that just cloned the repo. It is the handoff for the next person or the next coding assistant. Hardware details that are not repeated here live in [firmware/PINOUT.md](firmware/PINOUT.md). Product context lives in [README.md](README.md).

This is a capstone prototype for New Makati Central Fire Station. It is not protective equipment and it does not replace a certified gas detector, SCBA, or radio.

## What the system is

| Piece | What it is | How it talks |
| --- | --- | --- |
| Node A, wearable | ESP32-S3-DevKitC-1. Wearer id `FF-01`. USB serial number `B8:1F:3F:D8:18:EC` | ESP-NOW to the gateway. Wi-Fi is only used to learn the gateway's channel |
| Node B, gateway | ESP32-S3-DevKitC-1. USB serial number `14:C1:9F:C8:57:D8` | Receives ESP-NOW, joins Wi-Fi, prints JSON on USB |
| Web board | Separate project, not this folder | `http://localhost:3000`. XAMPP/Apache does not serve this app |

COM port numbers change on every PC. Identify the boards by the USB serial number above, not by COM5 or COM6. Native-USB DevKits show up as USB Serial Device, VID `303A`, PID `1001`. Some kits (including replacements) use a WCH UART bridge instead: **CH343** (`1A86:55D3`), **CH340** (`1A86:7523`), or **CH9102** (`1A86:55D4`). `npm run bridge` accepts those. It does not stay on a remembered COM port, and it leaves a port that prints `[node-a]`. The gateway is the port that prints `[node-b]` heartbeats.

Node B firmware mirrors logs and Wi-Fi commands on **both** native USB CDC and UART0 (CH343). If the bridge only prints `sent router …` and never `heartbeat`, reflash Node B from this repo so the CH343 port speaks `[node-b]` lines. ESP32 radios are **2.4 GHz only** — a saved SSID named like `…5GHz…` will not join.

ESP-NOW only works when both radios are on the same channel. The wearable learns that channel by joining the same Wi-Fi network as the gateway. If the wearable is still on the room router (lab channel 9) and the gateway moves to a phone hotspot (lab channel 1), the wearable looks disconnected. Both devices must be given the new network. The wearable defaults to **ESP-NOW broadcast** so a replacement gateway does not need its MAC edited into `config.h`.

## What a new machine needs

Install these before flashing or opening the board. Versions that are already known to build this repo: Node.js 20 or newer, Python 3.10 or newer, PlatformIO via pip (the PlatformIO IDE is optional).

| Tool | Why | Check |
| --- | --- | --- |
| Git | Clone and pull `master` | `git --version` |
| Node.js 20+ and npm | `web/` Next.js board | `node -v` |
| Python 3 | USB bridge and PlatformIO | `python3 --version` |
| pyserial | `web/serial-bridge.py` | `python3 -c "import serial"` |
| PlatformIO | Flash `firmware/node-a` and `firmware/node-b` | `pio --version` or `python3 -m platformio --version` |
| A C/C++ build (gcc, make, python3-venv) | PlatformIO compiles the ESP32 images | `gcc --version` |
| USB serial access | The bridge and the uploader open `/dev/ttyACM*` or `/dev/ttyUSB*` | User is in the `dialout` group on Linux |

Optional, only if this computer should sign in and keep history in Neon:

- `web/.env.local` with `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, and `SESSION_SECRET` (at least 32 characters). Copy the names from `web/.env.example`. Do not commit that file.
- Neon CLI (`npm i -g neon@latest`, then `neon login`) if you are pulling the existing project instead of pasting the connection string. Org `org-sweet-dust-25386727`, project `withered-boat-44245331`, branch `production`. Then from `web/`: `npm run db:push`, `npm run db:seed`, and `node --experimental-strip-types scripts/ensure-admin.ts`.

Without `DATABASE_URL` the site can still be built, and the USB bridge can still post packets, but sign-in returns 503 and roster scripts refuse to run. The hosted board at `https://firealert-three.vercel.app` already has its own database. The laptop bridge posts there and to `http://127.0.0.1:3000/api/telemetry`.

Do not copy `data/network.json` into git. A new clone has no Wi-Fi password until someone types it on the Gateway page. `config.h` still contains a lab fallback SSID; treat that file as lab-only and do not add another password to the docs or to a commit.

## Install on Linux (Pop!_OS / Ubuntu)

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 python3-pip python3-venv
sudo usermod -aG dialout "$USER"
```

Log out and back in so `dialout` applies. Then:

```bash
# Node.js 20 if `node -v` is missing or older. NodeSource or the distro package both work.
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

python3 -m venv "$HOME/.firealert-pio"
"$HOME/.firealert-pio/bin/pip" install -U pip platformio
python3 -m pip install --user pyserial

cd web
npm install
npm test
```

Pop!_OS often has no `python3 -m platformio` until that venv exists. Use `"$HOME/.firealert-pio/bin/pio"` for every flash. `npm run bridge` uses `python3` on Linux and only needs pyserial, not PlatformIO.

Plug in both boards. They appear as `/dev/ttyACM0` and `/dev/ttyACM1` on native USB, or `/dev/ttyUSB*` on a CH340/CH343 adapter. If a port is missing, the user is not in `dialout` or another program (a serial monitor) already has the port.

## Install on Windows

1. Git.
2. Node.js 20 or newer.
3. Python 3. Then, from this firmware repo:

```powershell
python -m pip install pyserial platformio
```

`pio` is often missing from PATH. Use `python -m platformio`.

PowerShell does not accept `&&`. Run commands one at a time, or separate them with `;`.

## Run the board

From `web/` in this repo. The PowerShell blocks below are the Windows form. On Linux run the same `npm` lines in bash, one command at a time, from `web/`.

Linux, after `npm install`:

```bash
cd web
npm test
npm run build
npm start
```

Leave that window open. In a second terminal, with the gateway plugged in and no serial monitor on its port:

```bash
cd web
npm run bridge
```

`npm run dev` also starts the bridge. Use it only while editing the site, and do not run it beside `npm start`.

```powershell
npm install
npm test
```

`npm start` and `npm run dev` both use port 3000. Run only one.

For a test or a demo, build first so tab changes stay fast. After the website code changes:

```powershell
npm run build
npm start
```

The next start on this computer can skip `npm run build` until `web/` changes again. While editing the site, stop `npm start` and run `npm run dev` instead.

Leave that window open. `http://localhost:3000` refuses the connection when no board server is running. The server listens on `0.0.0.0:3000`.

Plug in the gateway. In a second window, from `web/`:

```powershell
npm run bridge
```

`npm run bridge` uses the Windows `py -3` launcher (not the Microsoft Store `python` stub). The bridge auto-detects Node B by USB serial (`14:C1:9F:C8:57:D8` when that board is used), by listening for `[node-b]` if both ESP32s are plugged in, and by remembering the last working port in the board project's `data/bridge-port.json`. COM numbers can change when you swap PCs or boards — you do not need to pass `COMx`. Optional override: `npm run bridge -- COM7` or `py -3 serial-bridge.py COM7`. If nothing is plugged in yet, the bridge waits and retries.

If `python` alone opens the Microsoft Store, turn off **Settings → Apps → Advanced app settings → App execution aliases → python.exe / python3.exe**, or keep using `npm run bridge` / `py -3`.

The bridge forwards gateway serial JSON to the hosted board first (`https://firealert-three.vercel.app`), then to `http://127.0.0.1:3000/api/telemetry`. The page you are looking at reads that hosted log. A bridge that only posts to localhost leaves the gateway on “last seen”. Windows Firewall usually blocks the ESP32 from POSTing straight to the PC. Open the serial port with DTR and RTS off. The default pyserial settings reset the board or swallow the Wi-Fi line.

Restart the bridge after pulling this fix. An already-open window keeps the old port picker. Stop it and run `npm run bridge` again from the board project. If that folder is an older copy, run `py -3 firmware\tools\serial-bridge.py` from this repo instead. If the pill stays on last seen, the window should print `Gateway detected on COMx` and `gateway wifi=up`. A window that only prints wearable lines was on the wrong board.

The bridge also sends the active Wi-Fi name to the gateway and to the other ESP32 (the wearable) so both end up on the same channel. Restart the bridge after pulling a new `serial-bridge.py`. An already-running bridge keeps the old code.

## Wi-Fi: two saved networks

Open **Gateway** on the board (`/gateway`).

- **Room router** and **Phone hotspot** are stored separately in the board project's `data/network.json`.
- Saving one does not erase the other.
- The active one is what the bridge sends to the devices.
- **Use room router** switches back to the saved router without retyping it.

That file is gitignored. A fresh clone has no passwords. Type them on the Gateway page. Do not put a real password in `config.h`, and do not commit `network.json`.

Anyone who can open the dashboard can read the saved password. There is no login.

The room router is `PLDTHOMEFIBRYeau4`. The gateway and the wearable both join that network. The password is stored on the gateway flash and in the board project's `data/network.json`. A phone hotspot must be 2.4 GHz. On Android, turn on maximize compatibility and keep the phone awake.

`network.json` shape:

```json
{
  "active": "router",
  "ssid": "the-network-the-gateway-should-join",
  "password": "not-committed",
  "router": { "ssid": "", "password": "", "updated_at": null },
  "hotspot": { "ssid": "", "password": "", "updated_at": null }
}
```

The top-level `ssid` mirrors the active profile. `GET /api/network` and `PUT /api/network` use that file. A USB line the firmware accepts is `wifi`, a tab, the SSID, a tab, the password.

## Flash on Linux

Do not flash Node A onto the gateway. Identify the port by the boot line (`[node-a]` or `[node-b]`), not by assuming ACM0 is the wearable.

```bash
cd /path/to/FIREALERT
"$HOME/.firealert-pio/bin/pio" run -t upload -d firmware/node-b --upload-port /dev/ttyACM0
"$HOME/.firealert-pio/bin/pio" run -t upload -d firmware/node-a --upload-port /dev/ttyACM1
```

Close the USB bridge and any serial monitor before uploading. If the upload says the port is busy, stop `npm run bridge` first. After a sensor bus lock (pulse LED stuck dim, `MAX30102 0x57 no ack`), unplug the devkit USB so the sensors lose power, seat the wiring, plug the USB back in, then press reset. A reset alone does not power-cycle the MAX30102.

## Firmware on this PC

`firmware/node-b/include/config.h` still has an old LAN `TELEMETRY_URL`. That address is not this PC, and a direct packet POST there does not update the dashboard. Link heartbeats are different: when Node B is on Wi-Fi it posts them to `HOSTED_LINK_URL` (`https://firealert-three.vercel.app/api/link`), which is the log this board reads. Reflash Node B after pulling this change or a gateway that is already joined still looks undetected. USB serial remains the path for the wearable packets. The USB bridge still works when that LAN URL is wrong.

`WIFI_SSID` in both `config.h` files is a placeholder. After the first USB save, the boards keep the name in their own flash. `config.h` is used only when a board has never stored credentials.

Flash each project on its own port. Do not flash Node A onto the gateway.

```powershell
cd firmware\node-b
python -m platformio run -t upload --upload-port COM_OF_GATEWAY

cd firmware\node-a
python -m platformio run -t upload --upload-port COM_OF_WEARABLE
```

Both PlatformIO envs need the `Preferences` library. It is already in each `platformio.ini`. The Arduino core on this platform does not provide it by itself.

Node A `WIFI_CHANNEL` is `9`, which matched the lab router. If the wearable cannot join Wi-Fi, it falls back to that channel. A gateway on another channel will then look like a disconnected wearable. Fix the join, or set `WIFI_CHANNEL` to the channel the gateway reports on the Gateway page, then flash Node A again.

## Sensors that are on the wearable now

Full pin map: [firmware/PINOUT.md](firmware/PINOUT.md). All logic-level signals are 3.3 V. Do not tie a sensor's 5 V pin to an ESP32 GPIO.

| Sensor | Bus | Address | What it is |
| --- | --- | --- | --- |
| SCD40 | GPIO 8 SDA, GPIO 9 SCL | `0x62` | Real CO₂, plus the sensor's own temperature and humidity |
| MAX30102 | GPIO 8 SDA, GPIO 9 SCL | `0x57` | Estimated heart rate and SpO₂ while a finger covers the glass. INT left open. VIN is 3.3 V. A dim LED means the chip was not initialized or the bus is latched; unplug USB, then reset |
| MPU-6050 | GPIO 8 SDA, GPIO 9 SCL | `0x68` with AD0 to GND | Accel and gyro. **VCC must be 3.3 V.** A 5 V VCC lets the module pull-ups drive SDA/SCL above 3.3 V and the MAX30102 stops answering |
| BME688 | GPIO 17 SDA, GPIO 18 SCL | `0x77` when SDO is tied to 3.3 V. `0x76` when SDO is tied to GND | Device-air temperature, humidity, pressure. Gas resistance reads 0 because the heater is off |
| MQ-6 | Analog GPIO 1 | none | Heater VCC to the devkit **5 V** pin. AO through two 10 kΩ resistors to GPIO 1 (divider to GND). DO left open. Raw ADC count, not %LEL. Heater needs about 10–15 minutes after each power-up |

The BME688 is not on the SCD40 pins. The MAX30102 and the MPU-6050 are. They share GPIO 8 and GPIO 9 with the SCD40. The BME688 stays on its own pair because each ESP32 pin only has one female dupont for a separate bus. The BME688 driver is the Adafruit BME680 library on `TwoWire(1)`. The bus is chosen in the constructor (`Adafruit_BME680(&g_bme688Wire)`). `begin()` takes the address only. Passing the bus as the second argument does not select the bus. Gas resistance is not a carbon monoxide or LPG alarm. CO₂ comes from the SCD40 only. BME temperature is air at the board, not body temperature.

Type `scan` on the wearable serial port to print which addresses answer on each bus.

## Not installed yet

Do not turn these flags on until the part is wired and a driver is linked. They are listed in `firmware/node-a/include/config.h` and in the README placeholder table.

- GPS, battery divider, buzzer, and touchscreen
- ECDSA packet signing (`ECDSA_SIGNING_ENABLED` is false, so the log says `unsigned`)
- Cellular modem on the gateway
- BME688 gas heater. Leave it off unless you accept a slower loop. With it off, gas resistance is 0 on purpose

The MPU-6050 is worn on the left wrist. The fall score is WEDA-FALL magnitudes (`weda-fall` in the packet). The motion class is idle, walk, or run from acceleration magnitude. Both need the last 3 seconds of motion samples. Serial command `fall` starts the 10-second cancel window. GPIO 4, active low, cancels it. `rec idle`, `rec walk`, and `rec fall` mark a 45-second wrist recording. Flash node A and node B together after pulling this tree so the wearable opens grace and prints the class itself. The dashboard also scores the packets the current firmware already sends.

MQ-6 is in the firmware (`MQ6_ENABLED`). The count in the log is the ADC reading after the divider.

## Rules for the next session

- Do not commit the board project's `data/network.json`, `.env` files, or anything under `.pio/` or `.next/`.
- Do not put Wi-Fi passwords in `config.h`.
- Do not point the USB bridge at the wearable port. The bridge's main port is the gateway. It opens the wearable only long enough to send the Wi-Fi line.
- A green gateway with no wearable packets is a channel mismatch until proven otherwise. Check the Gateway page for the gateway channel, then the wearable serial line `ESP-NOW channel`.
- Sample crew on the dashboard is fake data. Live packets overwrite it.
