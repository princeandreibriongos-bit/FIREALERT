#pragma once

// Trained on datasets/weda-fall 10 Hz windows. Magnitudes only.
// Score = sigmoid(bias + sum(weight * (feature - mean) / std)).

static constexpr int WEDA_WINDOW = 30;
static constexpr float WEDA_LOW_G = 0.60f;
static constexpr float WEDA_HIGH_G = 2.20f;
static constexpr float WEDA_THRESHOLD = 0.72f;
static constexpr float WEDA_BIAS = -0.26679290f;
static constexpr float WEDA_MEAN[8] = { 0.66154231, 2.19551399, 0.33062293, 314.03124187, 0.02810474, 0.03187769, 0.16413603, 1.53397168 };
static constexpr float WEDA_STD[8] = { 0.21351179, 1.29910162, 0.32839334, 222.30146737, 0.06240502, 0.06581927, 0.37039896, 1.43271751 };
static constexpr float WEDA_WEIGHT[8] = { -0.16900380, 0.44127269, -0.01137763, 0.19875954, -0.23688933, -0.34276397, 0.10482967, 0.42530531 };

/** Chronological magnitudes. Returns -1 until count reaches WEDA_WINDOW. */
float wedaFallScore(const float *accelMag, const float *gyroMag, int count);
