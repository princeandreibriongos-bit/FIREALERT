#pragma once

#include <stdint.h>

// Packed binary payload sent Node A -> Node B over ESP-NOW.
// Keep this well under the 250-byte ESP-NOW limit.
static constexpr uint8_t TELEMETRY_VERSION = 1;
static constexpr uint8_t FLAG_SCD40_OK = 1 << 0;
static constexpr uint8_t FLAG_BME688_OK = 1 << 1;

struct TelemetryPacket {
  uint8_t version;
  uint8_t flags;
  uint16_t sequence;
  uint32_t timestamp_ms;
  float co2_ppm;
  float temperature_c;
  float humidity_rh;
  // Future Bosch BME688 (I2C 0x77). NaN until that sensor is wired in.
  float gas_resistance_ohm;
} __attribute__((packed));

static_assert(sizeof(TelemetryPacket) <= 250, "ESP-NOW payload exceeds 250 bytes");
static_assert(sizeof(TelemetryPacket) == 24, "Unexpected telemetry packing; check compiler alignment");
