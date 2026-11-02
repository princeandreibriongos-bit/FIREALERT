#pragma once

#include <Arduino.h>

/**
 * USB CDC (native USB) + UART0 (CH343/CH340 bridge) on ESP32-S3.
 * Old DevKits use native USB; some replacement boards only expose CH343.
 * Mirror both so npm run bridge works on either connector.
 */
inline void firealertSerialBegin(unsigned long baud = 115200) {
  Serial.begin(baud);
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
  Serial0.begin(baud);
#endif
}

struct FirealertSerial : public Stream {
  int available() override {
    int n = Serial.available();
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
    n += Serial0.available();
#endif
    return n;
  }

  int read() override {
    if (Serial.available() > 0) return Serial.read();
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
    if (Serial0.available() > 0) return Serial0.read();
#endif
    return -1;
  }

  int peek() override {
    if (Serial.available() > 0) return Serial.peek();
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
    if (Serial0.available() > 0) return Serial0.peek();
#endif
    return -1;
  }

  void flush() override {
    Serial.flush();
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
    Serial0.flush();
#endif
  }

  size_t write(uint8_t c) override {
    Serial.write(c);
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
    Serial0.write(c);
#endif
    return 1;
  }

  size_t write(const uint8_t *buffer, size_t size) override {
    Serial.write(buffer, size);
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
    Serial0.write(buffer, size);
#endif
    return size;
  }
};

static FirealertSerial FASerial;
