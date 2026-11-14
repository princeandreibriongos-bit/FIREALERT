#pragma once

#include "features.h"

/** Feed one MPU sample (g / dps). Does not run the model. */
void eiActivityPushSample(const WearableReadings &in);

/** Classify at most every few seconds, after the radio packet is already out. */
void eiActivityRunIfDue();

/** Last classifier label ("idle", "walk", or ""). */
const char *eiActivityLabel();

/** Confidence 0..1 for eiActivityLabel(). */
float eiActivityScore();
