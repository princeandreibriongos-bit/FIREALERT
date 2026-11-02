# New PC setup

Read this file first on a machine that just cloned the repo. It is the handoff for the next person or the next coding assistant. Hardware details that are not repeated here live in [firmware/PINOUT.md](firmware/PINOUT.md). Product context lives in [README.md](README.md).

This is a capstone prototype for New Makati Central Fire Station. It is not protective equipment and it does not replace a certified gas detector, SCBA, or radio.

## What the system is

| Piece | What it is | How it talks |
| --- | --- | --- |
| Node A, wearable | ESP32-S3-DevKitC-1. Wearer id `FF-01`. USB serial number `B8:1F:3F:D8:18:EC` | ESP-NOW to the gateway. Wi-Fi is only used to learn the gateway's channel |
| Node B, gateway | ESP32-S3-DevKitC-1. USB serial number `14:C1:9F:C8:57:D8` | Receives ESP-NOW, joins Wi-Fi, prints JSON on USB |
| Web board | Next.js app in `web/` | `http://localhost:3000`. XAMPP/Apache does not serve this app |

COM port numbers change on every PC. Identify the boards by the USB serial number above, not by COM5 or COM6. Native-USB DevKits show up as USB Serial Device, VID `303A`, PID `1001`. Some kits (including replacements) use a WCH **CH343** bridge instead (`VID 1A86`, `PID 55D3`) — `npm run bridge` accepts those too. Prefer the port that prints `[node-b]` heartbeats.

Node B firmware mirrors logs and Wi-Fi commands on **both** native USB CDC and UART0 (CH343). If the bridge only prints `sent router …` and never `heartbeat`, reflash Node B from this repo so the CH343 port speaks `[node-b]` lines. ESP32 radios are **2.4 GHz only** — a saved SSID named like `…5GHz…` will not join.

ESP-NOW only works when both radios are on the same channel. The wearable learns that channel by joining the same Wi-Fi network as the gateway. If the wearable is still on the room router (lab channel 9) and the gateway moves to a phone hotspot (lab channel 1), the wearable looks disconnected. Both devices must be given the new network. The wearable defaults to **ESP-NOW broadcast** so a replacement gateway does not need its MAC edited into `config.h`.

## Install on Windows

1. Git.
2. Node.js 20 or newer.
3. Python 3. Then, from `web/`:

```powershell
python -m pip install pyserial platformio
```

`pio` is often missing from PATH. Use `python -m platformio`.

PowerShell does not accept `&&`. Run commands one at a time, or separate them with `;`.

## Run the board

From `web/`:

```powershell
npm install
npm test
npm run dev
```

Leave that window open. `http://localhost:3000` refuses the connection when the dev server is not running. The server listens on `0.0.0.0:3000`.

Plug in the gateway. In a second window, from `web/`:

```powershell
npm run bridge
```

`npm run bridge` uses the Windows `py -3` launcher (not the Microsoft Store `python` stub). The bridge auto-detects Node B by USB serial (`14:C1:9F:C8:57:D8` when that board is used), by listening for `[node-b]` if both ESP32s are plugged in, and by remembering the last working port in `web/data/bridge-port.json`. COM numbers can change when you swap PCs or boards — you do not need to pass `COMx`. Optional override: `npm run bridge -- COM7` or `py -3 serial-bridge.py COM7`. If nothing is plugged in yet, the bridge waits and retries.

If `python` alone opens the Microsoft Store, turn off **Settings → Apps → Advanced app settings → App execution aliases → python.exe / python3.exe**, or keep using `npm run bridge` / `py -3`.

The bridge forwards gateway serial JSON to `http://127.0.0.1:3000/api/telemetry`. Windows Firewall usually blocks the ESP32 from POSTing straight to the PC, so the USB bridge is the path that actually fills the dashboard. Open the serial port with DTR and RTS off. The default pyserial settings reset the board or swallow the Wi-Fi line.

The bridge also sends the active Wi-Fi name to the gateway and to the other ESP32 (the wearable) so both end up on the same channel. Restart the bridge after pulling a new `serial-bridge.py`. An already-running bridge keeps the old code.

## Wi-Fi: two saved networks

Open **Gateway** on the board (`/gateway`).

- **Room router** and **Phone hotspot** are stored separately in `web/data/network.json`.
- Saving one does not erase the other.
- The active one is what the bridge sends to the devices.
- **Use room router** switches back to the saved router without retyping it.

That file is gitignored. A fresh clone has no passwords. Type them on the Gateway page. Do not put a real password in `config.h`, and do not commit `network.json`.

Anyone who can open the dashboard can read the saved password. There is no login.

The lab router name was `PLDTHOMEFIBRYeau4`. The lab phone hotspot name was `zaibuzai`. Passwords stay off this page and off GitHub. A phone hotspot must be 2.4 GHz. On Android, turn on maximize compatibility and keep the phone awake.

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

## Firmware on this PC

`firmware/node-b/include/config.h` has `TELEMETRY_URL` set to `http://192.168.1.13:3000/api/telemetry`. That address is the previous PC. On a new computer, set it to this PC's IPv4 before flashing the gateway, for example `http://192.168.1.50:3000/api/telemetry`. The PC and the gateway must be on the same LAN. The USB bridge still works if that URL is wrong. A direct Wi-Fi POST from the gateway does not.

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
| BME688 | GPIO 17 SDA, GPIO 18 SCL | `0x77` when SDO is tied to 3.3 V. `0x76` when SDO is tied to GND | Device-air temperature, humidity, pressure, gas resistance |

The BME688 is not on the SCD40 pins. Each ESP32 pin only has one female dupont, so the sensors do not share a bus. The BME688 driver is the Adafruit BME680 library on `TwoWire(1)`. The bus is chosen in the constructor (`Adafruit_BME680(&g_bme688Wire)`). `begin()` takes the address only. Passing the bus as the second argument does not select the bus. Gas resistance is not a carbon monoxide or LPG alarm. CO₂ comes from the SCD40 only. BME temperature is air at the board, not body temperature.

Type `scan` on the wearable serial port to print which addresses answer on each bus.

## Not installed yet

Do not turn these flags on until the part is wired and a driver is linked. They are listed in `firmware/node-a/include/config.h` and in the README placeholder table.

- MAX30102, MPU-6050, GPS, battery divider, buzzer, touchscreen
- Edge Impulse fall model (`predictFall()` stays false). Serial command `fall` starts the 10-second cancel window. GPIO 4, active low, cancels it
- Cellular modem on the gateway
- MQ-6 LPG module. It is the chosen cheap leak sensor and it is not in the firmware yet. When it is added: module VCC to the devkit 5 V pin, GND to GND, AO to GPIO 1 through two 10 kΩ resistors (one from AO to GPIO 1, one from GPIO 1 to GND), DO left unconnected. Heater needs about 10–15 minutes after each power-up. The reading is a relative level, not %LEL

## Rules for the next session

- Do not commit `web/data/network.json`, `.env` files, or anything under `.pio/` or `web/.next/`.
- Do not put Wi-Fi passwords in `config.h`.
- Do not point the USB bridge at the wearable port. The bridge's main port is the gateway. It opens the wearable only long enough to send the Wi-Fi line.
- A green gateway with no wearable packets is a channel mismatch until proven otherwise. Check the Gateway page for the gateway channel, then the wearable serial line `ESP-NOW channel`.
- Sample crew on the dashboard is fake data. Live packets overwrite it.
