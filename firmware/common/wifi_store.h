#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <string.h>

// Router credentials live in ESP32 flash, written from the dashboard over USB
// or from GET /api/network. config.h is only a fallback for a board that has
// never been provisioned.

struct WifiCreds {
  char ssid[33];
  char password[64];
  bool fromNvs;
};

inline bool loadWifiCreds(WifiCreds &out) {
  memset(&out, 0, sizeof(out));
  Preferences prefs;
  if (!prefs.begin("firealert", true)) return false;
  const String ssid = prefs.getString("ssid", "");
  const String pass = prefs.getString("pass", "");
  prefs.end();
  if (ssid.length() == 0 || ssid.length() > 32 || pass.length() > 63) return false;
  strncpy(out.ssid, ssid.c_str(), sizeof(out.ssid) - 1);
  strncpy(out.password, pass.c_str(), sizeof(out.password) - 1);
  out.fromNvs = true;
  return true;
}

inline bool saveWifiCreds(const char *ssid, const char *password) {
  if (ssid == nullptr || password == nullptr) return false;
  const size_t ssidLen = strlen(ssid);
  const size_t passLen = strlen(password);
  if (ssidLen == 0 || ssidLen > 32 || passLen > 63) return false;
  Preferences prefs;
  if (!prefs.begin("firealert", false)) return false;
  prefs.putString("ssid", ssid);
  prefs.putString("pass", password);
  prefs.end();
  return true;
}

// One serial line per call. `used` keeps a partial line between calls.
inline bool takeSerialLine(char *buf, size_t cap, size_t &used) {
  if (buf == nullptr || cap < 2) return false;
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      if (used == 0) continue;
      buf[used] = '\0';
      used = 0;
      return true;
    }
    if (used + 1 < cap) buf[used++] = c;
  }
  return false;
}

// Line format: wifi<TAB>ssid<TAB>password
inline bool parseWifiLine(const char *line, char *ssid, size_t ssidCap, char *password, size_t passCap) {
  if (line == nullptr || strncmp(line, "wifi\t", 5) != 0) return false;
  const char *name = line + 5;
  const char *tab = strchr(name, '\t');
  if (tab == nullptr) return false;
  const size_t nameLen = static_cast<size_t>(tab - name);
  const char *pass = tab + 1;
  const size_t passLen = strlen(pass);
  if (nameLen == 0 || nameLen >= ssidCap || passLen >= passCap) return false;
  memcpy(ssid, name, nameLen);
  ssid[nameLen] = '\0';
  memcpy(password, pass, passLen + 1);
  return true;
}
