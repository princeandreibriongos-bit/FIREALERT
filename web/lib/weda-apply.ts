import { activityScore } from "./activity-model.ts";
import { WEDA_THRESHOLD, WEDA_WINDOW, wedaFallScore, type WristSample } from "./weda-fall.ts";

export const WEDA_GRACE_MS = 10_000;
export const WEDA_SPAN_MS = 4_000;

export type WedaPoint = { at: number; sample: WristSample };

export type WedaFallState = "idle" | "possible" | "grace" | "distress" | "cancelled";

export type WedaView = {
  simulated: boolean;
  fallState: WedaFallState;
  model: string;
  graceRemainingMs: number;
  activityLabel: string;
  activityScore: number | null;
  capture: string | null;
  armedAt: number | null;
  now: number;
  /** Newest sample first, including the packet just received. */
  newestFirst: readonly WedaPoint[];
};

/** A board on the table: about 1 g, almost no swing, gyro only a few degrees per second. */
export function recentRest(points: readonly WedaPoint[]): boolean {
  const recent: WedaPoint[] = [];
  for (const point of points) {
    if (recent.length >= 10) break;
    if (recent.length > 0 && recent[recent.length - 1].at - point.at > 2000) break;
    recent.push(point);
  }
  if (recent.length < 4) return false;
  const accel = recent.map((point) => Math.hypot(point.sample.ax, point.sample.ay, point.sample.az));
  const gyro = recent.map((point) => Math.hypot(point.sample.gx, point.sample.gy, point.sample.gz));
  const avg = accel.reduce((sum, value) => sum + value, 0) / accel.length;
  const spread = Math.max(...accel) - Math.min(...accel);
  const turn = gyro.reduce((sum, value) => sum + value, 0) / gyro.length;
  return avg > 0.85 && avg < 1.2 && spread < 0.12 && turn < 15;
}

/** A wide swing. The run recordings barely move the gyro, so a live MPU-6050 needs this check. */
export function recentVigorous(points: readonly WedaPoint[]): boolean {
  const recent: WedaPoint[] = [];
  for (const point of points) {
    if (recent.length >= 8) break;
    if (recent.length > 0 && recent[recent.length - 1].at - point.at > 2500) break;
    recent.push(point);
  }
  if (recent.length === 0) return false;
  const accel = recent.map((point) => Math.hypot(point.sample.ax, point.sample.ay, point.sample.az));
  const gyro = recent.map((point) => Math.hypot(point.sample.gx, point.sample.gy, point.sample.gz));
  const spread = Math.max(...accel) - Math.min(...accel);
  return Math.max(...gyro) >= 80 || spread >= 1.4;
}

function takeWindow(points: readonly WedaPoint[]): WristSample[] | null {
  const window: WedaPoint[] = [];
  for (const point of points) {
    if (window.length >= WEDA_WINDOW) break;
    if (window.length > 0 && window[window.length - 1].at - point.at > 1500) break;
    window.push(point);
  }
  if (window.length < WEDA_WINDOW) return null;
  const span = window[0].at - window[window.length - 1].at;
  if (span < 0 || span > WEDA_SPAN_MS) return null;
  return [...window].reverse().map((point) => point.sample);
}

/** Same rule on the dashboard and in the unit test. Device grace, distress, and possible stay as sent. */
export function applyWedaView(view: WedaView): WedaView {
  if (view.simulated) return view;
  if (view.fallState === "cancelled") return { ...view, armedAt: null };
  const held = view.fallState === "grace" || view.fallState === "distress" || view.fallState === "possible";
  const samples = takeWindow(view.newestFirst);
  const score = samples ? wedaFallScore(samples) : null;
  const motion = samples ? activityScore(samples) : null;
  let armedAt = view.armedAt;
  if (!held && score != null && score >= WEDA_THRESHOLD) armedAt = view.now;
  if (!held && armedAt != null && view.now >= armedAt && view.now - armedAt <= WEDA_GRACE_MS) {
    return {
      ...view,
      fallState: "grace",
      model: "weda-fall",
      graceRemainingMs: WEDA_GRACE_MS - (view.now - armedAt),
      activityLabel: "fall",
      activityScore: score ?? view.activityScore,
      armedAt,
    };
  }
  if (armedAt != null && (held || view.now - armedAt > WEDA_GRACE_MS)) armedAt = null;
  if (recentVigorous(view.newestFirst)) {
    return { ...view, activityLabel: "run", activityScore: 0.9, armedAt };
  }
  if (recentRest(view.newestFirst)) {
    return { ...view, model: held ? view.model : "weda-fall", activityLabel: "idle", activityScore: 0.95, armedAt: held ? armedAt : null };
  }
  if (held || score == null) return { ...view, armedAt };
  const activityLabel = motion?.label && motion.label !== "clear" ? motion.label : "clear";
  return { ...view, model: "weda-fall", activityLabel, activityScore: motion?.score ?? score, armedAt };
}
