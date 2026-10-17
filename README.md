# FIREALERT

Prototype IoT firefighter wearable and field-gateway stack.

- **Node A (wearable):** ESP32-S3 reads a Sensirion SCD40 (CO₂ / temperature / humidity) and sends a packed struct over ESP-NOW. Bosch BME688 gas resistance is reserved in the payload but not probed until that sensor is installed.
- **Node B (gateway):** Receives ESP-NOW, joins Wi-Fi, and POSTs JSON to the web app.
- **Web app:** Next.js dashboard at `/` and `POST /api/telemetry`.

## Firmware

Open each PlatformIO project separately:

- `firmware/node-a`
- `firmware/node-b`

Set Wi-Fi SSID, password, telemetry URL, and Node B MAC / channel in:

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

If the gateway cannot POST because of Windows Firewall, keep both ESP32s on USB and run:

```bash
npm run bridge
```

That forwards Node B serial JSON into `/api/telemetry`.
