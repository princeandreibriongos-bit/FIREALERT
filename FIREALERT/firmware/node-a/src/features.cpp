#include "features.h"

#include <Arduino.h>
#include <Wire.h>
#include <SensirionI2cScd4x.h>
#include <math.h>
#include <string.h>

#include "config.h"

static SensirionI2cScd4x g_scd4x;
static bool g_scd40Ready = false;
static FallState g_fall = FALL_IDLE;
static uint32_t g_graceStartMs = 0;

static int32_t g_lastLatE7 = GPS_COORD_ABSENT;
static int32_t g_lastLonE7 = GPS_COORD_ABSENT;
static int16_t g_lastAltDm = GPS_ALT_ABSENT;
static uint8_t g_lastSats = GPS_SATELLITES_ABSENT;
static bool g_haveLastFix = false;

static bool wifiNameIsPlaceholder() {
  return WIFI_SSID == nullptr || WIFI_SSID[0] == '\0' || strcmp(WIFI_SSID, "YOUR_WIFI_SSID") == 0;
}

// Exposed for the boot log in main via a weak-free local helper.
bool wearableWifiConfigured() { return !wifiNameIsPlaceholder(); }

static bool pollFallCommand() {
  static char buf[16];
  static size_t n = 0;
  bool fired = false;
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      buf[n] = '\0';
      if (n >= 4 && strncasecmp(buf, "fall", 4) == 0) {
        fired = true;
      }
      n = 0;
    } else if (n + 1 < sizeof(buf)) {
      buf[n++] = c;
    }
  }
  return fired;
}

// Edge Impulse TinyML slot. No model is linked, so this never fires on motion.
static bool predictFall(const WearableReadings &) { return false; }

static bool cancelHeld() {
  if (!CANCEL_BUTTON_ENABLED) {
    return false;
  }
  return digitalRead(CANCEL_BUTTON_PIN) == LOW;
}

static void requestLocalAlert(uint8_t &outputs) {
  outputs = static_cast<uint8_t>(ALERT_BUZZER | ALERT_SCREEN);
}

static void tickFall(WearableReadings &out) {
  if (g_fall == FALL_CANCELLED) {
    g_fall = FALL_IDLE;
  }

  const uint32_t now = millis();
  const bool command = pollFallCommand();
  const bool cancel = cancelHeld();
  const bool alert =
      g_fall == FALL_GRACE || g_fall == FALL_POSSIBLE || g_fall == FALL_DISTRESS;
  bool justCancelled = false;
  if (cancel && alert) {
    g_fall = FALL_CANCELLED;
    justCancelled = true;
    Serial.println("[node-a] fall cue cancelled");
  }

  if (g_fall == FALL_GRACE) {
    const uint32_t elapsed = now - g_graceStartMs;
    if (elapsed >= FALL_GRACE_MS) {
      g_fall = FALL_DISTRESS;
      Serial.println("[node-a] grace elapsed — distress");
    }
  }

  const bool trigger = !justCancelled && g_fall == FALL_IDLE && (command || predictFall(out));
  if (trigger) {
    g_fall = FALL_GRACE;
    g_graceStartMs = now;
    Serial.printf("[node-a] possible fall — %lu ms to cancel\n", static_cast<unsigned long>(FALL_GRACE_MS));
  }

  out.grace_remaining_ms = 0;
  out.alert_outputs = 0;
  if (g_fall == FALL_GRACE) {
    const uint32_t left = FALL_GRACE_MS - (now - g_graceStartMs);
    out.grace_remaining_ms = static_cast<uint16_t>(left > 65535u ? 65535u : left);
    requestLocalAlert(out.alert_outputs);
  } else if (g_fall == FALL_DISTRESS) {
    requestLocalAlert(out.alert_outputs);
  }

  out.fall_state = static_cast<uint8_t>(g_fall);
}

static bool beginScd40() {
  if (!SCD40_ENABLED) {
    Serial.println("[node-a] SCD40 disabled");
    return false;
  }

  g_scd4x.begin(Wire, SCD40_I2C_ADDR);
  g_scd4x.wakeUp();
  g_scd4x.stopPeriodicMeasurement();
  g_scd4x.reinit();

  uint64_t serialNumber = 0;
  const int16_t identityError = g_scd4x.getSerialNumber(serialNumber);
  if (identityError) {
    Serial.printf("[node-a] SCD40 not found at 0x%02X (err %d)\n", SCD40_I2C_ADDR, identityError);
    return false;
  }

  Serial.printf("[node-a] SCD40 serial %012llX\n", static_cast<unsigned long long>(serialNumber));
  const int16_t startError = g_scd4x.startPeriodicMeasurement();
  if (startError) {
    Serial.printf("[node-a] SCD40 startPeriodicMeasurement failed (%d)\n", startError);
    return false;
  }
  Serial.println("[node-a] SCD40 periodic measurement started");
  return true;
}

static void readScd40(WearableReadings &out) {
  if (!g_scd40Ready) {
    return;
  }
  bool dataReady = false;
  int16_t error = g_scd4x.getDataReadyStatus(dataReady);
  if (error || !dataReady) {
    return;
  }
  uint16_t co2 = 0;
  float temperature = NAN;
  float humidity = NAN;
  error = g_scd4x.readMeasurement(co2, temperature, humidity);
  if (error || co2 == 0) {
    return;
  }
  out.scd40 = true;
  out.co2_ppm = static_cast<float>(co2);
  out.scd40_temperature_c = temperature;
  out.scd40_humidity_rh = humidity;
}

static void readBme688(WearableReadings &) {
  // Driver is intentionally not linked. A missing device must not be probed:
  // a stuck I2C read would stall the wearable.
  if (BME688_ENABLED) {
    Serial.println("[node-a] BME688 flag is on but the driver is not linked");
  }
}

static void readMax30102(WearableReadings &) {
  if (MAX30102_ENABLED) {
    Serial.println("[node-a] MAX30102 flag is on but the driver is not linked");
  }
}

static void readMpu6050(WearableReadings &) {
  if (MPU6050_ENABLED) {
    Serial.println("[node-a] MPU-6050 flag is on but the driver is not linked");
  }
}

static void readGps(WearableReadings &out) {
  if (GPS_ENABLED) {
    Serial.println("[node-a] GPS flag is on but the driver is not linked");
  }
  // When a fix is parsed, store it in g_last* and set gps_fix.
  // After loss of fix, report last-known separately — never as the current position.
  if (!out.gps_fix && g_haveLastFix) {
    out.gps_last_known = true;
    out.latitude_e7 = g_lastLatE7;
    out.longitude_e7 = g_lastLonE7;
    out.altitude_dm = g_lastAltDm;
    out.gps_satellites = g_lastSats;
  }
}

static void readBattery(WearableReadings &out) {
  if (!BATTERY_SENSE_ENABLED) {
    return;
  }
  const int raw = analogRead(BATTERY_ADC_PIN);
  const float voltage = (static_cast<float>(raw) / 4095.0f) * 3.3f * BATTERY_DIVIDER_RATIO;
  float percent = (voltage - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100.0f;
  if (percent < 0.0f) percent = 0.0f;
  if (percent > 100.0f) percent = 100.0f;
  out.battery = true;
  out.battery_percent = static_cast<uint8_t>(percent);
}

void featuresBegin() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, I2C_FREQUENCY_HZ);
  if (CANCEL_BUTTON_ENABLED) {
    pinMode(CANCEL_BUTTON_PIN, INPUT_PULLUP);
  }
  if (BUZZER_INSTALLED) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
  }

  g_scd40Ready = beginScd40();
  Serial.printf("[node-a] placeholders bme=%d max30102=%d mpu=%d gps=%d battery=%d screen=%d buzzer=%d ecdsa=%d model=%s\n",
                BME688_ENABLED, MAX30102_ENABLED, MPU6050_ENABLED, GPS_ENABLED, BATTERY_SENSE_ENABLED,
                TOUCHSCREEN_INSTALLED, BUZZER_INSTALLED, ECDSA_SIGNING_ENABLED, FALL_MODEL_ID);
  Serial.println("[node-a] serial command: fall");
}

void featuresRead(WearableReadings &out) {
  out = {};
  out.co2_ppm = NAN;
  out.scd40_temperature_c = NAN;
  out.scd40_humidity_rh = NAN;
  out.bme_temperature_c = NAN;
  out.bme_humidity_rh = NAN;
  out.pressure_hpa = NAN;
  out.gas_resistance_ohm = NAN;
  out.heart_rate_bpm = NAN;
  out.spo2_percent = NAN;
  out.accel_x = out.accel_y = out.accel_z = NAN;
  out.gyro_x = out.gyro_y = out.gyro_z = NAN;
  out.latitude_e7 = GPS_COORD_ABSENT;
  out.longitude_e7 = GPS_COORD_ABSENT;
  out.altitude_dm = GPS_ALT_ABSENT;
  out.gps_satellites = GPS_SATELLITES_ABSENT;
  out.battery_percent = BATTERY_PERCENT_ABSENT;

  readScd40(out);
  readBme688(out);
  readMax30102(out);
  readMpu6050(out);
  readGps(out);
  readBattery(out);
  tickFall(out);
}

bool featuresSign(TelemetryPacket &packet) {
  packet.signature_len = 0;
  memset(packet.signature, 0, sizeof(packet.signature));
  if (!ECDSA_SIGNING_ENABLED) {
    return false;
  }
  // Provision a P-256 key locally, SHA-256 the bytes before signature_len,
  // and store a DER signature. Do not commit the private key.
  Serial.println("[node-a] ECDSA enabled but no key is compiled in");
  return false;
}
