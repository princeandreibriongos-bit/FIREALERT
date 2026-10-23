import { co2Cue, fallNeedsReview, type NormalizedTelemetry } from "@/lib/telemetry-core";
import { ageLabel, fmt, manilaTime, uiLabel, vecText } from "@/lib/format";
import { Badge, Metric, Section } from "./ui";

function hardwareBadge(installed: boolean, hasValue: boolean) {
  if (!installed) return <Badge tone="wait">Awaiting hardware</Badge>;
  if (!hasValue) return <Badge tone="caution">No reading</Badge>;
  return <Badge tone="live">Live</Badge>;
}

function signatureLabel(status: NormalizedTelemetry["signature"]["status"]) {
  switch (status) {
    case "valid":
      return "Signature valid";
    case "invalid":
      return "Signature invalid";
    case "unverified":
      return "Key not loaded";
    default:
      return "Unsigned";
  }
}

function fallCopy(packet: NormalizedTelemetry) {
  const seconds = Math.ceil(packet.fall.grace_remaining_ms / 1000);
  switch (packet.fall.state) {
    case "possible":
      return "Possible fall — review. Not a confirmed event.";
    case "grace":
      return `Possible fall — ${seconds} s left for the wearer to cancel.`;
    case "distress":
      return "Distress alert for review. Not a confirmed fall.";
    case "cancelled":
      return "Wearer cancelled the cue before distress.";
    default:
      return "No fall cue.";
  }
}

function co2Detail(packet: NormalizedTelemetry) {
  const cue = co2Cue(packet.scd40.co2_ppm, packet.scd40.installed);
  if (cue === "awaiting") return "No CO₂ sample";
  if (cue === "elevated") return "Elevated indoor-air cue";
  if (cue === "high") return "High cue — review";
  return "Routine prototype cue";
}

export function WearerDetail({
  packet,
  now,
  loading = false,
}: {
  packet: NormalizedTelemetry | null;
  now: number;
  loading?: boolean;
}) {
  const gps = packet?.gps;
  const mapHref =
    gps && gps.latitude != null && gps.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${gps.latitude}&mlon=${gps.longitude}#map=17/${gps.latitude}/${gps.longitude}`
      : null;

  return (
    <div className="stack">
      {!packet ? (
        <p className="empty">
          {loading
            ? "Loading the latest packet…"
            : "No wearable is linked. The board already reserves physiology, air, motion, location, and fall slots. Readings stay blank until that hardware is installed."}
        </p>
      ) : (
        <div className="identity">
          <div>
            <p className="kicker">Wearable</p>
            <h2 className="identity-name">{packet.wearer_id}</h2>
            <p className="note">
              {packet.source_mac ?? "No MAC"} · {manilaTime(packet.received_at)} PHT · {ageLabel(packet.received_at, now)}
            </p>
          </div>
          <div className="badge-row">
            {packet.simulated ? <Badge tone="sim">Simulated</Badge> : null}
            <Badge tone={packet.uplink === "cellular" ? "live" : "wait"}>
              {packet.uplink === "cellular" ? "Cellular uplink" : "Wi-Fi stand-in"}
            </Badge>
            <Badge tone={packet.signature.status === "valid" ? "live" : packet.signature.status === "invalid" ? "alert" : "wait"}>
              {signatureLabel(packet.signature.status)}
            </Badge>
          </div>
        </div>
      )}

      {packet?.simulated ? (
        <p className="note">Simulated packet for layout review. It is not a live wearable.</p>
      ) : null}

      <Section
        id="link"
        title="Link and power"
        badge={packet ? <Badge tone={packet.cellular_ready ? "live" : "wait"}>{packet.cellular_ready ? "Modem ready" : "Modem not installed"}</Badge> : undefined}
        note="ECDSA checks authenticity and integrity when a wearable key is loaded. It does not encrypt telemetry. This prototype has no login."
      >
        <div className="metrics">
          <Metric label="Gateway" value={packet?.gateway ?? "—"} detail={packet ? `RSSI ${fmt(packet.rssi_dbm, 0, " dBm")}` : "Waiting for ESP-NOW"} />
          <Metric
            label="Battery"
            value={packet?.battery.installed ? fmt(packet.battery.percent, 0, "%") : "—"}
            detail={packet?.battery.installed ? "Gauge reading" : "2000 mAh LiPo planned · gauge not installed"}
          />
          <Metric label="Touchscreen" value={packet ? uiLabel(packet.local_ui.touchscreen) : "Not installed"} />
          <Metric label="Buzzer" value={packet ? uiLabel(packet.local_ui.buzzer) : "Not installed"} />
        </div>
      </Section>

      <Section
        id="physiology"
        title="Physiology"
        badge={hardwareBadge(Boolean(packet?.max30102.installed), packet?.max30102.heart_rate_bpm != null)}
        note="MAX30102 heart rate and estimated SpO₂. Not clinical measurements, and not a core-temperature estimate."
      >
        <div className="metrics">
          <Metric label="Heart rate" value={fmt(packet?.max30102.heart_rate_bpm, 0, " bpm")} />
          <Metric label="Estimated SpO₂" value={fmt(packet?.max30102.spo2_percent, 0, "%")} />
        </div>
      </Section>

      <Section
        id="environment"
        title="Environment"
        badge={
          packet?.scd40.installed && packet.bme688.installed ? (
            <Badge tone="live">Live</Badge>
          ) : packet?.scd40.installed ? (
            <Badge tone="live">SCD40 live</Badge>
          ) : packet?.bme688.installed ? (
            <Badge tone="live">BME688 live</Badge>
          ) : (
            <Badge tone="wait">Awaiting hardware</Badge>
          )
        }
        note="CO₂ comes from the SCD40 only. BME688 temperature is air at the device, not core body temperature, and that sensor does not measure CO₂. Cues are not certified gas alarms."
      >
        <div className="metrics">
          <Metric label="CO₂" value={fmt(packet?.scd40.co2_ppm, 0, " ppm")} detail={packet ? co2Detail(packet) : "Awaiting SCD40"} />
          <Metric label="SCD40 temperature" value={fmt(packet?.scd40.temperature_c, 1, " °C")} />
          <Metric label="SCD40 humidity" value={fmt(packet?.scd40.humidity_rh, 0, "%")} />
          <Metric
            label="Device temperature"
            value={fmt(packet?.bme688.temperature_c, 1, " °C")}
            detail={packet?.bme688.installed ? "Air at the device" : "BME688 · awaiting hardware"}
          />
          <Metric label="BME688 humidity" value={fmt(packet?.bme688.humidity_rh, 0, "%")} />
          <Metric label="Pressure" value={fmt(packet?.bme688.pressure_hpa, 0, " hPa")} />
          <Metric label="Gas resistance" value={fmt(packet?.bme688.gas_resistance_ohm, 0, " Ω")} detail="Not a CO reading" />
        </div>
      </Section>

      <Section
        id="motion"
        title="Motion and fall"
        alert={Boolean(packet && fallNeedsReview(packet.fall.state))}
        badge={hardwareBadge(Boolean(packet?.mpu6050.installed), packet?.mpu6050.accel_g != null)}
        note="MPU-6050 acceleration and gyro feed the on-device model. A cue is a possible event for a person to review. The Edge Impulse model is not deployed yet. Send the serial command fall on the wearable to exercise the cancel window."
      >
        <p className={packet && fallNeedsReview(packet.fall.state) ? "fall-copy alert-text" : "fall-copy"}>
          {packet ? fallCopy(packet) : "No fall cue."}
        </p>
        <p className="note">Model slot: {packet?.fall.model ?? "edge-impulse-placeholder"}</p>
        <div className="metrics">
          <Metric label="Accel g  x y z" value={vecText(packet?.mpu6050.accel_g ?? null)} />
          <Metric label="Gyro dps  x y z" value={vecText(packet?.mpu6050.gyro_dps ?? null)} />
        </div>
      </Section>

      <Section
        id="location"
        title="Location"
        badge={
          gps?.state === "fix" ? (
            <Badge tone="live">Satellite fix</Badge>
          ) : gps?.state === "last_known" ? (
            <Badge tone="caution">Last known</Badge>
          ) : (
            <Badge tone="wait">No fix</Badge>
          )
        }
        note="The GPS module is not installed. Indoor and underground spaces are outside what this wearable can locate. A last-known point is not the wearer’s current position."
      >
        <div className="metrics">
          <Metric label="Latitude" value={fmt(gps?.latitude, 5)} />
          <Metric label="Longitude" value={fmt(gps?.longitude, 5)} />
          <Metric label="Altitude" value={fmt(gps?.altitude_m, 0, " m")} />
          <Metric label="Satellites" value={gps?.satellites == null ? "—" : String(gps.satellites)} />
        </div>
        {gps?.state === "last_known" ? (
          <p className="warn">Last known coordinates. Do not treat this as where the wearer is now.</p>
        ) : null}
        {mapHref ? (
          <a className="text-link" href={mapHref} target="_blank" rel="noreferrer">
            Open this point in OpenStreetMap
          </a>
        ) : null}
      </Section>
    </div>
  );
}
