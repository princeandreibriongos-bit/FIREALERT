#pragma once

// Trained on datasets/mhealth 10 Hz windows. Worn on the left wrist.
// Magnitudes only, so the right-wrist source is not mirrored.
// Classes: 0 idle, 1 walk, 2 run. Confidence is the softmax probability.

static constexpr int ACTIVITY_WINDOW = 30;
static constexpr float ACTIVITY_MIN = 0.45f;
static constexpr int ACTIVITY_FEATURES = 5;
static constexpr float ACTIVITY_MEAN[ACTIVITY_FEATURES] = { 1.23016048, 0.28734575, 1.80787990, 0.83201760, 0.34783248 };
static constexpr float ACTIVITY_STD[ACTIVITY_FEATURES] = { 0.36610812, 0.33395987, 0.96988516, 0.22264713, 0.42103742 };
static constexpr float ACTIVITY_BIAS[3] = { -0.52525699, 0.72914584, -0.20388885 };
static constexpr float ACTIVITY_WEIGHT[3][ACTIVITY_FEATURES] = {
  { -0.31715260, -1.39473173, -1.22270743, 2.33745653, -1.01155269 },
  { -1.04235329, -0.02308123, -0.13862554, -1.83950639, -0.53222913 },
  { 1.35950590, 1.41781295, 1.36133297, -0.49795014, 1.54378181 }
};

/** Chronological magnitudes. Writes the class name and confidence. Returns false until the window is full. */
bool activityPredict(const float *accelMag, const float *gyroMag, int count, char *label, int labelSize, float *confidence);
