"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ageLabel, fmt, manilaTime, uiLabel, vecText } from "@/lib/format";
import { co2Cue, fallNeedsReview, linkState, type NormalizedTelemetry } from "@/lib/telemetry-core";
import { useBoard } from "./board-provider";
import { Badge, EmptyState, Metric } from "./ui";

const TABS = ["status", "device", "physiology", "environment", "motion", "location"] as const;
type TabId = (typeof TABS)[number];

const TAB_LABEL: Record<TabId, string> = {
  status: "Status",
  device: "Device",
  physiology: "Physiology",
  environment: "Environment",
  motion: "Motion",
  location: "Location",
};

function isTab(value: string | null): value is TabId {
  return TABS.includes(value as TabId);
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

function hardwareBadge(installed: boolean, hasValue: boolean) {
  if (!installed) return <Badge tone="wait">Awaiting hardware</Badge>;
  if (!hasValue) return <Badge tone="caution">No reading</Badge>;
  return (
    <Badge tone="live" pulse>
      Live
    </Badge>
  );
}

export function WearerDetail({ wearerId }: { wearerId: string }) {
  const { crew, items, error, now } = useBoard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(isTab(param) ? param : "status");

  useEffect(() => {
    if (isTab(param)) setTab(param);
  }, [param]);

  const packet = crew.find((person) => person.wearer_id === wearerId) ?? null;
  const loading = items === null && !error;

  function selectTab(next: TabId) {
    setTab(next);
    const path = `/crew/${encodeURIComponent(wearerId)}`;
    router.replace(next === "status" ? path : `${path}?tab=${next}`, { scroll: false });
  }

  if (!packet) {
    return (
      <div className="page">
        <Link className="back-link" href="/crew">
          ← Crew
        </Link>
        <EmptyState
          title={loading ? "Loading wearer…" : "Wearable not linked"}
          body={loading ? "Waiting for the latest packet." : `${wearerId} has no packet on this board.`}
          action={
            <Link className="btn btn-ghost" href="/crew">
              Back to roster
            </Link>
          }
        />
      </div>
    );
  }

  const link = linkState(packet.received_at, now);
  const gps = packet.gps;
  const cue = co2Cue(packet.scd40.co2_ppm, packet.scd40.installed);
  const mapHref =
    gps.latitude != null && gps.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${gps.latitude}&mlon=${gps.longitude}#map=17/${gps.latitude}/${gps.longitude}`
      : null;
  const reviewing = fallNeedsReview(packet.fall.state);

  return (
    <div className="page">
      <Link className="back-link" href="/crew">
        ← Crew
      </Link>
      <section className="card">
        <div className="identity">
          <div>
            <p className="eyebrow">Wearable</p>
            <h1 className="identity-name">{packet.wearer_id}</h1>
            <p className="fine">
              {packet.source_mac ?? "No MAC"} · {manilaTime(packet.received_at)} PHT · {ageLabel(packet.received_at, now)}
            </p>
          </div>
          <div className="badge-row">
            {packet.simulated ? <Badge tone="sim">Simulated</Badge> : null}
            <Badge tone={link === "live" ? "live" : "caution"} pulse={link === "live"}>
              {link === "live" ? "Live link" : "Stale link"}
            </Badge>
            <Badge tone={packet.signature.status === "valid" ? "live" : packet.signature.status === "invalid" ? "alert" : "wait"}>
              {signatureLabel(packet.signature.status)}
            </Badge>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Wearer sections">
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => selectTab(id)}>
              {TAB_LABEL[id]}
            </button>
          ))}
        </div>

        {tab === "status" ? (
          <div role="tabpanel" className="stack">
            <div className={`callout ${reviewing ? "is-alert" : packet.fall.state === "cancelled" ? "is-warn" : "is-ok"}`}>
              <p>{fallCopy(packet)}</p>
              <p className="fine">Open Motion for acceleration and the model slot.</p>
            </div>
            <div className="metrics">
              <Metric
                label="CO₂"
                value={fmt(packet.scd40.co2_ppm, 0, " ppm")}
                detail={co2Detail(packet)}
                tone={cue === "high" ? "alert" : cue === "elevated" ? "warn" : cue === "routine" ? "ok" : undefined}
              />
              <Metric label="Heart rate" value={fmt(packet.max30102.heart_rate_bpm, 0, " bpm")} />
              <Metric label="Estimated SpO₂" value={fmt(packet.max30102.spo2_percent, 0, "%")} />
              <Metric label="Signal" value={fmt(packet.rssi_dbm, 0, " dBm")} detail={packet.gateway || "Gateway"} />
            </div>
          </div>
        ) : null}

        {tab === "device" ? (
          <div role="tabpanel">
            <p className="fine">
              ECDSA checks authenticity and integrity when a wearable key is loaded. It does not encrypt telemetry. This prototype has no login.
            </p>
            <div className="metrics">
              <Metric label="Gateway" value={packet.gateway || "—"} detail={`RSSI ${fmt(packet.rssi_dbm, 0, " dBm")}`} />
              <Metric label="Uplink" value={packet.uplink === "cellular" ? "Cellular" : "Wi-Fi stand-in"} detail={packet.cellular_ready ? "Modem ready" : "Modem not installed"} />
              <Metric
                label="Battery"
                value={packet.battery.installed ? fmt(packet.battery.percent, 0, "%") : "—"}
                detail={packet.battery.installed ? "Gauge reading" : "2000 mAh LiPo planned · gauge not installed"}
              />
              <Metric label="Sequence" value={packet.sequence == null ? "—" : String(packet.sequence)} />
              <Metric label="Touchscreen" value={uiLabel(packet.local_ui.touchscreen)} />
              <Metric label="Buzzer" value={uiLabel(packet.local_ui.buzzer)} />
            </div>
          </div>
        ) : null}

        {tab === "physiology" ? (
          <div role="tabpanel">
            <div className="card-head">
              <p className="fine" style={{ margin: 0 }}>
                MAX30102 heart rate and estimated SpO₂. Not a clinical measurement, and not core temperature.
              </p>
              {hardwareBadge(packet.max30102.installed, packet.max30102.heart_rate_bpm != null)}
            </div>
            <div className="metrics">
              <Metric label="Heart rate" value={fmt(packet.max30102.heart_rate_bpm, 0, " bpm")} />
              <Metric label="Estimated SpO₂" value={fmt(packet.max30102.spo2_percent, 0, "%")} />
            </div>
          </div>
        ) : null}

        {tab === "environment" ? (
          <div role="tabpanel">
            <p className="fine">
              CO₂ comes from the SCD40 only. BME688 temperature is air at the device, not core body temperature, and that sensor does not measure CO₂. Cues are not certified gas alarms.
            </p>
            <div className="metrics">
              <Metric
                label="CO₂"
                value={fmt(packet.scd40.co2_ppm, 0, " ppm")}
                detail={co2Detail(packet)}
                tone={cue === "high" ? "alert" : cue === "elevated" ? "warn" : cue === "routine" ? "ok" : undefined}
              />
              <Metric label="SCD40 temperature" value={fmt(packet.scd40.temperature_c, 1, " °C")} />
              <Metric label="SCD40 humidity" value={fmt(packet.scd40.humidity_rh, 0, "%")} />
              <Metric
                label="Device temperature"
                value={fmt(packet.bme688.temperature_c, 1, " °C")}
                detail={packet.bme688.installed ? "Air at the device" : "BME688 · awaiting hardware"}
              />
              <Metric label="BME688 humidity" value={fmt(packet.bme688.humidity_rh, 0, "%")} />
              <Metric label="Pressure" value={fmt(packet.bme688.pressure_hpa, 0, " hPa")} />
              <Metric label="Gas resistance" value={fmt(packet.bme688.gas_resistance_ohm, 0, " Ω")} detail="Not a CO reading" />
            </div>
          </div>
        ) : null}

        {tab === "motion" ? (
          <div role="tabpanel">
            <div className="card-head">
              <div className={`callout ${reviewing ? "is-alert" : "is-ok"}`} style={{ flex: 1 }}>
                <p>{fallCopy(packet)}</p>
                <p className="fine">Model slot: {packet.fall.model}. A cue is for a person to review. The Edge Impulse model is not deployed.</p>
              </div>
              {hardwareBadge(packet.mpu6050.installed, packet.mpu6050.accel_g != null)}
            </div>
            <div className="metrics">
              <Metric label="Accel g  x y z" value={vecText(packet.mpu6050.accel_g)} />
              <Metric label="Gyro dps  x y z" value={vecText(packet.mpu6050.gyro_dps)} />
            </div>
          </div>
        ) : null}

        {tab === "location" ? (
          <div role="tabpanel">
            <div className="card-head">
              <p className="fine" style={{ margin: 0 }}>
                Indoor and underground spaces are outside what this wearable can locate. A last-known point is not the current position.
              </p>
              {gps.state === "fix" ? (
                <Badge tone="live">Satellite fix</Badge>
              ) : gps.state === "last_known" ? (
                <Badge tone="caution">Last known</Badge>
              ) : (
                <Badge tone="wait">No fix</Badge>
              )}
            </div>
            <div className="metrics">
              <Metric label="Latitude" value={fmt(gps.latitude, 5)} />
              <Metric label="Longitude" value={fmt(gps.longitude, 5)} />
              <Metric label="Altitude" value={fmt(gps.altitude_m, 0, " m")} />
              <Metric label="Satellites" value={gps.satellites == null ? "—" : String(gps.satellites)} />
            </div>
            {gps.state === "last_known" ? <p className="warn-text">Last known coordinates. Do not treat this as where the wearer is now.</p> : null}
            {mapHref ? (
              <p>
                <a className="btn btn-ghost" href={mapHref} target="_blank" rel="noreferrer">
                  Open in OpenStreetMap
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
