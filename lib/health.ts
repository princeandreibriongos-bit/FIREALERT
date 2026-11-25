import { fallNeedsReview, type FallState, type HealthReport } from "./telemetry-core.ts";

export type { HealthReport };

export type HealthTone = "ok" | "warn" | "alert";

export type HealthCopy = {
  tone: HealthTone;
  lines: string[];
};

export function healthNeedsReview(health: HealthReport | null | undefined): boolean {
  if (!health) return false;
  return health.hrHigh || health.hrLow || health.spo2Low || health.spo2Critical || health.manual || health.gasHigh;
}

export function personNeedsReview(person: { fall: { state: FallState }; health?: HealthReport | null }): boolean {
  return fallNeedsReview(person.fall.state) || healthNeedsReview(person.health);
}

function motionPhrase(label: string): string {
  if (label === "run") return "running";
  if (label === "walk") return "walking";
  if (label === "idle") return "still";
  if (label === "fall") return "in a fall review";
  return "not in a run";
}

export function healthCopy(health: HealthReport | null | undefined, activityLabel: string): HealthCopy {
  if (!health?.reported) {
    return {
      tone: "ok",
      lines: [
        "The wearable has not sent a health decision yet. Flash the wearable and the gateway. A high pulse during a run is not an alarm. A low pulse, low blood oxygen, and the raise button are.",
      ],
    };
  }

  const lines: string[] = [];
  const pulseAndOxygen = health.spo2Low && (health.hrHigh || health.hrLow);
  const sounding = healthNeedsReview(health) && !health.silenced;

  if (health.manual && !health.silenced) {
    lines.push("The wearer pressed the raise button. This is a raised alarm, not an automatic reading.");
  }
  if (health.gasHigh && !health.silenced) {
    lines.push(
      "The MQ-6 gas count has stayed at or above 1800. The buzzer is on. This is a relative level, not a percent of the explosive limit.",
    );
  }
  if (pulseAndOxygen && !health.silenced) {
    lines.push(
      `Blood oxygen is low and the pulse is outside the expected range while the wearer is ${motionPhrase(activityLabel)}. This is the most urgent health alarm.`,
    );
  } else if (health.spo2Critical && !health.silenced) {
    lines.push("Blood oxygen is critically low. The buzzer is on.");
  } else if (health.spo2Low && !health.silenced) {
    lines.push("Blood oxygen has stayed low. The buzzer is on.");
  }
  if (health.hrLow && !health.silenced && !pulseAndOxygen) {
    lines.push("Heart rate has stayed low. The buzzer is on. Cover the glass again if the finger slipped.");
  }
  if (health.hrHigh && !health.silenced && !pulseAndOxygen) {
    lines.push(
      `Heart rate has stayed high while the wearer is ${motionPhrase(activityLabel)}. The wrist is not in a run, so this is not treated as exertion.`,
    );
  }
  if (health.silenced && healthNeedsReview(health)) {
    lines.push("The wearer pressed cancel. The buzzer is quiet, and this concern stays on the board until the reading recovers or the raised alarm is cleared.");
  }
  if (health.exertion) {
    lines.push("Heart rate is up, and the wrist motion is a run. That matches exertion, so the high-pulse alarm stays off.");
  }
  if (health.suspectPulse) {
    lines.push("The pulse jumped like a doubled or halved beat while the wrist was still. That reading is not alarmed until it settles.");
  }
  if (lines.length === 0) {
    lines.push(
      "No health alarm is latched. A high pulse alarms only after it stays high while the wearer is not running. A low pulse and low blood oxygen alarm on their own.",
    );
  }

  return { tone: sounding ? "alert" : health.silenced || health.suspectPulse ? "warn" : "ok", lines };
}

export function healthBadge(health: HealthReport | null | undefined): string | null {
  if (!health?.reported || !healthNeedsReview(health)) {
    if (health?.suspectPulse) return "Check pulse";
    if (health?.exertion) return "Running";
    return null;
  }
  if (health.manual && !health.silenced) return "Raised";
  if (health.gasHigh && !health.silenced) return "Gas";
  if (health.gasHigh) return "Gas silenced";
  if ((health.spo2Critical || (health.spo2Low && (health.hrHigh || health.hrLow))) && !health.silenced) return "Critical";
  if (health.spo2Low || health.spo2Critical) return health.silenced ? "Oxygen silenced" : "Low oxygen";
  if (health.hrLow) return health.silenced ? "Low pulse silenced" : "Low pulse";
  if (health.hrHigh) return health.silenced ? "High pulse silenced" : "High pulse";
  if (health.manual) return "Raised, silenced";
  return "Health";
}
