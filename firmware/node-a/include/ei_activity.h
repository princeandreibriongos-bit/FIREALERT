#pragma once

#include "features.h"

/** No-op. The shoulder model is gone; a wrist model is not linked yet. */
void eiActivityPushSample(const WearableReadings &in);

/** No-op. Does not run a classifier. */
void eiActivityRunIfDue();

/** Always "" until a wrist model is linked. The gateway shows that as Waiting. */
const char *eiActivityLabel();

/** Always 0. */
float eiActivityScore();
