#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Wire.h>
#include <SensirionI2cScd4x.h>
#include <math.h>

#include "config.h"
#include "telemetry.h"

SensirionI2cScd4x scd4x;

static uint16_t g_sequence = 0;
static bool g_scd40Ready = false;

static void onEspNowSent(const uint8_t *mac, esp_now_send_status_t status) {
  Serial.print("[node-a] ESP-NOW send ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
  (void)mac;
}

static bool initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
  }

  uint8_t homeChannel = WIFI_CHANNEL;
  if (WiFi.status() == WL_CONNECTED) {
    homeChannel = static_cast<uint8_t>(WiFi.channel());
    Serial.printf("[node-a] Wi-Fi OK  IP=%s  channel=%u\n", WiFi.localIP().toString().c_str(),
                  homeChannel);
  } else {
    Serial.println("[node-a] Wi-Fi join failed; locking ESP-NOW channel manually");
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);
  }

  Serial.print("[node-a] STA MAC=");
  Serial.println(WiFi.macAddress());
  Serial.printf("[node-a] ESP-NOW channel %u\n", homeChannel);

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

  if (esp_now_is_peer_exist(NODE_B_MAC)) {
    return true;
  }

  if (esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("[node-a] esp_now_add_peer failed");
    return false;
  }

  return true;
}

static bool initScd40() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, I2C_FREQUENCY_HZ);
  scd4x.begin(Wire, SCD40_I2C_ADDR);

  // wakeUp() can return a non-zero status if the sensor is already awake.
  scd4x.wakeUp();
  scd4x.stopPeriodicMeasurement();
  scd4x.reinit();

  uint64_t serialNumber = 0;
  const int16_t identityError = scd4x.getSerialNumber(serialNumber);
  if (identityError) {
    Serial.printf("[node-a] SCD40 not found at 0x%02X (err %d)\n", SCD40_I2C_ADDR,
                  identityError);
    return false;
  }

  Serial.printf("[node-a] SCD40 serial %012llX\n", static_cast<unsigned long long>(serialNumber));

  const int16_t startError = scd4x.startPeriodicMeasurement();
  if (startError) {
    Serial.printf("[node-a] SCD40 startPeriodicMeasurement failed (%d)\n", startError);
    return false;
  }

  Serial.println("[node-a] SCD40 periodic measurement started");
  return true;
}

// Future Bosch BME688 (I2C 0x77) — keep this as a no-op until the sensor exists.
// Do not scan or begin() that address: a missing device would stall or spam errors.
static bool readBme688Placeholder(float &gasResistanceOhm) {
  gasResistanceOhm = NAN;
  return false;

  // --- Enable when the BME688 is installed ---------------------------------
  // #include <bme68x.h>  // or Adafruit_BME680
  // static Adafruit_BME680 bme688;
  // if (!bme688.begin(BME688_I2C_ADDR)) return false;
  // if (!bme688.performReading()) return false;
  // gasResistanceOhm = bme688.gas_resistance;  // ohms
  // return true;
}

static bool readScd40(float &co2Ppm, float &temperatureC, float &humidityRh) {
  bool dataReady = false;
  int16_t error = scd4x.getDataReadyStatus(dataReady);
  if (error || !dataReady) {
    return false;
  }

  uint16_t co2 = 0;
  error = scd4x.readMeasurement(co2, temperatureC, humidityRh);
  if (error || co2 == 0) {
    return false;
  }

  co2Ppm = static_cast<float>(co2);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("[node-a] FIREALERT wearable boot");

  g_scd40Ready = initScd40();
  if (!initEspNow()) {
    Serial.println("[node-a] ESP-NOW init failed — halt");
    while (true) {
      delay(1000);
    }
  }
}

void loop() {
  TelemetryPacket packet = {};
  packet.version = TELEMETRY_VERSION;
  packet.sequence = ++g_sequence;
  packet.timestamp_ms = millis();
  packet.co2_ppm = NAN;
  packet.temperature_c = NAN;
  packet.humidity_rh = NAN;
  packet.gas_resistance_ohm = NAN;
  packet.flags = 0;

  if (g_scd40Ready) {
    float co2 = NAN;
    float t = NAN;
    float rh = NAN;
    if (readScd40(co2, t, rh)) {
      packet.co2_ppm = co2;
      packet.temperature_c = t;
      packet.humidity_rh = rh;
      packet.flags |= FLAG_SCD40_OK;
      Serial.printf("[node-a] SCD40 CO2=%.0f ppm T=%.2f C RH=%.1f %%\n", co2, t, rh);
    }
  }

  // Commented-out placeholder field usage for the future BME688 gas reading.
  // float bme688GasResistanceOhm = NAN;  // ohms, I2C 0x77
  float bme688GasResistanceOhm = NAN;
  if (readBme688Placeholder(bme688GasResistanceOhm)) {
    packet.gas_resistance_ohm = bme688GasResistanceOhm;
    packet.flags |= FLAG_BME688_OK;
  }

  const esp_err_t sendResult =
      esp_now_send(NODE_B_MAC, reinterpret_cast<const uint8_t *>(&packet), sizeof(packet));
  if (sendResult != ESP_OK) {
    Serial.printf("[node-a] esp_now_send err %d\n", static_cast<int>(sendResult));
  }

  delay(SAMPLE_INTERVAL_MS);
}
