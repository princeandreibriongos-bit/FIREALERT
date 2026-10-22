#pragma once

#include <stdint.h>

// --- User settings ---------------------------------------------------------
static constexpr const char *WIFI_SSID = "YOUR_WIFI_SSID";
static constexpr const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// PC running `npm run dev` on the same LAN, e.g. http://192.168.1.50:3000/api/telemetry
static constexpr const char *TELEMETRY_URL = "http://192.168.1.13:3000/api/telemetry";

static constexpr const char *GATEWAY_ID = "node-b";
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;
static constexpr uint32_t HTTP_TIMEOUT_MS = 8000;
