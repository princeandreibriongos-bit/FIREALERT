#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <math.h>
#include <string.h>

#include "config.h"
#include "ei_activity.h"
#include "features.h"
#include "telemetry.h"

static uint16_t g_sequence = 0;
static volatile bool g_lastSendOk = false;
static uint8_t g_homeChannel = WIFI_CHANNEL;

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowSent(const esp_now_send_info_t *txInfo, esp_now_send_status_t status) {
  (void)txInfo;
#else
static void onEspNowSent(const uint8_t *mac, esp_now_send_status_t status) {
  (void)mac;
#endif
  g_lastSendOk = status == ESP_NOW_SEND_SUCCESS;
  Serial.print("[node-a] ESP-NOW send ");
  Serial.println(g_lastSendOk ? "OK" : "FAIL");
}

static void setMaxRadioPower() {
  // Units are 0.25 dBm. 84 ≈ 21 dBm (max on most ESP32-S3 modules).
  esp_wifi_set_max_tx_power(84);
}

static void lockEspNowChannel(uint8_t channel) {
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);
  g_homeChannel = channel;
}

static bool ensureWifiChannel() {
  if (!wearableWifiConfigured()) return false;
  if (WiFi.status() == WL_CONNECTED) {
    const uint8_t ch = static_cast<uint8_t>(WiFi.channel());
    if (ch != g_homeChannel) {
      g_homeChannel = ch;
      Serial.printf("[node-a] Wi-Fi channel now %u\n", g_homeChannel);
    }
    return true;
  }
  // Never block the motion loop waiting for an AP — kick Wi-Fi and move on.
  static uint32_t lastBeginMs = 0;
  const uint32_t now = millis();
  if (lastBeginMs == 0 || now - lastBeginMs >= 15000) {
    lastBeginMs = now;
    WiFi.begin(wearableWifiSsid(), wearableWifiPassword());
    Serial.println("[node-a] Wi-Fi join kicked (non-blocking)");
  }
  return false;
}

static bool ensureWifiChannelBlockingBoot() {
  if (!wearableWifiConfigured()) return false;
  if (WiFi.status() == WL_CONNECTED) {
    g_homeChannel = static_cast<uint8_t>(WiFi.channel());
    return true;
  }
  WiFi.begin(wearableWifiSsid(), wearableWifiPassword());
  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT_MS) {
    delay(100);
  }
  if (WiFi.status() != WL_CONNECTED) return false;
  g_homeChannel = static_cast<uint8_t>(WiFi.channel());
  Serial.printf("[node-a] channel lock via Wi-Fi  IP=%s  channel=%u\n", WiFi.localIP().toString().c_str(),
                g_homeChannel);
  return true;
}

static bool initEspNow() {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  setMaxRadioPower();

  if (ensureWifiChannelBlockingBoot()) {
    // Stay associated so ESP-NOW tracks the AP channel the gateway uses.
  } else if (wearableWifiConfigured()) {
    Serial.println("[node-a] Wi-Fi join failed; locking ESP-NOW channel manually");
    lockEspNowChannel(WIFI_CHANNEL);
  } else {
    Serial.printf("[node-a] no Wi-Fi configured; locking ESP-NOW channel %u\n", WIFI_CHANNEL);
    lockEspNowChannel(WIFI_CHANNEL);
  }

  Serial.print("[node-a] STA MAC=");
  Serial.println(WiFi.macAddress());
  Serial.printf("[node-a] ESP-NOW channel %u  packet %u bytes\n", g_homeChannel,
                static_cast<unsigned>(sizeof(TelemetryPacket)));

  if (esp_now_init() != ESP_OK) {
    Serial.println("[node-a] esp_now_init failed");
    return false;
  }
  esp_now_register_send_cb(onEspNowSent);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, NODE_B_MAC, 6);
  peer.channel = 0;  // follow current STA channel
  peer.encrypt = false;
  peer.ifidx = WIFI_IF_STA;
  if (!esp_now_is_peer_exist(NODE_B_MAC) && esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("[node-a] esp_now_add_peer failed");
    return false;
  }
  return true;
}

static bool isBroadcastPeer() {
  for (uint8_t i = 0; i < 6; i++) {
    if (NODE_B_MAC[i] != 0xFF) return false;
  }
  return true;
}

static void sendPacket(const TelemetryPacket &packet) {
  // Broadcast ESP-NOW has no ACK, so the send callback often reports FAIL even
  // when the gateway received the packet. Do not thrash Wi-Fi on that.
  const bool broadcast = isBroadcastPeer();
  for (uint8_t attempt = 1; attempt <= ESPNOW_SEND_RETRIES; attempt++) {
    g_lastSendOk = false;
    const esp_err_t sendResult =
        esp_now_send(NODE_B_MAC, reinterpret_cast<const uint8_t *>(&packet), sizeof(packet));
    if (sendResult != ESP_OK) {
      Serial.printf("[node-a] esp_now_send err %d (try %u)\n", static_cast<int>(sendResult), attempt);
      delay(15);
      continue;
    }
    if (broadcast) {
      // Fire-and-forget; a second short burst helps under interference.
      delay(8);
      if (attempt + 1 <= ESPNOW_SEND_RETRIES) {
        esp_now_send(NODE_B_MAC, reinterpret_cast<const uint8_t *>(&packet), sizeof(packet));
      }
      return;
    }
    const uint32_t start = millis();
    while (!g_lastSendOk && (millis() - start) < 80) {
      delay(5);
    }
    if (g_lastSendOk) return;
    if (!ensureWifiChannel()) {
      lockEspNowChannel(g_homeChannel ? g_homeChannel : WIFI_CHANNEL);
    }
    delay(20);
  }
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
  strncpy(packet.activity_label, eiActivityLabel(), sizeof(packet.activity_label) - 1);
  float score = eiActivityScore();
  if (score < 0.0f) score = 0.0f;
  if (score > 1.0f) score = 1.0f;
  packet.activity_score = static_cast<uint8_t>(score * 100.0f + 0.5f);

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
  featuresRefreshEnvironment();
  if (!initEspNow()) {
    Serial.println("[node-a] ESP-NOW init failed — halt");
    while (true) {
      delay(1000);
    }
  }
}

void loop() {
  static uint32_t lastEnvMs = 0;
  static uint32_t lastWifiTryMs = 0;
  static uint32_t lastLogMs = 0;
  const uint32_t now = millis();

  // Motion first — never sit behind SCD/BME.
  WearableReadings readings = {};
  featuresRead(readings);

  TelemetryPacket packet = {};
  fillPacket(packet, readings);
  if (featuresSign(packet)) {
    packet.flags |= FLAG_SIGNED;
  }
  sendPacket(packet);

  if (now - lastLogMs >= 1000) {
    lastLogMs = now;
    if (readings.mpu6050) {
      Serial.printf("[node-a] MPU-6050 g=%.2f %.2f %.2f dps=%.1f %.1f %.1f fall=%u act=%s(%.2f)\n",
                    readings.accel_x, readings.accel_y, readings.accel_z, readings.gyro_x, readings.gyro_y,
                    readings.gyro_z, readings.fall_state, eiActivityLabel(), eiActivityScore());
    } else {
      Serial.println("[node-a] MPU-6050 no reading");
    }
  }

  // Slow sensors only after the packet is out; blanks (NaN) until a quick cache hit.
  if (lastEnvMs == 0 || now - lastEnvMs >= ENVIRONMENT_INTERVAL_MS) {
    featuresRefreshEnvironment();
    lastEnvMs = millis();
  }

  if (wearableWifiConfigured() && WiFi.status() != WL_CONNECTED &&
      (lastWifiTryMs == 0 || now - lastWifiTryMs >= 15000)) {
    lastWifiTryMs = now;
    ensureWifiChannel();
  }

  delay(MOTION_INTERVAL_MS);
}
