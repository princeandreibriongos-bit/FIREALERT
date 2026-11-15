#pragma once

#include "features.h"

/** Feed one fresh MPU sample (g and dps). Repeated last-values are ignored. */
void eiActivityPushSample(const WearableReadings &in);

/** Classify at most every few seconds, after the radio packet is already out. */
void eiActivityRunIfDue();

/** Last classifier label ("idle", "walk", or ""). */
const char *eiActivityLabel();

/** Confidence 0..1 for eiActivityLabel(). */
float eiActivityScore();
