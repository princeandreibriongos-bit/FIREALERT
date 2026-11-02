#pragma once

#include <stdint.h>

// --- Uplink ----------------------------------------------------------------
// The capstone gateway forwards over cellular when a modem is installed.
// Until then, Wi-Fi is the stand-in that carries the same JSON POST.
// Set the router and the phone hotspot on the dashboard. The gateway stores
// both and joins whichever one is in range, trying the active one first.
// The constants below are used only until the board has saved credentials.
static constexpr bool CELLULAR_MODEM_INSTALLED = false;
static constexpr const char *WIFI_SSID = "YOUR_WIFI_SSID";
static constexpr const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Optional Wi-Fi POST when USB bridge is not used. This PC's LAN IP was 192.168.100.6.
// Wrong IP used to stall the gateway (~8s timeout per packet). USB serial is now primary.
static constexpr const char *TELEMETRY_URL = "http://192.168.100.6:3000/api/telemetry";

static constexpr const char *GATEWAY_ID = "node-b";
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 12000;
// Same fallback the wearable uses when it cannot join Wi-Fi. ESP-NOW only
// works when both radios are on this channel.
static constexpr uint8_t WIFI_CHANNEL = 9;
static constexpr uint32_t HTTP_TIMEOUT_MS = 8000;

// These match the wearable. The gateway reports them so the dashboard does
// not describe hardware that is not on the board.
static constexpr bool BUZZER_INSTALLED = false;
static constexpr bool TOUCHSCREEN_INSTALLED = false;
static constexpr const char *FALL_MODEL_ID = "edge-impulse-placeholder";
