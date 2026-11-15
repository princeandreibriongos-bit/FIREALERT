#include "weda_fall.h"

#include <math.h>

float wedaFallScore(const float *accelMag, const float *gyroMag, int count) {
  if (count < WEDA_WINDOW || accelMag == nullptr || gyroMag == nullptr) return -1.0f;
  const int n = WEDA_WINDOW;
  float sum = 0.0f;
  float amin = accelMag[0];
  float amax = accelMag[0];
  float gmax = gyroMag[0];
  int low = 0;
  int high = 0;
  int dip = -1;
  int impact = -1;
  for (int i = 0; i < n; ++i) {
    const float accel = accelMag[i];
    sum += accel;
    if (accel < amin) amin = accel;
    if (accel > amax) amax = accel;
    if (gyroMag[i] > gmax) gmax = gyroMag[i];
    if (accel < WEDA_LOW_G) {
      ++low;
      if (dip < 0) dip = i;
    }
    if (accel > WEDA_HIGH_G) {
      ++high;
      impact = i;
    }
  }
  const float avg = sum / static_cast<float>(n);
  float var = 0.0f;
  for (int i = 0; i < n; ++i) {
    const float delta = accelMag[i] - avg;
    var += delta * delta;
  }
  const float features[8] = {
      amin,
      amax,
      sqrtf(var / static_cast<float>(n)),
      gmax,
      static_cast<float>(low) / static_cast<float>(n),
      static_cast<float>(high) / static_cast<float>(n),
      (dip >= 0 && impact > dip) ? 1.0f : 0.0f,
      amax - amin,
  };
  float score = WEDA_BIAS;
  for (int i = 0; i < 8; ++i) {
    score += WEDA_WEIGHT[i] * ((features[i] - WEDA_MEAN[i]) / WEDA_STD[i]);
  }
  if (score > 30.0f) score = 30.0f;
  if (score < -30.0f) score = -30.0f;
  return 1.0f / (1.0f + expf(-score));
}
