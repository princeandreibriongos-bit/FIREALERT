import type { ReactNode } from "react";

export function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const empty = value === "—";
  return (
    <article className="metric">
      <p className="kicker">{label}</p>
      <p className={`reading ${empty ? "empty" : ""}`}>{value}</p>
      {detail ? <p className="detail">{detail}</p> : null}
    </article>
  );
}

export function Section({
  id,
  title,
  badge,
  note,
  children,
  alert = false,
}: {
  id: string;
  title: string;
  badge?: ReactNode;
  note?: string;
  children: ReactNode;
  alert?: boolean;
}) {
  return (
    <section className={`panel ${alert ? "alert" : ""}`} aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>{title}</h2>
        {badge}
      </div>
      {note ? <p className="note">{note}</p> : null}
      {children}
    </section>
  );
}

export function Badge({ tone, children }: { tone: "live" | "wait" | "alert" | "caution" | "sim"; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
