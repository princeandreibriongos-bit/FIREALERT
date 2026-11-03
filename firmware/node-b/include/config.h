#pragma once

#include <stdint.h>

// --- Uplink ----------------------------------------------------------------
// The capstone gateway forwards over cellular when a modem is installed.
// Until then, Wi-Fi is the stand-in that carries the same JSON POST.
// Set the router and the phone hotspot on the dashboard. The gateway stores
// both and joins whichever one is in range, trying the active one first.
// Room router. The gateway joins this first and keeps it in flash after the
// first boot. A phone hotspot can still be added from the Gateway page.
static constexpr bool CELLULAR_MODEM_INSTALLED = false;
static constexpr const char *WIFI_SSID = "PLDTHOMEFIBRYeau4";
static constexpr const char *WIFI_PASSWORD = "Briongos2025";

// Dead LAN address. Kept so an old dashboard pull still compiles. Live posts
// go to the hosted board below, so a closed USB window does not hide the gateway.
static constexpr const char *TELEMETRY_URL = "http://192.168.100.6:3000/api/telemetry";
static constexpr const char *HOSTED_LINK_URL = "https://firealert-three.vercel.app/api/link";
static constexpr const char *HOSTED_TELEMETRY_URL = "https://firealert-three.vercel.app/api/telemetry";

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
