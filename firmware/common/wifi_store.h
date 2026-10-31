#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <string.h>

// Saved networks live in ESP32 flash. The dashboard sends the active network
// with a "wifi" line and any other saved network with an "also" line. The
// gateway tries the active one first, then the others that are in range.
// config.h is only a fallback for a board that has never been provisioned.

static constexpr uint8_t WIFI_SLOTS = 4;

struct WifiCreds {
  char ssid[33];
  char password[64];
  bool fromNvs;
};

struct WifiSlot {
  char ssid[33];
  char password[64];
};

struct WifiBook {
  WifiSlot slots[WIFI_SLOTS];
  uint8_t count;
  uint8_t preferred;
};

inline void loadWifiBook(WifiBook &book) {
  memset(&book, 0, sizeof(book));
  Preferences prefs;
  if (!prefs.begin("firealert", true)) return;

  const uint8_t stored = prefs.getUChar("cnt", 0);
  const uint8_t pref = prefs.getUChar("pref", 0);
  const uint8_t rawCount = stored > WIFI_SLOTS ? WIFI_SLOTS : stored;
  bool keptPreferred = false;
  for (uint8_t i = 0; i < rawCount; i++) {
    char nameKey[4];
    char passKey[4];
    snprintf(nameKey, sizeof(nameKey), "n%u", static_cast<unsigned>(i));
    snprintf(passKey, sizeof(passKey), "p%u", static_cast<unsigned>(i));
    const String ssid = prefs.getString(nameKey, "");
    const String pass = prefs.getString(passKey, "");
    if (ssid.length() == 0 || ssid.length() > 32 || pass.length() > 63) continue;
    strncpy(book.slots[book.count].ssid, ssid.c_str(), sizeof(book.slots[book.count].ssid) - 1);
    strncpy(book.slots[book.count].password, pass.c_str(), sizeof(book.slots[book.count].password) - 1);
    if (i == pref) {
      book.preferred = book.count;
      keptPreferred = true;
    }
    book.count++;
  }

  if (book.count == 0) {
    const String ssid = prefs.getString("ssid", "");
    const String pass = prefs.getString("pass", "");
    if (ssid.length() > 0 && ssid.length() <= 32 && pass.length() <= 63) {
      strncpy(book.slots[0].ssid, ssid.c_str(), sizeof(book.slots[0].ssid) - 1);
      strncpy(book.slots[0].password, pass.c_str(), sizeof(book.slots[0].password) - 1);
      book.count = 1;
      book.preferred = 0;
      keptPreferred = true;
    }
  }
  prefs.end();
  if (!keptPreferred || book.preferred >= book.count) book.preferred = 0;
}

inline bool persistWifiBook(const WifiBook &book) {
  Preferences prefs;
  if (!prefs.begin("firealert", false)) return false;
  prefs.putUChar("cnt", book.count);
  prefs.putUChar("pref", book.preferred);
  for (uint8_t i = 0; i < WIFI_SLOTS; i++) {
    char nameKey[4];
    char passKey[4];
    snprintf(nameKey, sizeof(nameKey), "n%u", static_cast<unsigned>(i));
    snprintf(passKey, sizeof(passKey), "p%u", static_cast<unsigned>(i));
    if (i < book.count) {
      prefs.putString(nameKey, book.slots[i].ssid);
      prefs.putString(passKey, book.slots[i].password);
    } else {
      prefs.remove(nameKey);
      prefs.remove(passKey);
    }
  }
  if (book.count > 0 && book.preferred < book.count) {
    prefs.putString("ssid", book.slots[book.preferred].ssid);
    prefs.putString("pass", book.slots[book.preferred].password);
  }
  prefs.end();
  return true;
}

inline bool upsertWifi(const char *ssid, const char *password, bool prefer) {
  if (ssid == nullptr || password == nullptr) return false;
  const size_t ssidLen = strlen(ssid);
  const size_t passLen = strlen(password);
  if (ssidLen == 0 || ssidLen > 32 || passLen > 63) return false;

  WifiBook book = {};
  loadWifiBook(book);
  int index = -1;
  for (uint8_t i = 0; i < book.count; i++) {
    if (strcmp(book.slots[i].ssid, ssid) == 0) {
      index = i;
      break;
    }
  }
  if (index < 0) {
    if (book.count < WIFI_SLOTS) {
      index = book.count;
      book.count++;
    } else {
      index = static_cast<int>((book.preferred + 1) % WIFI_SLOTS);
    }
  }
  memset(&book.slots[index], 0, sizeof(book.slots[index]));
  strncpy(book.slots[index].ssid, ssid, sizeof(book.slots[index].ssid) - 1);
  strncpy(book.slots[index].password, password, sizeof(book.slots[index].password) - 1);
  if (prefer || book.count == 1) book.preferred = static_cast<uint8_t>(index);
  if (book.preferred >= book.count) book.preferred = 0;
  return persistWifiBook(book);
}

inline bool loadWifiCreds(WifiCreds &out) {
  memset(&out, 0, sizeof(out));
  WifiBook book = {};
  loadWifiBook(book);
  if (book.count == 0 || book.preferred >= book.count) return false;
  strncpy(out.ssid, book.slots[book.preferred].ssid, sizeof(out.ssid) - 1);
  strncpy(out.password, book.slots[book.preferred].password, sizeof(out.password) - 1);
  out.fromNvs = true;
  return true;
}

inline bool saveWifiCreds(const char *ssid, const char *password) {
  return upsertWifi(ssid, password, true);
}

// One serial line per call. `used` keeps a partial line between calls.
// Pass FASerial (CDC+UART0) on Node B so CH343 boards work with the USB bridge.
inline bool takeSerialLine(Stream &stream, char *buf, size_t cap, size_t &used) {
  if (buf == nullptr || cap < 2) return false;
  while (stream.available() > 0) {
    const char c = static_cast<char>(stream.read());
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

inline bool takeSerialLine(char *buf, size_t cap, size_t &used) {
  return takeSerialLine(Serial, buf, cap, used);
}

// "wifi" makes that network the one to join. "also" only remembers it.
inline bool parseWifiCommand(const char *line, bool &prefer, char *ssid, size_t ssidCap, char *password,
                             size_t passCap) {
  if (line == nullptr) return false;
  const char *body = nullptr;
  if (strncmp(line, "wifi\t", 5) == 0) {
    prefer = true;
    body = line + 5;
  } else if (strncmp(line, "also\t", 5) == 0) {
    prefer = false;
    body = line + 5;
  } else {
    return false;
  }
  const char *tab = strchr(body, '\t');
  if (tab == nullptr) return false;
  const size_t nameLen = static_cast<size_t>(tab - body);
  const char *pass = tab + 1;
  const size_t passLen = strlen(pass);
  if (nameLen == 0 || nameLen >= ssidCap || passLen >= passCap) return false;
  memcpy(ssid, body, nameLen);
  ssid[nameLen] = '\0';
  memcpy(password, pass, passLen + 1);
  return true;
}

// Line format: wifi<TAB>ssid<TAB>password
inline bool parseWifiLine(const char *line, char *ssid, size_t ssidCap, char *password, size_t passCap) {
  bool prefer = false;
  if (!parseWifiCommand(line, prefer, ssid, ssidCap, password, passCap)) return false;
  return prefer;
}
