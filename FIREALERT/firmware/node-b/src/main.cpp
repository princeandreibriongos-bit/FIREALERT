#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_now.h>
#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

#include "config.h"
#include "telemetry.h"

static constexpr size_t QUEUE_DEPTH = 8;

struct QueuedPacket {
  TelemetryPacket packet;
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

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (info == nullptr || data == nullptr || len != static_cast<int>(sizeof(TelemetryPacket))) {
    return;
  }
  QueuedPacket item = {};
  memcpy(&item.packet, data, sizeof(TelemetryPacket));
  memcpy(item.srcMac, info->src_addr, 6);
  item.rssi = info->rx_ctrl != nullptr ? info->rx_ctrl->rssi : 0;
  queuePush(item);
}
#else
static void onEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
  if (mac == nullptr || data == nullptr || len != static_cast<int>(sizeof(TelemetryPacket))) {
    return;
  }
  QueuedPacket item = {};
  memcpy(&item.packet, data, sizeof(TelemetryPacket));
  memcpy(item.srcMac, mac, 6);
  item.rssi = 0;
  queuePush(item);
}
#endif

static void formatMac(const uint8_t *mac, char *out, size_t outLen) {
  snprintf(out, outLen, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3],
           mac[4], mac[5]);
}

static bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.printf("[node-b] Connecting to Wi-Fi SSID '%s'\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

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

static bool postTelemetry(const QueuedPacket &item) {
  if (!ensureWifi()) {
    return false;
  }

  JsonDocument doc;
  const TelemetryPacket &p = item.packet;

  char srcMac[18];
  formatMac(item.srcMac, srcMac, sizeof(srcMac));

  doc["protocol_version"] = p.version;
  doc["source"] = "node-a";
  doc["gateway"] = GATEWAY_ID;
  doc["source_mac"] = srcMac;
  doc["rssi_dbm"] = item.rssi;
  doc["sequence"] = p.sequence;
  doc["timestamp_ms"] = p.timestamp_ms;

  JsonObject scd40 = doc["scd40"].to<JsonObject>();
  scd40["ok"] = (p.flags & FLAG_SCD40_OK) != 0;
  scd40["i2c_addr"] = "0x62";
  appendNullableFloat(scd40, "co2_ppm", p.co2_ppm);
  appendNullableFloat(scd40, "temperature_c", p.temperature_c);
  appendNullableFloat(scd40, "humidity_rh", p.humidity_rh);

  JsonObject bme688 = doc["bme688"].to<JsonObject>();
  bme688["ok"] = (p.flags & FLAG_BME688_OK) != 0;
  bme688["i2c_addr"] = "0x77";
  appendNullableFloat(bme688, "gas_resistance_ohm", p.gas_resistance_ohm);

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

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("[node-b] FIREALERT field gateway boot");

  if (!ensureWifi()) {
    Serial.println("[node-b] continuing; will retry Wi-Fi before each POST");
  }

  if (!initEspNow()) {
    Serial.println("[node-b] ESP-NOW init failed — halt");
    while (true) {
      delay(1000);
    }
  }
}

void loop() {
  static uint32_t lastBeatMs = 0;
  if (millis() - lastBeatMs >= 2000) {
    lastBeatMs = millis();
    Serial.printf("[node-b] heartbeat wifi=%s ip=%s ch=%u mac=%s\n",
                  WiFi.status() == WL_CONNECTED ? "up" : "down",
                  WiFi.localIP().toString().c_str(), WiFi.channel(),
                  WiFi.macAddress().c_str());
  }

  QueuedPacket item;
  if (queuePop(item)) {
    if (item.packet.version != TELEMETRY_VERSION) {
      Serial.printf("[node-b] drop packet version %u\n", item.packet.version);
    } else if (!postTelemetry(item)) {
      Serial.println("[node-b] forward failed; packet dropped");
    }
  }

  delay(10);
}
