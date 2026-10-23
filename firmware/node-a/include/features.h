#pragma once

#include <stdint.h>

#include "telemetry.h"

struct WearableReadings {
  bool scd40;
  float co2_ppm;
  float scd40_temperature_c;
  float scd40_humidity_rh;

  bool bme688;
  float bme_temperature_c;
  float bme_humidity_rh;
  float pressure_hpa;
  float gas_resistance_ohm;

  bool max30102;
  float heart_rate_bpm;
  float spo2_percent;

  bool mpu6050;
  float accel_x, accel_y, accel_z;
  float gyro_x, gyro_y, gyro_z;

  bool gps_fix;
  bool gps_last_known;
  int32_t latitude_e7;
  int32_t longitude_e7;
  int16_t altitude_dm;
  uint8_t gps_satellites;

  bool battery;
  uint8_t battery_percent;

  uint8_t fall_state;
  uint16_t grace_remaining_ms;
  uint8_t alert_outputs;
};

void featuresBegin();
void featuresRead(WearableReadings &out);
bool wearableWifiConfigured();
const char *wearableWifiSsid();
const char *wearableWifiPassword();
// Returns false while ECDSA_SIGNING_ENABLED is off. Packet stays unsigned.
bool featuresSign(TelemetryPacket &packet);
