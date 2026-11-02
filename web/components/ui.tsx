import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "ok" | "warn" | "alert";
}) {
  const empty = value === "—";
  return (
    <article className={`metric${tone && !empty ? ` tone-${tone}` : ""}`}>
      <p className="metric-label">{label}</p>
      <p className={`metric-value${empty ? " is-empty" : ""}`}>{value}</p>
      {detail ? <p className="metric-detail">{detail}</p> : null}
    </article>
  );
}

export function SensorStatus({
  scd40,
  bme688,
  mpu6050 = false,
  mq6 = false,
}: {
  scd40: boolean;
  bme688: boolean;
  mpu6050?: boolean;
  mq6?: boolean;
}) {
  return (
    <div className="sensor-row" aria-label="Sensor status">
      <span className={`sensor-pill${scd40 ? " is-on" : ""}`}>
        <i aria-hidden />
        SCD40 {scd40 ? "detected" : "not detected"}
      </span>
      <span className={`sensor-pill${bme688 ? " is-on" : ""}`}>
        <i aria-hidden />
        BME688 {bme688 ? "detected" : "not detected"}
      </span>
      <span className={`sensor-pill${mpu6050 ? " is-on" : ""}`}>
        <i aria-hidden />
        MPU-6050 {mpu6050 ? "detected" : "not detected"}
      </span>
      <span className={`sensor-pill${mq6 ? " is-on" : ""}`}>
        <i aria-hidden />
        MQ-6 {mq6 ? "detected" : "not detected"}
      </span>
    </div>
  );
}

export function Badge({
  tone,
  children,
  pulse = false,
}: {
  tone: "live" | "wait" | "alert" | "caution" | "sim" | "brand";
  children: ReactNode;
  pulse?: boolean;
}) {
  return <span className={`badge tone-${tone}${pulse ? " is-pulse" : ""}`}>{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}
