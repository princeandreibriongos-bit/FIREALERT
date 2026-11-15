#pragma once

#include <stddef.h>
#include <stdint.h>

// Packed ESP-NOW payload, Node A (wearable) -> Node B (field gateway).
// Version 2 carries every capstone sensor field. Missing hardware sends
// sentinel values; it does not omit the field.
// ECDSA covers bytes before signature_len. The signature is authenticity
// and integrity only — it does not encrypt the packet.

static constexpr uint8_t TELEMETRY_VERSION = 2;
static constexpr uint8_t TELEMETRY_VERSION_V1 = 1;
static constexpr size_t TELEMETRY_V1_SIZE = 24;

static constexpr int32_t GPS_COORD_ABSENT = INT32_MIN;
static constexpr int16_t GPS_ALT_ABSENT = INT16_MIN;
static constexpr uint8_t BATTERY_PERCENT_ABSENT = 255;
static constexpr uint8_t GPS_SATELLITES_ABSENT = 255;
static constexpr uint16_t MQ6_RAW_ABSENT = 0xFFFF;

enum TelemetryFlags : uint32_t {
  FLAG_SCD40_OK = 1u << 0,
  FLAG_BME688_OK = 1u << 1,
  FLAG_MAX30102_OK = 1u << 2,
  FLAG_MPU6050_OK = 1u << 3,
  FLAG_GPS_FIX = 1u << 4,
  FLAG_GPS_LAST_KNOWN = 1u << 5,
  FLAG_BATTERY_OK = 1u << 6,
  FLAG_FALL_POSSIBLE = 1u << 7,
  FLAG_DISTRESS = 1u << 8,
  FLAG_SIGNED = 1u << 9,
  FLAG_UPLINK_CELLULAR = 1u << 10,
  FLAG_MQ6_OK = 1u << 11,
  // Health decisions made on the wearable. A high pulse during a run is not FLAG_HR_HIGH.
  FLAG_HR_HIGH = 1u << 12,
  FLAG_HR_LOW = 1u << 13,
  FLAG_SPO2_LOW = 1u << 14,
  FLAG_SPO2_CRITICAL = 1u << 15,
  FLAG_MANUAL_ALARM = 1u << 16,
  FLAG_HEALTH_SILENCED = 1u << 17,
  FLAG_EXERTION_NOTE = 1u << 18,
  FLAG_PULSE_SUSPECT = 1u << 19,
};

enum FallState : uint8_t {
  FALL_IDLE = 0,
  FALL_POSSIBLE = 1,
  FALL_GRACE = 2,
  FALL_DISTRESS = 3,
  FALL_CANCELLED = 4,
};

static constexpr uint8_t ALERT_BUZZER = 1u << 0;
static constexpr uint8_t ALERT_SCREEN = 1u << 1;

// Legacy 24-byte packet (SCD40 + reserved BME688 gas). Still accepted by the gateway.
struct TelemetryPacketV1 {
  uint8_t version;
  uint8_t flags;
  uint16_t sequence;
  uint32_t timestamp_ms;
  float co2_ppm;
  float temperature_c;
  float humidity_rh;
  float gas_resistance_ohm;
} __attribute__((packed));

struct TelemetryPacket {
  uint8_t version;
  uint8_t fall_state;
  uint16_t sequence;
  uint32_t flags;
  uint32_t timestamp_ms;
  char wearer_id[8];

  float co2_ppm;
  float scd40_temperature_c;
  float scd40_humidity_rh;

  float bme_temperature_c;
  float bme_humidity_rh;
  float pressure_hpa;
  float gas_resistance_ohm;

  float heart_rate_bpm;
  float spo2_percent;

  float accel_x;
  float accel_y;
  float accel_z;
  float gyro_x;
  float gyro_y;
  float gyro_z;

  int32_t latitude_e7;
  int32_t longitude_e7;
  int16_t altitude_dm;
  uint8_t gps_satellites;
  uint8_t battery_percent;
  uint16_t grace_remaining_ms;
  uint8_t alert_outputs;

  uint8_t signature_len;
  uint8_t signature[64];

  // After the signed prefix so older signature checks keep the same offset.
  uint16_t mq6_raw;
  /** Edge Impulse class name: idle, walk, jump, … Empty until the window fills. */
  char activity_label[8];
  uint8_t activity_score;

  // Latest optical sample. Zero means the chip has not produced one yet.
  uint32_t max_red;
  uint32_t max_ir;

  // Set only while a serial "rec <label>" take is running. Empty otherwise.
  char capture_label[8];
} __attribute__((packed));

static constexpr size_t TELEMETRY_V2_LEGACY_SIZE = 171;
static constexpr size_t TELEMETRY_V2_LIGHT_SIZE = 179;

static_assert(sizeof(TelemetryPacketV1) == TELEMETRY_V1_SIZE, "v1 packet size drifted");
static_assert(sizeof(TelemetryPacket) <= 250, "ESP-NOW payload exceeds 250 bytes");
static_assert(sizeof(TelemetryPacket) == 187, "v2 packet size drifted");
static_assert(offsetof(TelemetryPacket, signature_len) == 95, "signed prefix drifted");
static_assert(offsetof(TelemetryPacket, max_red) == TELEMETRY_V2_LEGACY_SIZE, "raw light fields must stay after the old packet");
static_assert(offsetof(TelemetryPacket, capture_label) == TELEMETRY_V2_LIGHT_SIZE, "capture label must follow the raw light fields");
