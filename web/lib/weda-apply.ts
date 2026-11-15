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

function scoreWindow(points: readonly WedaPoint[]): number | null {
  const window: WedaPoint[] = [];
  for (const point of points) {
    if (window.length >= WEDA_WINDOW) break;
    if (window.length > 0 && window[window.length - 1].at - point.at > 1500) break;
    window.push(point);
  }
  if (window.length < WEDA_WINDOW) return null;
  const span = window[0].at - window[window.length - 1].at;
  if (span < 0 || span > WEDA_SPAN_MS) return null;
  return wedaFallScore([...window].reverse().map((point) => point.sample));
}

/** Same rule on the dashboard and in the unit test. Device grace, distress, and possible stay as sent. */
export function applyWedaView(view: WedaView): WedaView {
  if (view.simulated) return view;
  if (view.fallState === "cancelled") return { ...view, armedAt: null };
  const held = view.fallState === "grace" || view.fallState === "distress" || view.fallState === "possible";
  const score = scoreWindow(view.newestFirst);
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
  if (held || score == null) return { ...view, armedAt };
  const activityLabel = !view.activityLabel || view.activityLabel === "waiting" ? "clear" : view.activityLabel;
  return { ...view, model: "weda-fall", activityLabel, activityScore: score, armedAt };
}
