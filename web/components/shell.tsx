"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { gatewayPhase, wearablePhase } from "@/lib/connection";
import { manilaClock, manilaDay } from "@/lib/format";
import { STATION } from "@/lib/station";
import { useBoard } from "./board-provider";
import { BrandMark, Icon } from "./icons";

const NAV = [
  { href: "/", label: "Overview", icon: "overview" as const },
  { href: "/sensors", label: "Sensors", icon: "sensors" as const },
  { href: "/crew", label: "Crew", icon: "crew" as const },
  { href: "/incidents", label: "Incidents", icon: "incidents" as const },
  { href: "/log", label: "Packet log", icon: "log" as const },
  { href: "/gateway", label: "Gateway", icon: "gateway" as const },
  { href: "/system", label: "System", icon: "system" as const },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { alerts, incidents, crew, gateway, error, now } = useBoard();
  const [menuOpen, setMenuOpen] = useState(false);
  const [clockReady, setClockReady] = useState(false);
  const openIncidents = incidents.filter((incident) => incident.status === "open").length;

  useEffect(() => {
    setClockReady(true);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const gatewayState = error ? "offline" : gatewayPhase(gateway, now);
  const wearableState = error ? "offline" : wearablePhase(crew, now);
  const gatewayLabel =
    gatewayState === "up" ? "Gateway connected" : gatewayState === "down" ? "Gateway Wi-Fi down" : gatewayState === "offline" ? "Board offline" : "Gateway waiting";
  const wearableLabel =
    wearableState === "live" ? "Wearable connected" : wearableState === "stale" ? "Wearable stale" : wearableState === "offline" ? "Board offline" : "Wearable waiting";

  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      {menuOpen ? (
        <button type="button" className="scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      ) : null}

      <aside className={`sidebar${menuOpen ? " is-open" : ""}`}>
        <Link href="/" className="brand">
          <BrandMark />
          <span>
            <span className="brand-name">FIREALERT</span>
            <span className="brand-sub">Command board</span>
          </span>
        </Link>

        <nav className="side-nav" aria-label="Board">
          {NAV.map((item) => {
            const current = isCurrent(pathname, item.href);
            const count = item.href === "/crew" ? alerts.length : item.href === "/incidents" ? openIncidents : 0;
            return (
              <Link key={item.href} href={item.href} className="nav-link" aria-current={current ? "page" : undefined}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {count > 0 ? <span className={`nav-count${item.href === "/crew" ? " is-alert" : ""}`}>{count}</span> : null}
              </Link>
            );
          })}
        </nav>

        <p className="side-foot">Supplements radio and dispatch. It does not replace trained judgment.</p>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button type="button" className="menu-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="topbar-station">
            <p className="eyebrow">{STATION.name}</p>
            <p className="topbar-address">{STATION.address}</p>
          </div>
          <div className="topbar-meta">
            <div className="link-pills" aria-live="polite">
              <p className={`status-pill is-${gatewayState === "up" ? "live" : gatewayState === "down" || gatewayState === "offline" ? "offline" : "wait"}`}>
                <span className="status-dot" />
                <span className="status-label">{gatewayLabel}</span>
              </p>
              <p className={`status-pill is-${wearableState === "live" ? "live" : wearableState === "stale" ? "wait" : wearableState === "offline" ? "offline" : "wait"}`}>
                <span className="status-dot" />
                <span className="status-label">{wearableLabel}</span>
              </p>
            </div>
            <div className="clock">
              <time dateTime={clockReady ? new Date(now).toISOString() : undefined}>{clockReady ? manilaClock(now) : "--:--:--"}</time>
              <span className="clock-date">{clockReady ? `${manilaDay(now)} PHT` : "PHT"}</span>
            </div>
          </div>
        </header>
        <main className="workspace-main" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
