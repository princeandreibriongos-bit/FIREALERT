import { PageHeader } from "./ui";

const LIMITS = [
  {
    title: "Not protective equipment",
    body: "This board does not replace SCBA, radio, dispatch, or a certified gas instrument. Readings are cues for a person.",
  },
  {
    title: "No indoor positioning",
    body: "GPS is reported only with a satellite fix. A last-known point is labeled and is not the wearer’s current position.",
  },
  {
    title: "One radio hop",
    body: "ESP-NOW is one wearable-to-gateway hop, not an automatic mesh. The cellular modem is not installed. Wi-Fi is the stand-in uplink.",
  },
  {
    title: "Fall cue is a review, not a confirmation",
    body: "The wrist score is WEDA-FALL magnitudes over the last 3 seconds. At 72% or higher the board opens a 10-second cancel window. Ordinary movement can still raise it. The impact check and the serial command fall can open that window too.",
  },
  {
    title: "Motion class is idle, walk, or run",
    body: "The MPU-6050 is worn on the left wrist. The same 3-second window is labeled Idle, Walk, or Run from acceleration magnitude, so a left wrist and a right wrist share the score. Standing, sitting, or lying is Idle. Walking is Walk. Jogging or running is Run.",
  },
  {
    title: "Not clinically measured",
    body: "Heart rate and estimated SpO₂ are not clinical measurements. Device temperature is air at the sensor, not core body temperature.",
  },
  {
    title: "Pulse alarms check the wrist first",
    body: "A high pulse during a run does not sound. The alarm waits until that high pulse stays up while the wearer is still or walking. A low pulse and low blood oxygen alarm on their own. GPIO 4 cancels a false alarm. GPIO 40 raises one. The buzzer is GPIO 5.",
  },
  {
    title: "MQ-6 gas alarm is a relative count",
    body: "The buzzer sounds when the MQ-6 count stays at or above 1800 for about 5 seconds. GPIO 4 silences it until the count falls. The number is not a percent of the explosive limit, and the heater needs about 10 to 15 minutes after power-up. The BME688 gas resistance is not this alarm.",
  },
  {
    title: "Evaluation still open",
    body: "ISO/IEC 25010 evaluation with station users has not been run. No scores are shown.",
  },
];

export function SystemPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Prototype"
        title="System"
        description="What this board is for, and the limits to keep in mind before treating any reading as operational."
      />
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Scope</h2>
        <p className="card-note">
          FIREALERT is a wearable and incident board for the New Makati Central Fire Station prototype. It supplements radio and dispatch. It does not make tactical or medical decisions.
        </p>
      </section>
      <div className="limit-grid">
        {LIMITS.map((item) => (
          <article key={item.title} className="card limit-card">
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
