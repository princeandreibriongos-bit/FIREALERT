#pragma once

#include <stdint.h>

// --- Identity --------------------------------------------------------------
// Shown on the dashboard. Keep it short; the packet stores 7 characters.
static constexpr const char *DEVICE_ID = "FF-01";

// --- ESP-NOW ---------------------------------------------------------------
// The wearable does not use Wi-Fi for telemetry. It joins an AP only to learn
// the channel Node B is using. Set the router on the dashboard. These two
// constants are used only until the board has saved credentials of its own.
static constexpr uint8_t WIFI_CHANNEL = 9;
static constexpr const char *WIFI_SSID = "YOUR_WIFI_SSID";
static constexpr const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;

static const uint8_t NODE_B_MAC[6] = {0x14, 0xC1, 0x9F, 0xC8, 0x57, 0xD8};
static constexpr uint32_t SAMPLE_INTERVAL_MS = 5000;

// --- Shared I2C bus --------------------------------------------------------
// ESP32-S3-DevKitC-1, USB at the bottom, left header.
static constexpr int I2C_SDA_PIN = 8;
static constexpr int I2C_SCL_PIN = 9;
static constexpr uint32_t I2C_FREQUENCY_HZ = 100000;
// SCD40 stays alone on this bus. 50 kHz is within its clock-stretch limit.
static constexpr uint32_t SHARED_I2C_HZ = 50000;

static constexpr uint8_t SCD40_I2C_ADDR = 0x62;     // CO2, sensor temperature, humidity
// SDO → 3V3 gives 0x77; SDO → GND gives 0x76.
static constexpr uint8_t BME688_I2C_ADDR = 0x77;
static constexpr uint8_t BME688_I2C_ADDR_ALT = 0x76;
// Dupont wiring: SCD40 keeps GPIO 8/9. BME688 uses its own pair.
static constexpr bool BME688_SEPARATE_I2C_BUS = true;
static constexpr int BME688_I2C_SDA_PIN = 17;
static constexpr int BME688_I2C_SCL_PIN = 18;
static constexpr uint8_t MAX30102_I2C_ADDR = 0x57;  // heart rate, estimated SpO2 — not clinical
static constexpr uint8_t MPU6050_I2C_ADDR = 0x68;   // AD0 tied to GND. AD0 to 3V3 is 0x69.
// Shares GPIO 8/9 with the SCD40. Leave the BME688 alone on 17/18.
static constexpr bool MPU6050_SEPARATE_I2C_BUS = false;
static constexpr int MPU6050_I2C_SDA_PIN = 8;
static constexpr int MPU6050_I2C_SCL_PIN = 9;

// Set true only after that module is soldered and the matching driver is linked.
static constexpr bool SCD40_ENABLED = true;
static constexpr bool BME688_ENABLED = true;
static constexpr bool MAX30102_ENABLED = false;
static constexpr bool MPU6050_ENABLED = true;

// MQ-6 heater uses the devkit 5V pin. AO reaches GPIO 1 through two 10 kΩ
// resistors so the pin stays at or below 2.5 V. The count is relative, not %LEL.
static constexpr bool MQ6_ENABLED = true;
static constexpr int MQ6_ADC_PIN = 1;

// --- GPS (not installed) ---------------------------------------------------
// Last-known coordinates must never be labeled as the current position.
static constexpr bool GPS_ENABLED = false;
static constexpr int GPS_RX_PIN = 16;
static constexpr int GPS_TX_PIN = 15;
static constexpr uint32_t GPS_BAUD = 9600;

// --- Power, local alert, cancel --------------------------------------------
// Pins avoid strapping pins and the N16R8 octal-PSRAM bus. Confirm before wiring.
static constexpr bool BATTERY_SENSE_ENABLED = false;
static constexpr int BATTERY_ADC_PIN = 6;
static constexpr float BATTERY_DIVIDER_RATIO = 2.0f;  // placeholder until the divider exists
static constexpr float BATTERY_FULL_V = 4.2f;
static constexpr float BATTERY_EMPTY_V = 3.3f;

static constexpr bool BUZZER_INSTALLED = false;
static constexpr int BUZZER_PIN = 5;
static constexpr bool TOUCHSCREEN_INSTALLED = false;
// Reserved, not initialized: CS 10, DC 11, RST 12, BL 13, MOSI 14, SCK 21, touch CS 7.

static constexpr bool CANCEL_BUTTON_ENABLED = true;
static constexpr int CANCEL_BUTTON_PIN = 4;  // active low, internal pull-up
static constexpr uint32_t FALL_GRACE_MS = 10000;

// Edge Impulse library is not linked. predictFall() stays false.
static constexpr const char *FALL_MODEL_ID = "edge-impulse-placeholder";

// --- ECDSA -----------------------------------------------------------------
// Off until a private key is provisioned on the device. Do not commit a key.
// Signing covers the packet prefix only. It is not encryption.
static constexpr bool ECDSA_SIGNING_ENABLED = false;
