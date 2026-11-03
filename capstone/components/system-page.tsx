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
    title: "Fall model is empty",
    body: "Fall detection is a grace-period state machine. The TinyML slot is empty, so motion alone will not raise a cue.",
  },
  {
    title: "Not clinically measured",
    body: "Heart rate and estimated SpO₂ are not clinical measurements. Device temperature is air at the sensor, not core body temperature.",
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
