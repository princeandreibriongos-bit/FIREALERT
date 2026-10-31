#include "ei_activity.h"

#include <Arduino.h>
#include <string.h>

#include "edge-impulse-sdk/classifier/ei_run_classifier.h"

static float g_features[EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE];
static size_t g_samples = 0;
static char g_label[12] = "";
static float g_score = 0.0f;

static int get_feature_data(size_t offset, size_t length, float *out_ptr) {
  memcpy(out_ptr, g_features + offset, length * sizeof(float));
  return 0;
}

static void runInference() {
  signal_t signal;
  signal.total_length = EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE;
  signal.get_data = &get_feature_data;

  ei_impulse_result_t result = {};
  const EI_IMPULSE_ERROR err = run_classifier(&signal, &result, false);
  if (err != EI_IMPULSE_OK) {
    Serial.printf("[node-a] EI classify err %d\n", static_cast<int>(err));
    return;
  }

  size_t best = 0;
  for (size_t i = 1; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (result.classification[i].value > result.classification[best].value) best = i;
  }
  g_score = result.classification[best].value;
  strncpy(g_label, result.classification[best].label, sizeof(g_label) - 1);
  g_label[sizeof(g_label) - 1] = '\0';

  Serial.printf("[node-a] activity=%s score=%.2f (dsp=%dms nn=%dms)\n", g_label, g_score,
                result.timing.dsp, result.timing.classification);
}

void eiActivityPushSample(const WearableReadings &in) {
  if (!in.mpu6050) return;

  if (g_samples >= EI_CLASSIFIER_RAW_SAMPLE_COUNT) {
    memmove(g_features, g_features + EI_CLASSIFIER_RAW_SAMPLES_PER_FRAME,
            (EI_CLASSIFIER_RAW_SAMPLE_COUNT - 1) * EI_CLASSIFIER_RAW_SAMPLES_PER_FRAME * sizeof(float));
    g_samples = EI_CLASSIFIER_RAW_SAMPLE_COUNT - 1;
  }

  const size_t base = g_samples * EI_CLASSIFIER_RAW_SAMPLES_PER_FRAME;
  g_features[base + 0] = in.accel_x;
  g_features[base + 1] = in.accel_y;
  g_features[base + 2] = in.accel_z;
  g_features[base + 3] = in.gyro_x;
  g_features[base + 4] = in.gyro_y;
  g_features[base + 5] = in.gyro_z;
  g_samples++;

  if (g_samples >= EI_CLASSIFIER_RAW_SAMPLE_COUNT) {
    runInference();
  }
}

const char *eiActivityLabel() { return g_label; }

float eiActivityScore() { return g_score; }
