#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <math.h>
#include <string.h>

#include "config.h"
#include "features.h"
#include "telemetry.h"

static uint16_t g_sequence = 0;

static void onEspNowSent(const uint8_t *mac, esp_now_send_status_t status) {
  Serial.print("[node-a] ESP-NOW send ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
  (void)mac;
}

static bool initEspNow() {
  WiFi.mode(WIFI_STA);

  uint8_t homeChannel = WIFI_CHANNEL;
  if (wearableWifiConfigured()) {
    WiFi.begin(wearableWifiSsid(), wearableWifiPassword());
    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT_MS) {
      delay(250);
    }
    if (WiFi.status() == WL_CONNECTED) {
      homeChannel = static_cast<uint8_t>(WiFi.channel());
      Serial.printf("[node-a] channel lock via Wi-Fi  IP=%s  channel=%u\n",
                    WiFi.localIP().toString().c_str(), homeChannel);
    } else {
      Serial.println("[node-a] Wi-Fi join failed; locking ESP-NOW channel manually");
    }
  } else {
    Serial.printf("[node-a] no Wi-Fi configured; locking ESP-NOW channel %u\n", WIFI_CHANNEL);
  }

  if (WiFi.status() != WL_CONNECTED) {
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);
    homeChannel = WIFI_CHANNEL;
  }

  Serial.print("[node-a] STA MAC=");
  Serial.println(WiFi.macAddress());
  Serial.printf("[node-a] ESP-NOW channel %u  packet %u bytes\n", homeChannel,
                static_cast<unsigned>(sizeof(TelemetryPacket)));

  if (esp_now_init() != ESP_OK) {
    Serial.println("[node-a] esp_now_init failed");
    return false;
  }
  esp_now_register_send_cb(onEspNowSent);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, NODE_B_MAC, 6);
  peer.channel = 0;
  peer.encrypt = false;
  peer.ifidx = WIFI_IF_STA;
  if (!esp_now_is_peer_exist(NODE_B_MAC) && esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("[node-a] esp_now_add_peer failed");
    return false;
  }
  return true;
}

static void applyFloat(float *dst, bool ok, float value) {
  if (dst) *dst = ok ? value : NAN;
}

static void fillPacket(TelemetryPacket &packet, const WearableReadings &in) {
  memset(&packet, 0, sizeof(packet));
  packet.version = TELEMETRY_VERSION;
  packet.sequence = ++g_sequence;
  packet.timestamp_ms = millis();
  packet.fall_state = in.fall_state;
  strncpy(packet.wearer_id, DEVICE_ID, sizeof(packet.wearer_id) - 1);

  applyFloat(&packet.co2_ppm, in.scd40, in.co2_ppm);
  applyFloat(&packet.scd40_temperature_c, in.scd40, in.scd40_temperature_c);
  applyFloat(&packet.scd40_humidity_rh, in.scd40, in.scd40_humidity_rh);
  applyFloat(&packet.bme_temperature_c, in.bme688, in.bme_temperature_c);
  applyFloat(&packet.bme_humidity_rh, in.bme688, in.bme_humidity_rh);
  applyFloat(&packet.pressure_hpa, in.bme688, in.pressure_hpa);
  applyFloat(&packet.gas_resistance_ohm, in.bme688, in.gas_resistance_ohm);
  applyFloat(&packet.heart_rate_bpm, in.max30102, in.heart_rate_bpm);
  applyFloat(&packet.spo2_percent, in.max30102, in.spo2_percent);
  applyFloat(&packet.accel_x, in.mpu6050, in.accel_x);
  applyFloat(&packet.accel_y, in.mpu6050, in.accel_y);
  applyFloat(&packet.accel_z, in.mpu6050, in.accel_z);
  applyFloat(&packet.gyro_x, in.mpu6050, in.gyro_x);
  applyFloat(&packet.gyro_y, in.mpu6050, in.gyro_y);
  applyFloat(&packet.gyro_z, in.mpu6050, in.gyro_z);
  packet.mq6_raw = in.mq6 ? in.mq6_raw : MQ6_RAW_ABSENT;

  packet.latitude_e7 = (in.gps_fix || in.gps_last_known) ? in.latitude_e7 : GPS_COORD_ABSENT;
  packet.longitude_e7 = (in.gps_fix || in.gps_last_known) ? in.longitude_e7 : GPS_COORD_ABSENT;
  packet.altitude_dm = (in.gps_fix || in.gps_last_known) ? in.altitude_dm : GPS_ALT_ABSENT;
  packet.gps_satellites = in.gps_satellites;
  packet.battery_percent = in.battery ? in.battery_percent : BATTERY_PERCENT_ABSENT;
  packet.grace_remaining_ms = in.grace_remaining_ms;
  packet.alert_outputs = in.alert_outputs;

  if (in.scd40) packet.flags |= FLAG_SCD40_OK;
  if (in.bme688) packet.flags |= FLAG_BME688_OK;
  if (in.max30102) packet.flags |= FLAG_MAX30102_OK;
  if (in.mpu6050) packet.flags |= FLAG_MPU6050_OK;
  if (in.mq6) packet.flags |= FLAG_MQ6_OK;
  if (in.gps_fix) packet.flags |= FLAG_GPS_FIX;
  if (in.gps_last_known) packet.flags |= FLAG_GPS_LAST_KNOWN;
  if (in.battery) packet.flags |= FLAG_BATTERY_OK;
  if (in.fall_state == FALL_POSSIBLE || in.fall_state == FALL_GRACE) packet.flags |= FLAG_FALL_POSSIBLE;
  if (in.fall_state == FALL_DISTRESS) packet.flags |= FLAG_DISTRESS;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("[node-a] FIREALERT wearable boot");
  featuresBegin();
  if (!initEspNow()) {
    Serial.println("[node-a] ESP-NOW init failed — halt");
    while (true) {
      delay(1000);
    }
  }
}

void loop() {
  WearableReadings readings = {};
  featuresRead(readings);

  TelemetryPacket packet = {};
  fillPacket(packet, readings);
  if (featuresSign(packet)) {
    packet.flags |= FLAG_SIGNED;
  }

  if (readings.scd40) {
    Serial.printf("[node-a] SCD40 CO2=%.0f ppm T=%.2f C RH=%.1f %%\n", readings.co2_ppm,
                  readings.scd40_temperature_c, readings.scd40_humidity_rh);
  }
  if (readings.bme688) {
    Serial.printf("[node-a] BME688 T=%.2f C RH=%.1f %% P=%.0f hPa gas=%.0f ohm\n", readings.bme_temperature_c,
                  readings.bme_humidity_rh, readings.pressure_hpa, readings.gas_resistance_ohm);
  } else {
    Serial.println("[node-a] BME688 no reading");
  }
  if (readings.mpu6050) {
    Serial.printf("[node-a] MPU-6050 g=%.2f %.2f %.2f dps=%.1f %.1f %.1f\n", readings.accel_x, readings.accel_y,
                  readings.accel_z, readings.gyro_x, readings.gyro_y, readings.gyro_z);
  } else {
    Serial.println("[node-a] MPU-6050 no reading");
  }
  if (readings.mq6) {
    Serial.printf("[node-a] MQ-6 raw=%u\n", readings.mq6_raw);
  } else {
    Serial.println("[node-a] MQ-6 no reading");
  }

  const esp_err_t sendResult =
      esp_now_send(NODE_B_MAC, reinterpret_cast<const uint8_t *>(&packet), sizeof(packet));
  if (sendResult != ESP_OK) {
    Serial.printf("[node-a] esp_now_send err %d\n", static_cast<int>(sendResult));
  }

  delay(SAMPLE_INTERVAL_MS);
}
