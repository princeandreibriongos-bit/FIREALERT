# FIREALERT

Prototype wearable and incident board for the New Makati Central Fire Station capstone. It supplements radio and dispatch. It is not protective equipment, and it does not make tactical or medical decisions.

The stack is an ESP32-S3 wrist node, an ESP32-S3 field gateway, and a Next.js board.

## Updates

- **Monitoring board.** Crew list, physiology, environment, motion and fall, location, signature status, incidents, and advisory driving routes. Sensors that are not installed stay marked awaiting hardware.
- **Fall grace period.** A 10-second cancel window is in the firmware. The Edge Impulse model slot is empty, so motion alone does not raise a cue. Type `fall` on the wearable serial port to start the window. GPIO 4 (pull-up, active low) cancels it.
- **Signed telemetry slot.** Packet version 2 carries every capstone field. ECDSA P-256 can sign the prefix once a key is provisioned. A signature checks authenticity and integrity. It does not encrypt the packet. The gateway still accepts the older 24-byte packet.
- **Incidents and routes.** Save an address and the board geocodes it, then requests a driving option from an approximate Malugay Street origin. Routes are advisory.
- **Router form.** Wi-Fi name and password are entered on the dashboard and stored on the computer and on the ESP32. Changing routers does not require an edit to `config.h` after the boards are flashed with this firmware.

## What is live

- **Node A (wearable):** ESP32-S3 reads the SCD40 (CO₂, sensor temperature, humidity) and sends ESP-NOW to the gateway. Wi-Fi on this node is only for learning the gateway channel.
- **Node B (gateway):** Receives ESP-NOW and POSTs JSON. Wi-Fi is the stand-in uplink until a cellular modem is installed.
- **Web board:** `http://localhost:3000` after `npm run dev`. **Load sample crew** fills FF-01 and FF-02 with simulated packets so the layout can be reviewed without hardware.

## Placeholders

Slots exist. The parts are not installed, and the firmware does not probe a missing I2C address. Turn a flag on only after that driver is linked.

| Slot | Role | Flag |
| --- | --- | --- |
| MAX30102 `0x57` | Heart rate and estimated SpO₂. Not a clinical measurement | `MAX30102_ENABLED` |
| BME688 `0x77` | Device air temperature, humidity, pressure, gas resistance. Not CO₂ and not core body temperature | `BME688_ENABLED` |
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

- Plug in the gateway and run `npm run bridge`. The bridge sends the saved router over USB.
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

SCD40 wiring on Node A (ESP32-S3-DevKitC-1, USB at the bottom, left header): **3V3**, **GPIO 8 (SDA)**, **GPIO 9 (SCL)**, **GND**. Use 3.3 V, not 5 V.

Reserved pins, not initialized: cancel button GPIO 4, buzzer GPIO 5, battery sense GPIO 6, GPS RX 16 / TX 15. Confirm them against the N16R8 pinout before wiring.

## Web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

`npm test` checks packet normalization, signature verification, route parsing, and router-field validation.

If Windows Firewall blocks the ESP32 from POSTing to the PC, keep the gateway on USB and run:

```bash
npm run bridge
```

That forwards Node B serial JSON to `/api/telemetry` and pushes the saved router to the board.

Main routes:

- `POST /api/telemetry` and `GET /api/telemetry`
- `POST /api/demo` for the sample crew
- `GET` and `PUT /api/network`
- `GET` and `POST /api/incidents`, `PATCH /api/incidents/:id`
- `GET /api/routes` for advisory driving options

## Limits

- Not a substitute for SCBA, VHF radio, dispatch, or certified gas instruments.
- No indoor positioning. A last-known GPS point is labeled and is not the current position.
- ESP-NOW is one hop from wearable to gateway, not an automatic mesh.
- ISO/IEC 25010 evaluation with station users has not been run.
