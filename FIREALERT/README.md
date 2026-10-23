# FIREALERT

Prototype wearable and incident board for the New Makati Central Fire Station capstone. It supplements radio and dispatch. It is not protective equipment and it does not make tactical or medical decisions.

## What is live

- **Node A:** ESP32-S3, SCD40 on I2C (CO₂, sensor temperature, humidity), ESP-NOW to the gateway. A 10-second fall-cancel state machine is in the firmware. Type `fall` on the wearable serial port to start it. GPIO 4 (pull-up, active low) cancels.
- **Node B:** Receives ESP-NOW and POSTs JSON. Wi-Fi is the stand-in uplink until a cellular modem is installed. Version 1 packets are still accepted.
- **Web board:** Crew list, physiology, environment, motion and fall, location, signature status, incidents, and advisory driving routes.

## Placeholders (slots exist, parts are not installed)

| Slot | Role | Firmware flag |
| --- | --- | --- |
| MAX30102 `0x57` | Heart rate, estimated SpO₂ (not clinical) | `MAX30102_ENABLED` |
| BME688 `0x77` | Device air temperature, humidity, pressure, gas resistance. Not CO₂ and not core temperature | `BME688_ENABLED` |
| MPU-6050 `0x68` | Acceleration and gyro for the fall model | `MPU6050_ENABLED` |
| GPS | Fix, or a last-known point that must not be shown as current | `GPS_ENABLED` |
| 2000 mAh LiPo gauge | Battery percent | `BATTERY_SENSE_ENABLED` |
| Touchscreen and buzzer | Local grace prompt | `TOUCHSCREEN_INSTALLED`, `BUZZER_INSTALLED` |
| Edge Impulse model | On-device fall inference | `predictFall()` returns false |
| ECDSA P-256 | Sign the packet prefix. Not encryption | `ECDSA_SIGNING_ENABLED` |
| Cellular modem | Planned gateway uplink | `CELLULAR_MODEM_INSTALLED` |

Do not turn a sensor flag on until that driver is linked. The firmware will not probe a missing I2C address.

## Firmware

Open each PlatformIO project separately:

- `firmware/node-a`
- `firmware/node-b`

Set Wi-Fi SSID, password, telemetry URL, wearer id, and Node B MAC / channel in:

- `firmware/node-a/include/config.h`
- `firmware/node-b/include/config.h`

Do not commit real Wi-Fi passwords.

SCD40 wiring on Node A (ESP32-S3-DevKitC-1, USB at bottom, left header): **3V3**, **GPIO 8 (SDA)**, **GPIO 9 (SCL)**, **GND**. Use 3.3 V, not 5 V.

## Web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

The board groups packets by wearer. **Load sample crew** fills the empty slots with simulated packets so the layout can be reviewed without hardware. **Save incident** geocodes an address when coordinates are omitted and requests advisory driving routes from the station. Those routes are not dispatch orders.

`npm test` checks packet normalization, signature verification, and route parsing.

If the gateway cannot POST because of Windows Firewall, keep both ESP32s on USB and run:

```bash
npm run bridge
```

That forwards Node B serial JSON into `/api/telemetry`.
