"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { newestHardware } from "@/lib/connection";
import { ageLabel, fmt, vecMagnitude, vecText } from "@/lib/format";
import { co2Cue, type NormalizedTelemetry } from "@/lib/telemetry-core";
import { useBoard } from "./board-provider";
import { Badge, EmptyState, Metric, PageHeader } from "./ui";

const SENSORS = [
  { id: "scd40", label: "SCD40" },
  { id: "bme688", label: "BME688" },
  { id: "mpu6050", label: "MPU-6050" },
  { id: "mq6", label: "MQ-6" },
] as const;

type SensorId = (typeof SENSORS)[number]["id"];

function isSensor(value: string | null): value is SensorId {
  return SENSORS.some((sensor) => sensor.id === value);
}

function co2Note(packet: NormalizedTelemetry) {
  const cue = co2Cue(packet.scd40.co2_ppm, packet.scd40.installed);
  if (cue === "awaiting") return "No CO₂ sample in this packet.";
  if (cue === "elevated") return "Elevated indoor-air cue, from 1,000 ppm.";
  if (cue === "high") return "High cue, from 5,000 ppm. Review it.";
  return "Routine cue, under 1,000 ppm.";
}

function gravityNote(total: number | null) {
  if (total == null) return "No acceleration sample.";
  if (total >= 0.8 && total <= 1.2) return "About 1 g total. The sensor is still, and one axis is carrying gravity.";
  return "Total acceleration is away from 1 g. The sensor is moving or tilted.";
}

function mq6Note(raw: number | null) {
  if (raw == null) return "No analog sample.";
  if (raw >= 4000) return "At the top of the 0–4095 scale. This count is relative, not a gas percentage.";
  return "Relative heater reading on a 0–4095 scale. It is not percent LEL.";
}

function Readings({ packet, sensor }: { packet: NormalizedTelemetry; sensor: SensorId }) {
  if (sensor === "scd40") {
    const cue = co2Cue(packet.scd40.co2_ppm, packet.scd40.installed);
    const tone = cue === "high" ? "alert" : cue === "elevated" ? "warn" : packet.scd40.installed ? "ok" : undefined;
    return (
      <div className="metrics">
        <Metric label="CO₂" value={fmt(packet.scd40.co2_ppm, 0, " ppm")} detail={co2Note(packet)} tone={tone} />
        <Metric label="Sensor temperature" value={fmt(packet.scd40.temperature_c, 1, " °C")} detail="Temperature on the SCD40 itself." />
        <Metric label="Sensor humidity" value={fmt(packet.scd40.humidity_rh, 1, "% RH")} detail="Humidity on the SCD40 itself." />
        <Metric label="Detected" value={packet.scd40.installed ? "Yes" : "No"} detail="A sample in this packet counts as detected." />
      </div>
    );
  }

  if (sensor === "bme688") {
    return (
      <div className="metrics">
        <Metric label="Air temperature" value={fmt(packet.bme688.temperature_c, 1, " °C")} detail="Room air temperature from the BME688." />
        <Metric label="Humidity" value={fmt(packet.bme688.humidity_rh, 1, "% RH")} detail="Relative humidity." />
        <Metric label="Pressure" value={fmt(packet.bme688.pressure_hpa, 0, " hPa")} detail="Barometric pressure." />
        <Metric
          label="Gas resistance"
          value={fmt(packet.bme688.gas_resistance_ohm, 0, " Ω")}
          detail="Rises while the heater settles. Not a certified gas alarm."
        />
        <Metric label="Detected" value={packet.bme688.installed ? "Yes" : "No"} detail="A sample in this packet counts as detected." />
      </div>
    );
  }

  if (sensor === "mpu6050") {
    const total = vecMagnitude(packet.mpu6050.accel_g);
    const spin = vecMagnitude(packet.mpu6050.gyro_dps);
    return (
      <div className="metrics">
        <Metric label="Total acceleration" value={fmt(total, 2, " g")} detail={gravityNote(total)} tone={packet.mpu6050.installed ? "ok" : undefined} />
        <Metric label="Accel x y z" value={vecText(packet.mpu6050.accel_g)} detail="g on each axis. About 1 g on the axis that points up when the sensor is still." />
        <Metric label="Total rotation" value={fmt(spin, 1, " dps")} detail="Combined gyro rate. Near 0 when the sensor is still." />
        <Metric label="Gyro x y z" value={vecText(packet.mpu6050.gyro_dps, 1)} detail="Degrees per second on each axis." />
        <Metric label="Detected" value={packet.mpu6050.installed ? "Yes" : "No"} detail="A sample in this packet counts as detected." />
      </div>
    );
  }

  return (
    <div className="metrics">
      <Metric label="Raw count" value={fmt(packet.mq6.raw, 0)} detail={mq6Note(packet.mq6.raw)} tone={packet.mq6.raw != null && packet.mq6.raw >= 4000 ? "warn" : undefined} />
      <Metric label="Scale" value="0–4095" detail="Top of the scale is 4095. The number is not a gas percentage." />
      <Metric label="Detected" value={packet.mq6.installed ? "Yes" : "No"} detail="The pin is being read. A count alone does not prove a gas level." />
    </div>
  );
}

export function SensorsPage() {
  const { crew, items, error, now } = useBoard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sensorParam = searchParams.get("sensor");
  const sensor: SensorId = isSensor(sensorParam) ? sensorParam : "scd40";
  const wearerParam = searchParams.get("wearer");
  const hardware = newestHardware(crew);
  const wearerId = wearerParam && crew.some((person) => person.wearer_id === wearerParam) ? wearerParam : hardware?.wearer_id ?? crew[0]?.wearer_id ?? "";
  const packet = crew.find((person) => person.wearer_id === wearerId) ?? null;
  const loading = items === null && !error;
  const current = SENSORS.find((item) => item.id === sensor) ?? SENSORS[0];

  function choose(nextSensor: SensorId, nextWearer = wearerId) {
    const params = new URLSearchParams();
    params.set("sensor", nextSensor);
    if (nextWearer) params.set("wearer", nextWearer);
    router.replace(`/sensors?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Readings"
        title="Sensors"
        description="Pick one sensor to see every useful reading from the latest packet."
      />

      {error ? <p className="banner is-error">{error}</p> : null}

      <div className="toolbar" role="tablist" aria-label="Sensor">
        {SENSORS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === sensor ? "btn btn-primary" : "btn btn-ghost"}
            role="tab"
            aria-selected={item.id === sensor}
            onClick={() => choose(item.id)}
          >
            {item.label}
          </button>
        ))}
        {crew.length > 1 ? (
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="sensor-wearer">Wearer</label>
            <select id="sensor-wearer" value={wearerId} onChange={(event) => choose(sensor, event.target.value)}>
              {crew.map((person) => (
                <option key={person.wearer_id} value={person.wearer_id}>
                  {person.wearer_id}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {loading ? <p className="fine">Connecting to telemetry…</p> : null}

      {!loading && !packet ? (
        <EmptyState title="No wearable packet yet" body="This page fills in when a wearable packet arrives." />
      ) : null}

      {packet ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">{current.label}</h2>
              <p className="card-note">
                {packet.wearer_id} · {ageLabel(packet.received_at, now)}
                {packet.simulated ? " · simulated" : ""}
              </p>
            </div>
            <Badge tone={packet.simulated ? "caution" : "live"}>{packet.simulated ? "Simulated" : "Latest packet"}</Badge>
          </div>
          <Readings packet={packet} sensor={sensor} />
          <p className="fine" style={{ marginTop: 16 }}>
            <Link href={`/crew/${packet.wearer_id}`}>Open {packet.wearer_id}</Link>
            {" · "}
            <Link href="/log">Packet log</Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
