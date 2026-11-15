#include "activity_model.h"

#include <math.h>
#include <string.h>

bool activityPredict(const float *accelMag, const float *gyroMag, int count, char *label, int labelSize, float *confidence) {
  (void)gyroMag;
  if (count < ACTIVITY_WINDOW || accelMag == nullptr || label == nullptr || labelSize < 6) return false;
  const int n = ACTIVITY_WINDOW;
  float sum = 0.0f;
  float amin = accelMag[0];
  float amax = accelMag[0];
  for (int i = 0; i < n; ++i) {
    const float accel = accelMag[i];
    sum += accel;
    if (accel < amin) amin = accel;
    if (accel > amax) amax = accel;
  }
  const float avg = sum / static_cast<float>(n);
  float var = 0.0f;
  float step = 0.0f;
  for (int i = 0; i < n; ++i) {
    const float delta = accelMag[i] - avg;
    var += delta * delta;
    if (i > 0) step += fabsf(accelMag[i] - accelMag[i - 1]);
  }
  step /= static_cast<float>(n - 1);
  const float features[ACTIVITY_FEATURES] = {avg, sqrtf(var / static_cast<float>(n)), amax, amin, step};
  float logits[3];
  float peak = -1.0e9f;
  for (int cls = 0; cls < 3; ++cls) {
    float score = ACTIVITY_BIAS[cls];
    for (int i = 0; i < ACTIVITY_FEATURES; ++i) {
      score += ACTIVITY_WEIGHT[cls][i] * ((features[i] - ACTIVITY_MEAN[i]) / ACTIVITY_STD[i]);
    }
    logits[cls] = score;
    if (score > peak) peak = score;
  }
  float expv[3];
  float total = 0.0f;
  int best = 0;
  for (int cls = 0; cls < 3; ++cls) {
    float shifted = logits[cls] - peak;
    if (shifted > 30.0f) shifted = 30.0f;
    if (shifted < -30.0f) shifted = -30.0f;
    expv[cls] = expf(shifted);
    total += expv[cls];
    if (expv[cls] > expv[best]) best = cls;
  }
  const float conf = total > 0.0f ? expv[best] / total : 0.0f;
  const char *name = "clear";
  if (conf >= ACTIVITY_MIN) {
    if (best == 0) name = "idle";
    else if (best == 1) name = "walk";
    else name = "run";
  }
  strncpy(label, name, static_cast<size_t>(labelSize - 1));
  label[labelSize - 1] = '\0';
  if (confidence != nullptr) *confidence = conf;
  return true;
}
