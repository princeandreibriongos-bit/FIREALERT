#pragma once

#include "features.h"

/** Feed one MPU sample (g / dps). Runs Edge Impulse when the window is full. */
void eiActivityPushSample(const WearableReadings &in);

/** Last classifier label ("idle", "walk", or ""). */
const char *eiActivityLabel();

/** Confidence 0..1 for eiActivityLabel(). */
float eiActivityScore();
