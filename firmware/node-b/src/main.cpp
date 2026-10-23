#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_now.h>
#include <ArduinoJson.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "config.h"
#include "telemetry.h"
#include "wifi_store.h"

static WifiCreds g_wifi = {};

static constexpr size_t QUEUE_DEPTH = 8;
static constexpr size_t PACKET_MAX = 250;

struct QueuedPacket {
  uint8_t data[PACKET_MAX];
  uint8_t len;
  uint8_t srcMac[6];
  int8_t rssi;
};

static QueuedPacket g_queue[QUEUE_DEPTH];
static volatile uint8_t g_qHead = 0;
static volatile uint8_t g_qTail = 0;
static portMUX_TYPE g_queueMux = portMUX_INITIALIZER_UNLOCKED;

static bool queueIsEmpty() { return g_qHead == g_qTail; }

static bool queuePush(const QueuedPacket &item) {
  portENTER_CRITICAL(&g_queueMux);
  const uint8_t next = static_cast<uint8_t>((g_qHead + 1) % QUEUE_DEPTH);
  if (next == g_qTail) {
    portEXIT_CRITICAL(&g_queueMux);
    return false;
  }
  g_queue[g_qHead] = item;
  g_qHead = next;
  portEXIT_CRITICAL(&g_queueMux);
  return true;
}

static bool queuePop(QueuedPacket &out) {
  portENTER_CRITICAL(&g_queueMux);
  if (queueIsEmpty()) {
    portEXIT_CRITICAL(&g_queueMux);
    return false;
  }
  out = g_queue[g_qTail];
  g_qTail = static_cast<uint8_t>((g_qTail + 1) % QUEUE_DEPTH);
  portEXIT_CRITICAL(&g_queueMux);
  return true;
}

static void enqueue(const uint8_t *mac, const uint8_t *data, int len, int8_t rssi) {
  if (mac == nullptr || data == nullptr || len <= 0 || len > static_cast<int>(PACKET_MAX)) {
    return;
  }
  QueuedPacket item = {};
  memcpy(item.data, data, static_cast<size_t>(len));
  item.len = static_cast<uint8_t>(len);
  memcpy(item.srcMac, mac, 6);
  item.rssi = rssi;
  queuePush(item);
}

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (info == nullptr) {
    return;
  }
  const int8_t rssi = info->rx_ctrl != nullptr ? info->rx_ctrl->rssi : 0;
  enqueue(info->src_addr, data, len, rssi);
}
#else
static void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  enqueue(mac, data, len, 0);
}
#endif

static void formatMac(const uint8_t *mac, char *out, size_t outLen) {
  snprintf(out, outLen, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4],
           mac[5]);
}

static bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }
  if (g_wifi.ssid[0] == '\0') {
    Serial.println("[node-b] no router saved");
    return false;
  }
  Serial.printf("[node-b] Connecting to Wi-Fi SSID '%s'\n", g_wifi.ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(g_wifi.ssid, g_wifi.password);

  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[node-b] Wi-Fi connect failed");
    return false;
  }
  Serial.print("[node-b] Wi-Fi OK  IP=");
  Serial.print(WiFi.localIP());
  Serial.print("  channel=");
  Serial.print(WiFi.channel());
  Serial.print("  STA MAC=");
  Serial.println(WiFi.macAddress());
  Serial.println("[node-b] Set Node A WIFI_CHANNEL to this channel and NODE_B_MAC to this STA MAC.");
  return true;
}

static bool initEspNow() {
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("[node-b] esp_now_init failed");
    return false;
  }
  esp_now_register_recv_cb(onEspNowRecv);
  Serial.println("[node-b] ESP-NOW listening");
  return true;
}

static void appendNullableFloat(JsonObject obj, const char *key, float value) {
  if (isnan(value) || isinf(value)) {
    obj[key] = nullptr;
  } else {
    obj[key] = value;
  }
}

static const char *fallName(uint8_t state) {
  switch (state) {
    case FALL_POSSIBLE:
      return "possible";
    case FALL_GRACE:
      return "grace";
    case FALL_DISTRESS:
      return "distress";
    case FALL_CANCELLED:
      return "cancelled";
    default:
      return "idle";
  }
}

static const char *localOutput(bool requested, bool installed) {
  if (installed) {
    return requested ? "active" : "installed";
  }
  return requested ? "requested_not_installed" : "not_installed";
}

static void appendHex(JsonObject obj, const char *key, const uint8_t *data, size_t len) {
  if (data == nullptr || len == 0) {
    obj[key] = nullptr;
    return;
  }
  String hex;
  hex.reserve(len * 2);
  for (size_t i = 0; i < len; i++) {
    char byteText[3];
    snprintf(byteText, sizeof(byteText), "%02x", data[i]);
    hex += byteText;
  }
  obj[key] = hex;
}

static void addUplink(JsonDocument &doc, uint32_t flags) {
  JsonObject uplink = doc["uplink"].to<JsonObject>();
  const bool cellular = CELLULAR_MODEM_INSTALLED && (flags & FLAG_UPLINK_CELLULAR) != 0;
  uplink["active"] = cellular ? "cellular" : "wifi";
  uplink["planned"] = "cellular";
  uplink["cellular_ready"] = CELLULAR_MODEM_INSTALLED;
}

static void addEmptySensors(JsonDocument &doc) {
  JsonObject max30102 = doc["max30102"].to<JsonObject>();
  max30102["ok"] = false;
  max30102["i2c_addr"] = "0x57";
  max30102["heart_rate_bpm"] = nullptr;
  max30102["spo2_percent"] = nullptr;

  JsonObject mpu = doc["mpu6050"].to<JsonObject>();
  mpu["ok"] = false;
  mpu["i2c_addr"] = "0x68";
  mpu["accel_g"] = nullptr;
  mpu["gyro_dps"] = nullptr;

  JsonObject gps = doc["gps"].to<JsonObject>();
  gps["ok"] = false;
  gps["fix"] = "none";
  gps["latitude"] = nullptr;
  gps["longitude"] = nullptr;
  gps["altitude_m"] = nullptr;
  gps["satellites"] = nullptr;

  JsonObject battery = doc["battery"].to<JsonObject>();
  battery["ok"] = false;
  battery["percent"] = nullptr;
  battery["voltage_v"] = nullptr;

  JsonObject fall = doc["fall"].to<JsonObject>();
  fall["state"] = "idle";
  fall["model"] = FALL_MODEL_ID;
  fall["grace_remaining_ms"] = 0;

  JsonObject ui = doc["local_ui"].to<JsonObject>();
  ui["touchscreen"] = "not_installed";
  ui["buzzer"] = "not_installed";

  JsonObject signature = doc["signature"].to<JsonObject>();
  signature["alg"] = "ECDSA-P256-SHA256";
  signature["prefix_hex"] = nullptr;
  signature["hex"] = nullptr;
}

static String networkConfigUrl() {
  String url = TELEMETRY_URL;
  const int scheme = url.indexOf("://");
  const int slash = url.indexOf('/', scheme < 0 ? 0 : scheme + 3);
  if (slash < 0) return url + "/api/network";
  return url.substring(0, slash) + "/api/network";
}

static void applyRouter(const char *ssid, const char *password) {
  strncpy(g_wifi.ssid, ssid, sizeof(g_wifi.ssid) - 1);
  g_wifi.ssid[sizeof(g_wifi.ssid) - 1] = '\0';
  strncpy(g_wifi.password, password, sizeof(g_wifi.password) - 1);
  g_wifi.password[sizeof(g_wifi.password) - 1] = '\0';
  g_wifi.fromNvs = true;
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.begin(g_wifi.ssid, g_wifi.password);
  Serial.printf("[node-b] joining router %s\n", g_wifi.ssid);
}

static void loadRouter() {
  if (loadWifiCreds(g_wifi)) {
    Serial.printf("[node-b] router from device memory: %s\n", g_wifi.ssid);
    return;
  }
  if (WIFI_SSID[0] != '\0' && strcmp(WIFI_SSID, "YOUR_WIFI_SSID") != 0) {
    strncpy(g_wifi.ssid, WIFI_SSID, sizeof(g_wifi.ssid) - 1);
    strncpy(g_wifi.password, WIFI_PASSWORD, sizeof(g_wifi.password) - 1);
    g_wifi.ssid[sizeof(g_wifi.ssid) - 1] = '\0';
    g_wifi.password[sizeof(g_wifi.password) - 1] = '\0';
    Serial.printf("[node-b] router from config.h fallback: %s\n", g_wifi.ssid);
    return;
  }
  Serial.println("[node-b] no router yet — enter it on the dashboard");
}

static void readRouterFromSerial() {
  static char line[128];
  static size_t used = 0;
  while (takeSerialLine(line, sizeof(line), used)) {
    char ssid[33];
    char password[64];
    if (!parseWifiLine(line, ssid, sizeof(ssid), password, sizeof(password))) continue;
    if (!saveWifiCreds(ssid, password)) continue;
    applyRouter(ssid, password);
    Serial.println("[node-b] router saved from USB");
  }
}

static void pollDashboardRouter() {
  if (WiFi.status() != WL_CONNECTED) return;
  static uint32_t lastMs = 0;
  const uint32_t now = millis();
  if (lastMs != 0 && now - lastMs < 20000) return;
  lastMs = now;

  HTTPClient http;
  http.setTimeout(4000);
  const String url = networkConfigUrl();
  if (!http.begin(url)) return;
  const int status = http.GET();
  if (status != 200) {
    http.end();
    return;
  }
  const String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) return;
  const char *ssid = doc["ssid"] | "";
  const char *password = doc["password"] | "";
  if (ssid[0] == '\0') return;
  if (strcmp(ssid, g_wifi.ssid) == 0 && strcmp(password, g_wifi.password) == 0) return;
  if (!saveWifiCreds(ssid, password)) return;
  Serial.printf("[node-b] router updated from dashboard: %s\n", ssid);
  applyRouter(ssid, password);
}

static bool postDocument(JsonDocument &doc) {
  doc["router_ssid"] = g_wifi.ssid[0] ? g_wifi.ssid : nullptr;
  if (!ensureWifi() && !CELLULAR_MODEM_INSTALLED) {
    return false;
  }

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(TELEMETRY_URL)) {
    Serial.println("[node-b] HTTP begin failed");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Firealert-Gateway", GATEWAY_ID);
  const int status = http.POST(body);
  Serial.printf("[node-b] POST %s -> HTTP %d\n", TELEMETRY_URL, status);
  Serial.println(body);
  http.end();
  return status >= 200 && status < 300;
}

static bool postV1(const QueuedPacket &item) {
  if (item.len != sizeof(TelemetryPacketV1)) {
    return false;
  }
  TelemetryPacketV1 packet = {};
  memcpy(&packet, item.data, sizeof(packet));

  JsonDocument doc;
  char srcMac[18];
  formatMac(item.srcMac, srcMac, sizeof(srcMac));
  doc["protocol_version"] = packet.version;
  doc["source"] = "node-a";
  doc["wearer_id"] = "unassigned";
  doc["gateway"] = GATEWAY_ID;
  doc["source_mac"] = srcMac;
  doc["rssi_dbm"] = item.rssi;
  doc["sequence"] = packet.sequence;
  doc["timestamp_ms"] = packet.timestamp_ms;
  addUplink(doc, 0);

  JsonObject scd40 = doc["scd40"].to<JsonObject>();
  scd40["ok"] = (packet.flags & FLAG_SCD40_OK) != 0;
  scd40["i2c_addr"] = "0x62";
  appendNullableFloat(scd40, "co2_ppm", packet.co2_ppm);
  appendNullableFloat(scd40, "temperature_c", packet.temperature_c);
  appendNullableFloat(scd40, "humidity_rh", packet.humidity_rh);

  JsonObject bme = doc["bme688"].to<JsonObject>();
  bme["ok"] = (packet.flags & FLAG_BME688_OK) != 0;
  bme["i2c_addr"] = "0x77";
  bme["temperature_c"] = nullptr;
  bme["humidity_rh"] = nullptr;
  bme["pressure_hpa"] = nullptr;
  appendNullableFloat(bme, "gas_resistance_ohm", packet.gas_resistance_ohm);
  addEmptySensors(doc);
  return postDocument(doc);
}

static bool postV2(const QueuedPacket &item) {
  if (item.len != sizeof(TelemetryPacket)) {
    Serial.printf("[node-b] v2 length %u, expected %u\n", item.len,
                  static_cast<unsigned>(sizeof(TelemetryPacket)));
    return false;
  }
  TelemetryPacket packet = {};
  memcpy(&packet, item.data, sizeof(packet));

  char wearer[sizeof(packet.wearer_id) + 1] = {};
  memcpy(wearer, packet.wearer_id, sizeof(packet.wearer_id));

  JsonDocument doc;
  char srcMac[18];
  formatMac(item.srcMac, srcMac, sizeof(srcMac));
  doc["protocol_version"] = packet.version;
  doc["source"] = "node-a";
  doc["wearer_id"] = wearer[0] ? wearer : "unassigned";
  doc["gateway"] = GATEWAY_ID;
  doc["source_mac"] = srcMac;
  doc["rssi_dbm"] = item.rssi;
  doc["sequence"] = packet.sequence;
  doc["timestamp_ms"] = packet.timestamp_ms;
  addUplink(doc, packet.flags);

  JsonObject scd40 = doc["scd40"].to<JsonObject>();
  const bool scdOk = (packet.flags & FLAG_SCD40_OK) != 0;
  scd40["ok"] = scdOk;
  scd40["i2c_addr"] = "0x62";
  appendNullableFloat(scd40, "co2_ppm", packet.co2_ppm);
  appendNullableFloat(scd40, "temperature_c", packet.scd40_temperature_c);
  appendNullableFloat(scd40, "humidity_rh", packet.scd40_humidity_rh);

  JsonObject bme = doc["bme688"].to<JsonObject>();
  bme["ok"] = (packet.flags & FLAG_BME688_OK) != 0;
  bme["i2c_addr"] = "0x77";
  appendNullableFloat(bme, "temperature_c", packet.bme_temperature_c);
  appendNullableFloat(bme, "humidity_rh", packet.bme_humidity_rh);
  appendNullableFloat(bme, "pressure_hpa", packet.pressure_hpa);
  appendNullableFloat(bme, "gas_resistance_ohm", packet.gas_resistance_ohm);

  JsonObject max30102 = doc["max30102"].to<JsonObject>();
  max30102["ok"] = (packet.flags & FLAG_MAX30102_OK) != 0;
  max30102["i2c_addr"] = "0x57";
  appendNullableFloat(max30102, "heart_rate_bpm", packet.heart_rate_bpm);
  appendNullableFloat(max30102, "spo2_percent", packet.spo2_percent);

  JsonObject mpu = doc["mpu6050"].to<JsonObject>();
  const bool mpuOk = (packet.flags & FLAG_MPU6050_OK) != 0;
  mpu["ok"] = mpuOk;
  mpu["i2c_addr"] = "0x68";
  if (!mpuOk) {
    mpu["accel_g"] = nullptr;
    mpu["gyro_dps"] = nullptr;
  } else {
    JsonObject accel = mpu["accel_g"].to<JsonObject>();
    appendNullableFloat(accel, "x", packet.accel_x);
    appendNullableFloat(accel, "y", packet.accel_y);
    appendNullableFloat(accel, "z", packet.accel_z);
    JsonObject gyro = mpu["gyro_dps"].to<JsonObject>();
    appendNullableFloat(gyro, "x", packet.gyro_x);
    appendNullableFloat(gyro, "y", packet.gyro_y);
    appendNullableFloat(gyro, "z", packet.gyro_z);
  }

  JsonObject gps = doc["gps"].to<JsonObject>();
  const bool fix = (packet.flags & FLAG_GPS_FIX) != 0;
  const bool lastKnown = !fix && (packet.flags & FLAG_GPS_LAST_KNOWN) != 0;
  gps["ok"] = fix;
  gps["fix"] = fix ? "fix" : (lastKnown ? "last_known" : "none");
  if ((fix || lastKnown) && packet.latitude_e7 != GPS_COORD_ABSENT &&
      packet.longitude_e7 != GPS_COORD_ABSENT) {
    gps["latitude"] = static_cast<double>(packet.latitude_e7) / 1e7;
    gps["longitude"] = static_cast<double>(packet.longitude_e7) / 1e7;
  } else {
    gps["latitude"] = nullptr;
    gps["longitude"] = nullptr;
  }
  if ((fix || lastKnown) && packet.altitude_dm != GPS_ALT_ABSENT) {
    gps["altitude_m"] = static_cast<float>(packet.altitude_dm) / 10.0f;
  } else {
    gps["altitude_m"] = nullptr;
  }
  if (packet.gps_satellites == GPS_SATELLITES_ABSENT) {
    gps["satellites"] = nullptr;
  } else {
    gps["satellites"] = static_cast<int>(packet.gps_satellites);
  }

  JsonObject battery = doc["battery"].to<JsonObject>();
  const bool batteryOk = (packet.flags & FLAG_BATTERY_OK) != 0;
  battery["ok"] = batteryOk;
  battery["voltage_v"] = nullptr;
  if (batteryOk && packet.battery_percent != BATTERY_PERCENT_ABSENT) {
    battery["percent"] = packet.battery_percent;
  } else {
    battery["percent"] = nullptr;
  }

  JsonObject fall = doc["fall"].to<JsonObject>();
  fall["state"] = fallName(packet.fall_state);
  fall["model"] = FALL_MODEL_ID;
  fall["grace_remaining_ms"] = packet.grace_remaining_ms;

  const bool wantBuzzer = (packet.alert_outputs & ALERT_BUZZER) != 0;
  const bool wantScreen = (packet.alert_outputs & ALERT_SCREEN) != 0;
  JsonObject ui = doc["local_ui"].to<JsonObject>();
  ui["touchscreen"] = localOutput(wantScreen, TOUCHSCREEN_INSTALLED);
  ui["buzzer"] = localOutput(wantBuzzer, BUZZER_INSTALLED);

  JsonObject signature = doc["signature"].to<JsonObject>();
  signature["alg"] = "ECDSA-P256-SHA256";
  appendHex(signature, "prefix_hex", packet.signature_len > 0 ? item.data : nullptr,
            packet.signature_len > 0 ? offsetof(TelemetryPacket, signature_len) : 0);
  appendHex(signature, "hex", packet.signature_len > 0 ? packet.signature : nullptr, packet.signature_len);

  return postDocument(doc);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("[node-b] FIREALERT field gateway boot");
  loadRouter();
  Serial.printf("[node-b] v2 packet %u bytes; uplink %s\n", static_cast<unsigned>(sizeof(TelemetryPacket)),
                CELLULAR_MODEM_INSTALLED ? "cellular" : "wifi stand-in");
  if (!ensureWifi()) {
    Serial.println("[node-b] continuing; will retry the uplink before each POST");
  }
  if (!initEspNow()) {
    Serial.println("[node-b] ESP-NOW init failed — halt");
    while (true) {
      delay(1000);
    }
  }
}

void loop() {
  readRouterFromSerial();
  pollDashboardRouter();

  static uint32_t lastBeatMs = 0;
  if (millis() - lastBeatMs >= 2000) {
    lastBeatMs = millis();
    Serial.printf("[node-b] heartbeat wifi=%s ip=%s ch=%u mac=%s cellular=%s\n",
                  WiFi.status() == WL_CONNECTED ? "up" : "down", WiFi.localIP().toString().c_str(),
                  WiFi.channel(), WiFi.macAddress().c_str(),
                  CELLULAR_MODEM_INSTALLED ? "ready" : "not-installed");
  }

  QueuedPacket item;
  if (!queuePop(item)) {
    delay(10);
    return;
  }

  const uint8_t version = item.data[0];
  bool posted = false;
  if (version == TELEMETRY_VERSION) {
    posted = postV2(item);
  } else if (version == TELEMETRY_VERSION_V1) {
    posted = postV1(item);
  } else {
    Serial.printf("[node-b] drop packet version %u\n", version);
    return;
  }
  if (!posted) {
    Serial.println("[node-b] forward failed; packet dropped");
  }
}
