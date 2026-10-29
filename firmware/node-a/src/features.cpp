#include "features.h"

#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <driver/gpio.h>
#include <Adafruit_BME680.h>
#include <SensirionI2cScd4x.h>
#include <math.h>
#include <string.h>

#include "config.h"
#include "wifi_store.h"

static SensirionI2cScd4x g_scd4x;
static TwoWire g_bme688Wire = TwoWire(1);
static Adafruit_BME680 g_bme688(&g_bme688Wire);
static WifiCreds g_wifi = {};
static bool g_scd40Ready = false;
static bool g_bme688Ready = false;
static bool g_mpu6050Ready = false;
static uint8_t g_mpuAddr = MPU6050_I2C_ADDR;
static int g_mpuSda = 40;
static int g_mpuScl = 41;
static bool g_mpuHw = false;
static uint32_t g_scdArmedMs = 0;
static uint32_t g_scdLogMs = 0;
static bool g_haveScd = false;
static float g_lastCo2 = NAN;
static float g_lastScdT = NAN;
static float g_lastScdRh = NAN;
static uint8_t g_scdErrors = 0;
static bool g_haveMpu = false;
static float g_lastAx = NAN, g_lastAy = NAN, g_lastAz = NAN;
static float g_lastGx = NAN, g_lastGy = NAN, g_lastGz = NAN;
static uint32_t g_mpuMs = 0;
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
bool wearableWifiConfigured() {
  return g_wifi.ssid[0] != '\0' && strcmp(g_wifi.ssid, "YOUR_WIFI_SSID") != 0;
}

const char *wearableWifiSsid() { return g_wifi.ssid; }
const char *wearableWifiPassword() { return g_wifi.password; }

static void rememberWifi(const char *ssid, const char *password) {
  strncpy(g_wifi.ssid, ssid, sizeof(g_wifi.ssid) - 1);
  g_wifi.ssid[sizeof(g_wifi.ssid) - 1] = '\0';
  strncpy(g_wifi.password, password, sizeof(g_wifi.password) - 1);
  g_wifi.password[sizeof(g_wifi.password) - 1] = '\0';
}

static void scanI2C(TwoWire &bus, int sda, int scl, const char *label);
static void runSensorScan();
static void restoreBmeBus();

// A shorted or clock-stretched line makes Wire.endTransmission() wait forever
// on this core. Clock the bus, then refuse to start I2C if a line is still low.
static bool i2cLinesIdle(int sda, int scl, const char *label) {
  pinMode(sda, INPUT_PULLUP);
  pinMode(scl, OUTPUT_OPEN_DRAIN);
  digitalWrite(scl, HIGH);
  delay(1);
  for (int pulse = 0; pulse < 9; ++pulse) {
    if (digitalRead(sda) == HIGH) break;
    digitalWrite(scl, LOW);
    delayMicroseconds(8);
    digitalWrite(scl, HIGH);
    delayMicroseconds(8);
  }
  pinMode(scl, INPUT_PULLUP);
  delay(2);
  const int sdaLevel = digitalRead(sda);
  const int sclLevel = digitalRead(scl);
  if (sdaLevel == HIGH && sclLevel == HIGH) return true;
  Serial.printf("[node-a] %s bus held down SDA=%d SCL=%d — check the jumpers\n", label, sdaLevel, sclLevel);
  return false;
}

static bool pollFallCommand() {
  static char line[128];
  static size_t used = 0;
  bool fired = false;
  while (takeSerialLine(line, sizeof(line), used)) {
    if (strcasecmp(line, "fall") == 0) fired = true;
    if (strcasecmp(line, "scan") == 0) runSensorScan();
    char ssid[33];
    char password[64];
    if (parseWifiLine(line, ssid, sizeof(ssid), password, sizeof(password)) && saveWifiCreds(ssid, password)) {
      const bool same = strcmp(g_wifi.ssid, ssid) == 0 && strcmp(g_wifi.password, password) == 0;
      rememberWifi(ssid, password);
      g_wifi.fromNvs = true;
      Serial.printf("[node-a] router saved: %s\n", g_wifi.ssid);
      if (!(same && WiFi.status() == WL_CONNECTED)) {
        WiFi.persistent(false);
        WiFi.setSleep(false);
        WiFi.mode(WIFI_STA);
        WiFi.disconnect(false, false);
        WiFi.begin(g_wifi.ssid, g_wifi.password);
      }
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

  // The gyro no longer shares this bus, so nothing else starts Wire.
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, SHARED_I2C_HZ);
  Wire.setClock(SHARED_I2C_HZ);
  Wire.setTimeOut(200);
  g_scd4x.begin(Wire, SCD40_I2C_ADDR);
  g_scd4x.wakeUp();
  delay(20);
  g_scd4x.stopPeriodicMeasurement();
  g_scd4x.reinit();
  delay(20);

  uint64_t serialNumber = 0;
  const int16_t identityError = g_scd4x.getSerialNumber(serialNumber);
  if (identityError) {
    Serial.printf("[node-a] SCD40 not found at 0x%02X (err %d)\n", SCD40_I2C_ADDR, identityError);
    return false;
  }

  Serial.printf("[node-a] SCD40 serial %012llX\n", static_cast<unsigned long long>(serialNumber));
  // A second stop-then-start is what actually makes this chip begin measuring.
  g_scd4x.stopPeriodicMeasurement();
  const int16_t startError = g_scd4x.startPeriodicMeasurement();
  if (startError) {
    Serial.printf("[node-a] SCD40 startPeriodicMeasurement failed (%d)\n", startError);
    return false;
  }
  Serial.println("[node-a] SCD40 periodic measurement started");
  g_scdArmedMs = millis();
  return true;
}

static void publishLastScd(WearableReadings &out) {
  if (!g_haveScd) return;
  out.scd40 = true;
  out.co2_ppm = g_lastCo2;
  out.scd40_temperature_c = g_lastScdT;
  out.scd40_humidity_rh = g_lastScdRh;
}

static void readScd40(WearableReadings &out) {
  if (!g_scd40Ready) return;
  // SCD40 stretches the clock while it answers. A short timeout looks like a missing sensor.
  Wire.setTimeOut(200);
  const uint32_t now = millis();
  if (g_scdArmedMs != 0 && now - g_scdArmedMs < 5000) {
    publishLastScd(out);
    return;
  }
  uint16_t co2 = 0;
  float temperature = NAN;
  float humidity = NAN;
  const int16_t error = g_scd4x.readMeasurement(co2, temperature, humidity);
  if (!error && co2 > 0) {
    g_scdErrors = 0;
    g_haveScd = true;
    g_lastCo2 = static_cast<float>(co2);
    g_lastScdT = temperature;
    g_lastScdRh = humidity;
    g_scdArmedMs = now;
    publishLastScd(out);
    return;
  }
  uint16_t rawStatus = 0;
  g_scd4x.getDataReadyStatusRaw(rawStatus);
  if (now - g_scdLogMs > 4000) {
    Serial.printf("[node-a] SCD40 no sample yet (status 0x%04X read %d)\n", rawStatus, error);
    g_scdLogMs = now;
  }
  if (++g_scdErrors >= 4) {
    g_scd4x.stopPeriodicMeasurement();
    const int16_t startError = g_scd4x.startPeriodicMeasurement();
    g_scdErrors = 0;
    g_scdArmedMs = millis();
    Serial.printf("[node-a] SCD40 rearm %d\n", startError);
  }
  publishLastScd(out);
}

static void configureBme688() {
  g_bme688.setTemperatureOversampling(BME680_OS_8X);
  g_bme688.setHumidityOversampling(BME680_OS_2X);
  g_bme688.setPressureOversampling(BME680_OS_4X);
  g_bme688.setIIRFilterSize(BME680_FILTER_SIZE_3);
  g_bme688.setGasHeater(320, 150);
}

static bool beginBme688() {
  if (!BME688_ENABLED) return false;
  if (BME688_SEPARATE_I2C_BUS) {
    // The gyro uses this same controller. begin() will not move the pins
    // unless the controller is stopped first.
    g_bme688Wire.end();
    g_bme688Wire.begin(BME688_I2C_SDA_PIN, BME688_I2C_SCL_PIN, I2C_FREQUENCY_HZ);
    g_bme688Wire.setTimeOut(100);
    Serial.printf("[node-a] BME688 I2C SDA=%d SCL=%d\n", BME688_I2C_SDA_PIN, BME688_I2C_SCL_PIN);
  }
  const uint8_t candidates[] = {BME688_I2C_ADDR, BME688_I2C_ADDR_ALT};
  for (uint8_t addr : candidates) {
    if (g_bme688.begin(addr)) {
      configureBme688();
      Serial.printf("[node-a] BME688 ready at 0x%02X\n", addr);
      return true;
    }
  }
  Serial.printf("[node-a] BME688 not found at 0x%02X or 0x%02X\n", BME688_I2C_ADDR, BME688_I2C_ADDR_ALT);
  return false;
}

static void readBme688(WearableReadings &out) {
  if (!g_bme688Ready) return;
  if (g_mpuHw) restoreBmeBus();
  if (!g_bme688.performReading()) return;
  out.bme688 = true;
  out.bme_temperature_c = g_bme688.temperature;
  out.bme_humidity_rh = g_bme688.humidity;
  out.pressure_hpa = g_bme688.pressure / 100.0f;
  out.gas_resistance_ohm = g_bme688.gas_resistance;
}

static void readMax30102(WearableReadings &) {
  if (MAX30102_ENABLED) {
    Serial.println("[node-a] MAX30102 flag is on but the driver is not linked");
  }
}

static void mpuPinHigh(int pin) { pinMode(pin, INPUT_PULLUP); }

static void mpuPinLow(int pin) {
  digitalWrite(pin, LOW);
  pinMode(pin, OUTPUT);
}

static void mpuDelay() { delayMicroseconds(40); }

static void mpuSclHigh() {
  mpuPinHigh(g_mpuScl);
  const uint32_t start = micros();
  while (digitalRead(g_mpuScl) == LOW && static_cast<uint32_t>(micros() - start) < 1000) {
  }
}

static void mpuStart() {
  mpuPinHigh(g_mpuSda);
  mpuSclHigh();
  mpuDelay();
  mpuPinLow(g_mpuSda);
  mpuDelay();
  mpuPinLow(g_mpuScl);
  mpuDelay();
}

static void mpuStop() {
  mpuPinLow(g_mpuSda);
  mpuDelay();
  mpuSclHigh();
  mpuDelay();
  mpuPinHigh(g_mpuSda);
  mpuDelay();
}

static bool mpuWriteBitByte(uint8_t value) {
  for (int bit = 7; bit >= 0; --bit) {
    if ((value & (1u << bit)) != 0) mpuPinHigh(g_mpuSda);
    else mpuPinLow(g_mpuSda);
    mpuDelay();
    mpuSclHigh();
    mpuDelay();
    mpuPinLow(g_mpuScl);
  }
  mpuPinHigh(g_mpuSda);
  mpuDelay();
  mpuSclHigh();
  mpuDelay();
  const bool ack = digitalRead(g_mpuSda) == LOW;
  mpuPinLow(g_mpuScl);
  return ack;
}

static uint8_t mpuReadBitByte(bool ack) {
  uint8_t value = 0;
  mpuPinHigh(g_mpuSda);
  for (int bit = 7; bit >= 0; --bit) {
    mpuSclHigh();
    mpuDelay();
    if (digitalRead(g_mpuSda) == HIGH) value |= static_cast<uint8_t>(1u << bit);
    mpuPinLow(g_mpuScl);
    mpuDelay();
  }
  if (ack) mpuPinLow(g_mpuSda);
  else mpuPinHigh(g_mpuSda);
  mpuDelay();
  mpuSclHigh();
  mpuDelay();
  mpuPinLow(g_mpuScl);
  mpuPinHigh(g_mpuSda);
  return value;
}

static void mpuBusInit() {
  mpuPinHigh(g_mpuSda);
  mpuPinHigh(g_mpuScl);
  Serial.printf("[node-a] MPU-6050 I2C SDA=%d SCL=%d\n", g_mpuSda, g_mpuScl);
}

static void mpuBusClear() {
  mpuPinHigh(g_mpuSda);
  for (int pulse = 0; pulse < 9; ++pulse) {
    mpuPinLow(g_mpuScl);
    mpuDelay();
    mpuSclHigh();
    mpuDelay();
  }
  mpuStop();
}

static bool mpuSoftWrite(uint8_t addr, uint8_t reg, const uint8_t *data, size_t len) {
  mpuStart();
  if (!mpuWriteBitByte(static_cast<uint8_t>(addr << 1))) {
    mpuStop();
    return false;
  }
  if (!mpuWriteBitByte(reg)) {
    mpuStop();
    return false;
  }
  for (size_t i = 0; i < len; ++i) {
    if (!mpuWriteBitByte(data[i])) {
      mpuStop();
      return false;
    }
  }
  mpuStop();
  return true;
}

static bool mpuSoftRead(uint8_t addr, uint8_t reg, uint8_t *data, size_t len, bool report) {
  mpuStart();
  if (!mpuWriteBitByte(static_cast<uint8_t>(addr << 1))) {
    mpuStop();
    if (report) {
      Serial.printf("[node-a] MPU-6050 0x%02X address nack on SDA=%d SCL=%d\n", addr, g_mpuSda, g_mpuScl);
    }
    return false;
  }
  if (!mpuWriteBitByte(reg)) {
    mpuStop();
    if (report) Serial.printf("[node-a] MPU-6050 0x%02X register nack\n", addr);
    return false;
  }
  mpuStop();
  delayMicroseconds(80);
  mpuStart();
  if (!mpuWriteBitByte(static_cast<uint8_t>((addr << 1) | 1))) {
    mpuStop();
    if (report) Serial.printf("[node-a] MPU-6050 0x%02X read nack\n", addr);
    return false;
  }
  for (size_t i = 0; i < len; ++i) data[i] = mpuReadBitByte(i + 1 < len);
  mpuStop();
  return true;
}

static bool mpuWrite(uint8_t reg, uint8_t value) {
  if (MPU6050_SEPARATE_I2C_BUS) return mpuSoftWrite(g_mpuAddr, reg, &value, 1);
  Wire.beginTransmission(g_mpuAddr);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

static int16_t mpuRead16From(TwoWire &bus) {
  const int hi = bus.read();
  const int lo = bus.read();
  return static_cast<int16_t>((hi << 8) | (lo & 0xFF));
}

static bool mpuWhoAmI(uint8_t addr, uint8_t &who) {
  if (MPU6050_SEPARATE_I2C_BUS) {
    if (!mpuSoftRead(addr, 0x75, &who, 1, true)) return false;
    Serial.printf("[node-a] MPU-6050 0x%02X whoami 0x%02X\n", addr, who);
    return who == 0x68 || who == 0x70 || who == 0x71 || who == 0x98;
  }
  Wire.setClock(SHARED_I2C_HZ);
  Wire.setTimeOut(100);
  Wire.beginTransmission(addr);
  Wire.write(0x75);
  const uint8_t tx = Wire.endTransmission(true);
  if (tx != 0) {
    Serial.printf("[node-a] MPU-6050 0x%02X write err %u\n", addr, tx);
    return false;
  }
  delay(2);
  const uint8_t got = Wire.requestFrom(addr, static_cast<uint8_t>(1), static_cast<uint8_t>(true));
  if (got != 1) {
    Serial.printf("[node-a] MPU-6050 0x%02X whoami bytes %u\n", addr, got);
    return false;
  }
  who = static_cast<uint8_t>(Wire.read());
  Serial.printf("[node-a] MPU-6050 0x%02X whoami 0x%02X\n", addr, who);
  return who == 0x68 || who == 0x70 || who == 0x71 || who == 0x98;
}

static void mpuReleasePins() {
  pinMode(g_mpuSda, INPUT);
  pinMode(g_mpuScl, INPUT);
}

static bool mpuPing(uint8_t addr) {
  mpuStart();
  const bool ack = mpuWriteBitByte(static_cast<uint8_t>(addr << 1));
  mpuStop();
  delayMicroseconds(50);
  return ack;
}

static void claimGpio(int pin) {
  if (pin >= 0 && pin < GPIO_NUM_MAX) gpio_reset_pin(static_cast<gpio_num_t>(pin));
}

static void reportPin(int pin) {
  claimGpio(pin);
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delayMicroseconds(40);
  const int low = digitalRead(pin);
  pinMode(pin, INPUT_PULLUP);
  delay(2);
  const int released = digitalRead(pin);
  Serial.printf("[node-a] GPIO %d driven low reads %d, released reads %d\n", pin, low, released);
}

static void restoreBmeBus() {
  if (!BME688_SEPARATE_I2C_BUS || !g_bme688Ready) return;
  g_bme688Wire.end();
  g_bme688Wire.begin(BME688_I2C_SDA_PIN, BME688_I2C_SCL_PIN, I2C_FREQUENCY_HZ);
  g_bme688Wire.setTimeOut(100);
}

static bool wire1Begin(int sda, int scl) {
  g_bme688Wire.end();
  claimGpio(sda);
  claimGpio(scl);
  const bool started = g_bme688Wire.begin(sda, scl, 100000);
  if (!started) return false;
  g_bme688Wire.setTimeOut(50);
  delay(20);
  return true;
}

static bool mpuPingReady(uint8_t addr, int tries) {
  g_bme688Wire.setTimeOut(25);
  for (int attempt = 0; attempt < tries; ++attempt) {
    g_bme688Wire.beginTransmission(addr);
    if (g_bme688Wire.endTransmission() == 0) return true;
    delay(4);
  }
  return false;
}

static bool mpuAdopt(uint8_t addr, int sda, int scl) {
  g_bme688Wire.beginTransmission(addr);
  g_bme688Wire.write(0x75);
  if (g_bme688Wire.endTransmission(true) != 0) {
    Serial.printf("[node-a] MPU-6050 0x%02X whoami write failed\n", addr);
    return false;
  }
  delay(2);
  if (g_bme688Wire.requestFrom(addr, static_cast<uint8_t>(1), static_cast<uint8_t>(true)) != 1) {
    Serial.printf("[node-a] MPU-6050 0x%02X whoami empty\n", addr);
    return false;
  }
  const uint8_t who = static_cast<uint8_t>(g_bme688Wire.read());
  Serial.printf("[node-a] MPU-6050 0x%02X whoami 0x%02X\n", addr, who);
  if (who != 0x68 && who != 0x70 && who != 0x71 && who != 0x98) return false;
  g_mpuAddr = addr;
  g_mpuSda = sda;
  g_mpuScl = scl;
  g_mpuHw = true;
  g_bme688Wire.beginTransmission(addr);
  g_bme688Wire.write(0x6B);
  g_bme688Wire.write(0x00);
  if (g_bme688Wire.endTransmission() != 0) {
    Serial.println("[node-a] MPU-6050 wake failed");
    g_mpuHw = false;
    return false;
  }
  delay(10);
  g_bme688Wire.beginTransmission(addr);
  g_bme688Wire.write(0x1B);
  g_bme688Wire.write(0x00);
  g_bme688Wire.endTransmission();
  g_bme688Wire.beginTransmission(addr);
  g_bme688Wire.write(0x1C);
  g_bme688Wire.write(0x00);
  g_bme688Wire.endTransmission();
  Serial.printf("[node-a] MPU-6050 ready at 0x%02X on SDA=%d SCL=%d\n", addr, sda, scl);
  return true;
}

static bool tryHwPair(int sda, int scl, int tries) {
  if (!wire1Begin(sda, scl)) {
    Serial.printf("[node-a] MPU-6050 hardware bus failed SDA=%d SCL=%d\n", sda, scl);
    return false;
  }
  delay(30);
  const uint8_t candidates[] = {MPU6050_I2C_ADDR, 0x69};
  for (uint8_t addr : candidates) {
    if (!mpuPingReady(addr, tries)) {
      Serial.printf("[node-a] MPU-6050 0x%02X no ack on SDA=%d SCL=%d\n", addr, sda, scl);
      continue;
    }
    if (mpuAdopt(addr, sda, scl)) return true;
  }
  return false;
}

static bool trySoftPair(int sda, int scl) {
  g_mpuSda = sda;
  g_mpuScl = scl;
  claimGpio(sda);
  claimGpio(scl);
  mpuPinHigh(sda);
  mpuPinHigh(scl);
  delay(2);
  if (digitalRead(sda) == LOW || digitalRead(scl) == LOW) mpuBusClear();
  mpuPinHigh(sda);
  mpuPinHigh(scl);
  delay(2);
  const int sdaLevel = digitalRead(sda);
  const int sclLevel = digitalRead(scl);
  Serial.printf("[node-a] MPU SDA=%d reads %d, SCL=%d reads %d\n", sda, sdaLevel, scl, sclLevel);
  if (sdaLevel == LOW || sclLevel == LOW) {
    Serial.println("[node-a] MPU-6050 data line held low");
    return false;
  }
  const uint8_t candidates[] = {MPU6050_I2C_ADDR, 0x69};
  for (int attempt = 0; attempt < 4; ++attempt) {
    mpuBusClear();
    for (uint8_t addr : candidates) {
      uint8_t who = 0;
      if (!mpuSoftRead(addr, 0x75, &who, 1, attempt == 3)) continue;
      Serial.printf("[node-a] MPU-6050 0x%02X whoami 0x%02X\n", addr, who);
      if (who != 0x68 && who != 0x70 && who != 0x71 && who != 0x98) continue;
      g_mpuAddr = addr;
      g_mpuHw = false;
      if (!mpuWrite(0x6B, 0x00)) {
        Serial.println("[node-a] MPU-6050 wake failed");
        continue;
      }
      delay(10);
      mpuWrite(0x1B, 0x00);
      mpuWrite(0x1C, 0x00);
      Serial.printf("[node-a] MPU-6050 ready at 0x%02X on SDA=%d SCL=%d\n", addr, sda, scl);
      return true;
    }
  }
  return false;
}

static bool beginMpu6050(bool restartBus) {
  if (!MPU6050_ENABLED) return false;
  if (MPU6050_SEPARATE_I2C_BUS) {
    const bool ready = trySoftPair(MPU6050_I2C_SDA_PIN, MPU6050_I2C_SCL_PIN);
    if (!ready) Serial.println("[node-a] MPU-6050 not found");
    return ready;
  }
  if (restartBus) {
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, SHARED_I2C_HZ);
    Wire.setClock(SHARED_I2C_HZ);
  }
  delay(20);
  const uint8_t candidates[] = {MPU6050_I2C_ADDR, 0x69};
  for (int attempt = 0; attempt < 2; ++attempt) {
    for (uint8_t addr : candidates) {
      uint8_t who = 0;
      if (!mpuWhoAmI(addr, who)) continue;
      g_mpuAddr = addr;
      if (!mpuWrite(0x6B, 0x00)) {
        Serial.println("[node-a] MPU-6050 wake failed");
        continue;
      }
      delay(10);
      mpuWrite(0x1B, 0x00);
      mpuWrite(0x1C, 0x00);
      Serial.printf("[node-a] MPU-6050 ready at 0x%02X\n", addr);
      return true;
    }
    delay(15);
  }
  Serial.println("[node-a] MPU-6050 not found");
  return false;
}

static void publishLastMpu(WearableReadings &out) {
  if (!g_haveMpu) return;
  out.mpu6050 = true;
  out.accel_x = g_lastAx;
  out.accel_y = g_lastAy;
  out.accel_z = g_lastAz;
  out.gyro_x = g_lastGx;
  out.gyro_y = g_lastGy;
  out.gyro_z = g_lastGz;
}

static int16_t mpuWord(const uint8_t *raw, size_t index) {
  return static_cast<int16_t>((raw[index] << 8) | raw[index + 1]);
}

static bool readMpuSample(WearableReadings &out) {
  int16_t ax = 0;
  int16_t ay = 0;
  int16_t az = 0;
  int16_t gx = 0;
  int16_t gy = 0;
  int16_t gz = 0;
  if (MPU6050_SEPARATE_I2C_BUS && g_mpuHw) {
    if (!wire1Begin(g_mpuSda, g_mpuScl)) return false;
    if (!mpuPingReady(g_mpuAddr, 8)) {
      Serial.printf("[node-a] MPU-6050 0x%02X not answering for sample\n", g_mpuAddr);
      return false;
    }
    static bool woke = false;
    if (!woke) {
      g_bme688Wire.beginTransmission(g_mpuAddr);
      g_bme688Wire.write(0x6B);
      g_bme688Wire.write(0x00);
      g_bme688Wire.endTransmission();
      delay(30);
      woke = true;
    }
    g_bme688Wire.beginTransmission(g_mpuAddr);
    g_bme688Wire.write(0x3B);
    const uint8_t tx = g_bme688Wire.endTransmission(true);
    delay(2);
    const uint8_t got = g_bme688Wire.requestFrom(g_mpuAddr, static_cast<uint8_t>(14), static_cast<uint8_t>(true));
    if (tx != 0 || got != 14) return false;
    uint8_t raw[14] = {};
    for (uint8_t i = 0; i < 14; ++i) raw[i] = static_cast<uint8_t>(g_bme688Wire.read());
    ax = mpuWord(raw, 0);
    ay = mpuWord(raw, 2);
    az = mpuWord(raw, 4);
    gx = mpuWord(raw, 8);
    gy = mpuWord(raw, 10);
    gz = mpuWord(raw, 12);
  } else if (MPU6050_SEPARATE_I2C_BUS) {
    uint8_t raw[14] = {};
    if (!mpuSoftRead(g_mpuAddr, 0x3B, raw, sizeof(raw), false)) return false;
    ax = mpuWord(raw, 0);
    ay = mpuWord(raw, 2);
    az = mpuWord(raw, 4);
    gx = mpuWord(raw, 8);
    gy = mpuWord(raw, 10);
    gz = mpuWord(raw, 12);
  } else {
    Wire.setClock(SHARED_I2C_HZ);
    Wire.setTimeOut(80);
    Wire.beginTransmission(g_mpuAddr);
    Wire.write(0x3B);
    if (Wire.endTransmission(true) != 0) return false;
    delay(2);
    if (Wire.requestFrom(g_mpuAddr, static_cast<uint8_t>(14), static_cast<uint8_t>(true)) != 14) return false;
    ax = mpuRead16From(Wire);
    ay = mpuRead16From(Wire);
    az = mpuRead16From(Wire);
    mpuRead16From(Wire);
    gx = mpuRead16From(Wire);
    gy = mpuRead16From(Wire);
    gz = mpuRead16From(Wire);
  }
  out.mpu6050 = true;
  out.accel_x = static_cast<float>(ax) / 16384.0f;
  out.accel_y = static_cast<float>(ay) / 16384.0f;
  out.accel_z = static_cast<float>(az) / 16384.0f;
  out.gyro_x = static_cast<float>(gx) / 131.0f;
  out.gyro_y = static_cast<float>(gy) / 131.0f;
  out.gyro_z = static_cast<float>(gz) / 131.0f;
  g_haveMpu = true;
  g_lastAx = out.accel_x;
  g_lastAy = out.accel_y;
  g_lastAz = out.accel_z;
  g_lastGx = out.gyro_x;
  g_lastGy = out.gyro_y;
  g_lastGz = out.gyro_z;
  g_mpuMs = millis();
  return true;
}

static void readMpu6050(WearableReadings &out) {
  if (!g_mpu6050Ready) return;
  const bool got = readMpuSample(out);
  if (g_mpuHw) restoreBmeBus();
  if (got) return;
  publishLastMpu(out);
  if (!out.mpu6050) Serial.println("[node-a] MPU-6050 read missed");
}

static void readMq6(WearableReadings &out) {
  if (!MQ6_ENABLED) return;
  const int raw = analogRead(MQ6_ADC_PIN);
  if (raw < 0 || raw > 4095) return;
  out.mq6 = true;
  out.mq6_raw = static_cast<uint16_t>(raw);
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

static void scanMpuBus() {
  mpuBusInit();
  Serial.printf("[node-a] I2C scan MPU-6050 SDA=%d SCL=%d\n", g_mpuSda, g_mpuScl);
  uint8_t found = 0;
  for (uint8_t addr = 1; addr < 127; ++addr) {
    mpuStart();
    const bool ack = mpuWriteBitByte(static_cast<uint8_t>(addr << 1));
    mpuStop();
    if (!ack) continue;
    ++found;
    Serial.printf("[node-a]   found 0x%02X\n", addr);
  }
  if (found == 0) Serial.println("[node-a]   no device answered");
}

static void runSensorScan() {
  scanI2C(Wire, I2C_SDA_PIN, I2C_SCL_PIN, "SCD40 bus");
  scanI2C(g_bme688Wire, BME688_I2C_SDA_PIN, BME688_I2C_SCL_PIN, "BME688 bus");
  if (MPU6050_SEPARATE_I2C_BUS) scanMpuBus();
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, SHARED_I2C_HZ);
  Wire.setClock(SHARED_I2C_HZ);
}

static void scanI2C(TwoWire &bus, int sda, int scl, const char *label) {
  bus.begin(sda, scl, I2C_FREQUENCY_HZ);
  Serial.printf("[node-a] I2C scan %s SDA=%d SCL=%d\n", label, sda, scl);
  uint8_t found = 0;
  for (uint8_t addr = 1; addr < 127; ++addr) {
    bus.beginTransmission(addr);
    if (bus.endTransmission() == 0) {
      ++found;
      Serial.printf("[node-a]   found 0x%02X\n", addr);
    }
  }
  if (found == 0) {
    Serial.println("[node-a]   no device answered");
  }
}

void featuresBegin() {
  if (loadWifiCreds(g_wifi)) {
    Serial.printf("[node-a] router from device memory: %s\n", g_wifi.ssid);
  } else if (!wifiNameIsPlaceholder()) {
    rememberWifi(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("[node-a] router from config.h fallback: %s\n", g_wifi.ssid);
  } else {
    Serial.println("[node-a] no router yet — enter it on the dashboard");
  }

  if (CANCEL_BUTTON_ENABLED) {
    pinMode(CANCEL_BUTTON_PIN, INPUT_PULLUP);
  }
  if (BUZZER_INSTALLED) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
  }

  if (MPU6050_SEPARATE_I2C_BUS && MPU6050_ENABLED) {
    g_mpu6050Ready = beginMpu6050(false);
  }
  if (!i2cLinesIdle(I2C_SDA_PIN, I2C_SCL_PIN, "GPIO 8/9")) {
    Serial.println("[node-a] GPIO 8/9 looked busy, trying the SCD40 anyway");
  }
  if (!MPU6050_SEPARATE_I2C_BUS) g_mpu6050Ready = beginMpu6050(true);
  g_scd40Ready = beginScd40();
  if (!i2cLinesIdle(BME688_I2C_SDA_PIN, BME688_I2C_SCL_PIN, "GPIO 17/18")) {
    Serial.println("[node-a] GPIO 17/18 looked busy, trying the BME688 anyway");
  }
  g_bme688Ready = beginBme688();
  if (MQ6_ENABLED) {
    analogReadResolution(12);
    analogSetPinAttenuation(MQ6_ADC_PIN, ADC_11db);
    pinMode(MQ6_ADC_PIN, INPUT);
    Serial.printf("[node-a] MQ-6 ADC GPIO %d\n", MQ6_ADC_PIN);
  }
  Serial.printf("[node-a] placeholders bme=%d max30102=%d mpu=%d gps=%d battery=%d screen=%d buzzer=%d ecdsa=%d model=%s\n",
                BME688_ENABLED, MAX30102_ENABLED, MPU6050_ENABLED, GPS_ENABLED, BATTERY_SENSE_ENABLED,
                TOUCHSCREEN_INSTALLED, BUZZER_INSTALLED, ECDSA_SIGNING_ENABLED, FALL_MODEL_ID);
  Serial.println("[node-a] serial command: fall");
}

static void retryMissingSensors() {
  static uint32_t lastMs = 0;
  if (g_scd40Ready && g_bme688Ready && (!MPU6050_ENABLED || g_mpu6050Ready)) return;
  const uint32_t now = millis();
  if (lastMs != 0 && now - lastMs < 8000) return;
  lastMs = now;
  if (!g_scd40Ready) {
    Serial.println("[node-a] retrying SCD40");
    g_scd40Ready = beginScd40();
  }
  if (MPU6050_ENABLED && !g_mpu6050Ready) {
    Serial.println("[node-a] retrying MPU-6050");
    g_mpu6050Ready = beginMpu6050(false);
  }
  if (BME688_ENABLED && !g_bme688Ready) {
    Serial.println("[node-a] retrying BME688");
    g_bme688Ready = beginBme688();
  }
}

void featuresRead(WearableReadings &out) {
  retryMissingSensors();
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
  out.mq6_raw = MQ6_RAW_ABSENT;
  out.latitude_e7 = GPS_COORD_ABSENT;
  out.longitude_e7 = GPS_COORD_ABSENT;
  out.altitude_dm = GPS_ALT_ABSENT;
  out.gps_satellites = GPS_SATELLITES_ABSENT;
  out.battery_percent = BATTERY_PERCENT_ABSENT;

  readScd40(out);
  readMpu6050(out);
  readBme688(out);
  readMax30102(out);
  readMq6(out);
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
