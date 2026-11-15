#include "ei_activity.h"

// The shoulder idle/walk model was removed when the MPU-6050 moved to the wrist.
// These hooks stay so the packet path still compiles. The label stays empty
// until a wrist model is trained and linked.

void eiActivityPushSample(const WearableReadings &) {}

void eiActivityRunIfDue() {}

const char *eiActivityLabel() { return ""; }

float eiActivityScore() { return 0.0f; }
