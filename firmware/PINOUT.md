# FIREALERT pin map

Single source of truth for wiring is `firmware/node-a/include/config.h` and `firmware/node-b/include/config.h`. This document explains how those constants map to the board.

**Board:** Espressif **ESP32-S3-DevKitC-1** (N16R8 — 16 MB flash, 8 MB OPI PSRAM), as used in PlatformIO env `node-a` / `node-b`.

**Orientation:** USB connector at the **bottom** of the board; sensor header references the **left** pin column unless noted.

**Voltage:** All external I2C and GPIO interfaces are **3.3 V**. Do not connect sensor **5 V** pins to the ESP32.

---

## Node A (wearable) — overview

| GPIO | Function | Device / role | Firmware flag | Status |
| --- | --- | --- | --- | --- |
| **8** | I2C **SDA** | SCD40 (bus 0) | `I2C_SDA_PIN` | **In use** |
| **9** | I2C **SCL** | SCD40 (bus 0) | `I2C_SCL_PIN` | **In use** |
| **17** | I2C **SDA** | BME688 (bus 1, when separate) | `BME688_I2C_SDA_PIN` | **In use** |
| **18** | I2C **SCL** | BME688 (bus 1, when separate) | `BME688_I2C_SCL_PIN` | **In use** |
| **40** | — | Free. Do not use for the gyro while SDA/SCL are on the SCD40 bus | — | Open |
| **41** | — | Free. Do not use for the gyro while SDA/SCL are on the SCD40 bus | — | Open |
| **4** | Digital in (pull-up, **active low**) | Fall cancel button | `CANCEL_BUTTON_ENABLED` | **In use** |
| **5** | Digital out | Buzzer (+) | `BUZZER_INSTALLED` | Reserved / not fitted |
| **6** | ADC | Battery divider sense | `BATTERY_SENSE_ENABLED` | Reserved / not fitted |
| **7** | Digital | Touch controller CS (planned) | `TOUCHSCREEN_INSTALLED` | Reserved, not initialized |
| **10** | SPI CS | Display CS (planned) | — | Reserved, not initialized |
| **11** | Digital | Display DC (planned) | — | Reserved, not initialized |
| **12** | Digital | Display RST (planned) | — | Reserved, not initialized |
| **13** | Digital | Display backlight (planned) | — | Reserved, not initialized |
| **14** | SPI MOSI | Display (planned) | — | Reserved, not initialized |
| **15** | UART **TX** | GPS module RX | `GPS_ENABLED` | Reserved / not fitted |
| **16** | UART **RX** | GPS module TX | `GPS_ENABLED` | Reserved / not fitted |
| **21** | SPI SCK | Display (planned) | — | Reserved, not initialized |

**Not listed above:** On-board USB (serial + power), Wi-Fi / ESP-NOW (internal), no external antenna pins.

**Do not use for wiring (N16R8 octal PSRAM):** GPIO **35**, **36**, **37** (occupied by flash/PSRAM). Also avoid strapping pins **0**, **3**, **45**, **46** unless you know the boot implications.

---

## I2C wiring modes

**Default in this repo:** `BME688_SEPARATE_I2C_BUS = true` in `config.h` — SCD40 on **GPIO 8/9**, BME688 on **GPIO 17/18**. Use this when each ESP32 pin only has **one** dupont wire (no breadboard bus).

**Alternative:** Set `BME688_SEPARATE_I2C_BUS = false` and parallel-wire BME688 to the same **8/9** as SCD40 (breadboard or soldered bus).

The MPU-6050 shares **GPIO 8/9** with the SCD40. Leave **GPIO 17/18** for the BME688 only.

---

## Shared I2C bus 0 (GPIO 8 + 9) — SCD40 and optional sensors

On **bus 0**, devices share **one** SDA/SCL pair:

- **SDA → GPIO 8** (one wire, all devices in parallel)
- **SCL → GPIO 9** (one wire, all devices in parallel)
- **3V3** and **GND** bussed to every module

Each module must have a **unique I2C address** (set by hardware, e.g. BME688 SDO pin):

| Module | I2C address | Config constant | Driver / flag | Typical status |
| --- | --- | --- | --- | --- |
| SCD40 | `0x62` | `SCD40_I2C_ADDR` | `SCD40_ENABLED` | **Live** |
| BME688 | `0x77` or `0x76` | `BME688_I2C_ADDR` / `_ALT` | `BME688_ENABLED` | **Live** (tries both at boot) |
| MAX30102 | `0x57` | `MAX30102_I2C_ADDR` | `MAX30102_ENABLED` | Not installed |
| MPU-6050 | `0x68` | `MPU6050_I2C_ADDR` | `MPU6050_ENABLED` | **GPIO 8 / 9** with the SCD40 |

Bus speed: **100 kHz** (`I2C_FREQUENCY_HZ`).

```
                    ESP32-S3 Node A
                    ┌─────────────┐
              3V3 ──┤ 3V3         ├── 3V3 ── SCD40, BME688, (future sensors)
              GND ──┤ GND         ├── GND ── common ground
         GPIO 8 ────┤ SDA         ├── SDA ── parallel to all I2C devices
         GPIO 9 ────┤ SCL         ├── SCL ── parallel to all I2C devices
                    └─────────────┘
```

Most breakouts include **3.3 V I2C pull-ups** on SDA/SCL. If the bus is long or noisy, keep wires short and share one ground star at the ESP32.

---

## Node A — module wiring

### SCD40 (CO₂, sensor temp, humidity)

| SCD40 pin | Connect to Node A |
| --- | --- |
| VDD / 3V3 | **3V3** |
| GND | **GND** |
| SDA | **GPIO 8** |
| SCL | **GPIO 9** |

Address: **`0x62`** (fixed on SCD40).

---

### BME688 (air temp, humidity, pressure, gas resistance)

**With `BME688_SEPARATE_I2C_BUS = true` (dupont-friendly):**

| BME688 pin | Connect to Node A |
| --- | --- |
| VIN / VCC / 3V3 | **3V3** |
| GND | **GND** |
| SDA | **GPIO 17** |
| SCL | **GPIO 18** |
| SDO / ADDR | **3V3** → **`0x77`** · **GND** → **`0x76`** |
| CS (if present) | **3V3** (I2C mode) |

SCD40 stays on **GPIO 8 / 9** only. You need **four** wires to the BME688 plus **four** to the SCD40; **3V3** and **GND** can each use a second dupont from the same ESP32 pin if you carefully stack another female on the breadboard/ESP pin, or run two wires from one 3V3 and one GND pin on the board (there are usually several **3V3** and **GND** holes — use two different **GND** pins on the ESP32 header, both are common ground).

**With `BME688_SEPARATE_I2C_BUS = false`:** wire SDA/SCL to **GPIO 8 / 9** in parallel with SCD40 (see bus diagram above).

Not measured by BME688: **CO₂** (SCD40 only). Gas resistance is **not** a certified CO or VOC alarm.

---

### MAX30102 (planned — heart rate, SpO₂ estimate)

| MAX30102 pin | Connect to Node A |
| --- | --- |
| VIN / 3V3 | **3V3** |
| GND | **GND** |
| SDA | **GPIO 8** |
| SCL | **GPIO 9** |

Address: **`0x57`**. Enable only after driver is linked: `MAX30102_ENABLED = true` in `config.h`.

*(Interrupt pin not assigned in firmware yet — add to `config.h` when the driver is implemented.)*

---

### MPU-6050 (accel / gyro)

The gyro shares **GPIO 8 / 9** with the SCD40. Leave the BME688 alone on **GPIO 17 / 18**. Do not put **SDA** or **SCL** on the blue ground stripe.

| MPU-6050 pin | Connect to Node A |
| --- | --- |
| VCC | **5V** |
| GND | **GND** (blue stripe) |
| SDA | **GPIO 8** (same row as the SCD40 SDA) |
| SCL | **GPIO 9** (same row as the SCD40 SCL) |
| AD0 | **GND** (address **`0x68`**) |
| INT, XDA, XCL | Leave open |

---

### GPS UART (planned)

| GPS module | Connect to Node A |
| --- | --- |
| GPS **TX** | **GPIO 16** (ESP RX) |
| GPS **RX** | **GPIO 15** (ESP TX) |
| VCC | **3V3** (module-dependent; use 3.3 V GPS) |
| GND | **GND** |

Baud: **9600** (`GPS_BAUD`). Enable: `GPS_ENABLED = true` when driver is linked.

---

### Fall cancel button (live)

| Button | Connect to Node A |
| --- | --- |
| One leg | **GPIO 4** |
| Other leg | **GND** |

Internal **pull-up**; press = **LOW**. Used during fall grace to cancel the cue.

---

### Buzzer (planned)

| Buzzer | Connect to Node A |
| --- | --- |
| Control (+) / signal | **GPIO 5** |
| GND | **GND** |

Enable in firmware: `BUZZER_INSTALLED = true`.

---

### Battery sense (planned)

| Divider output | Connect to Node A |
| --- | --- |
| Sense (midpoint of divider) | **GPIO 6** (ADC) |
| Divider low side | **GND** |

Enable: `BATTERY_SENSE_ENABLED = true`. Tune `BATTERY_DIVIDER_RATIO`, `BATTERY_FULL_V`, `BATTERY_EMPTY_V` when hardware exists.

---

### Touchscreen + display (planned SPI)

Reserved in `config.h`; firmware does **not** initialize these yet.

| Signal | GPIO |
| --- | --- |
| Touch CS | **7** |
| Display CS | **10** |
| Display DC | **11** |
| Display RST | **12** |
| Backlight | **13** |
| MOSI | **14** |
| SCK | **21** |

Enable UI flags when fitted: `TOUCHSCREEN_INSTALLED`, and buzzer as needed.

---

## Node A — wireless (no GPIO)

| Link | Purpose |
| --- | --- |
| **ESP-NOW** | Telemetry to Node B (`NODE_B_MAC` in `config.h`) |
| **Wi-Fi STA** | Optional: join saved router to **learn RF channel** for ESP-NOW; not used to POST telemetry from the wearable |

Sample period: **5 s** (`SAMPLE_INTERVAL_MS`).

---

## Node B (field gateway) — interfaces

Node B has **no external sensor GPIO** in the current firmware. It uses:

| Interface | Role |
| --- | --- |
| **USB** | Power, serial log, optional `npm run bridge` (router + telemetry forward) |
| **Wi-Fi STA** | Join hotspot/router; **HTTP POST** to `TELEMETRY_URL` |
| **ESP-NOW** | Receive packets from wearables |

Configure in `firmware/node-b/include/config.h`:

- `TELEMETRY_URL` — PC running the dashboard (e.g. `http://192.168.x.x:3000/api/telemetry`)
- Router SSID/password — dashboard **Gateway network** (or `config.h` fallback)

Planned: **cellular modem** (`CELLULAR_MODEM_INSTALLED`) — UART/GPIO TBD when hardware is chosen.

After Node B connects to Wi-Fi, serial log prints **channel** and **STA MAC**. Set Node A **`WIFI_CHANNEL`** and **`NODE_B_MAC`** to match if not using dashboard-provisioned Wi-Fi on the wearable.

---

## Quick checklist when adding a sensor

1. Wire **3V3, GND, SDA (8), SCL (9)** unless the device is GPS (UART) or display (SPI).
2. Confirm **I2C address** does not conflict with existing devices.
3. Set the matching **`_*_ENABLED`** flag to `true` only after the driver is linked in firmware.
4. Rebuild and flash `firmware/node-a`.
5. Confirm boot log: `[node-a] … ready at 0x…` and dashboard **Environment** / **Physiology** sections.

---

## Document history

| Date | Change |
| --- | --- |
| 2026-10-27 | Initial pin map: shared I2C, SCD40 + BME688 live, planned GPS/MAX30102/MPU/display/battery/buzzer |
| 2026-10-27 | BME688 optional second I2C bus on GPIO 17/18 for dupont wiring |
| 2026-10-30 | MPU-6050 VCC on the 5V pin; SDA/SCL stay on GPIO 40/41 after a 3.3 V check |
| 2026-10-30 | MPU-6050 SDA/SCL moved onto GPIO 17/18 with the BME688 |
| 2026-10-30 | MPU-6050 returned to GPIO 40/41 after it stayed silent on both pairs |
| 2026-10-30 | MPU-6050 SDA/SCL moved onto GPIO 8/9 with the SCD40 |
