#pragma once

#include <stdint.h>

// --- User settings ---------------------------------------------------------
// ESP-NOW only works reliably when Node A uses the same 2.4 GHz channel as
// Node B's Wi-Fi AP. After Node B connects, read WiFi.channel() and set this.
static constexpr uint8_t WIFI_CHANNEL = 9;

// Same 2.4 GHz AP as Node B so ESP-NOW home channel matches the gateway.
static constexpr const char *WIFI_SSID = "YOUR_WIFI_SSID";
static constexpr const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;

static const uint8_t NODE_B_MAC[6] = {0x14, 0xC1, 0x9F, 0xC8, 0x57, 0xD8};

static constexpr const char *DEVICE_ID = "node-a";

// ESP32-S3-DevKitC-1 default Wire pins. Change if your board silkscreen differs.
static constexpr int I2C_SDA_PIN = 8;
static constexpr int I2C_SCL_PIN = 9;
static constexpr uint32_t I2C_FREQUENCY_HZ = 100000;

static constexpr uint8_t SCD40_I2C_ADDR = 0x62;

// Future Bosch BME688. Do not probe this address until the part is installed.
static constexpr uint8_t BME688_I2C_ADDR = 0x77;

static constexpr uint32_t SAMPLE_INTERVAL_MS = 5000;
