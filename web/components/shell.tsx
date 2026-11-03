"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { homeForRole, roleLabel, type AccountRole } from "@/lib/auth/roles";
import { gatewayPhase, wearablePhase } from "@/lib/connection";
import { manilaClock, manilaDay } from "@/lib/format";
import { STATION } from "@/lib/station";
import { useBoard } from "./board-provider";
import { Icon } from "./icons";
import { LoginModal } from "./login-modal";
import { StationLogo } from "./station-logo";

const NAV = [
  { href: "/overview", label: "Overview", icon: "overview" as const, field: true },
  { href: "/sensors", label: "Sensors", icon: "sensors" as const, field: true },
  { href: "/crew", label: "Crew", icon: "crew" as const, field: true },
  { href: "/incidents", label: "Incidents", icon: "incidents" as const, field: false },
  { href: "/log", label: "Packet log", icon: "log" as const, field: true },
  { href: "/gateway", label: "Gateway", icon: "gateway" as const, field: true },
  { href: "/system", label: "System", icon: "system" as const, field: true },
];

const COMMEL_NAV = [
  { tab: "overview", href: "/incidents", label: "Overview", icon: "overview" as const },
  { tab: "active", href: "/incidents?tab=active", label: "Active incidents", icon: "incidents" as const },
  { tab: "closed", href: "/incidents?tab=closed", label: "Closed incidents", icon: "log" as const },
];

const RESPONDER_NAV = [
  { tab: "", href: "/overview", label: "Overview", icon: "overview" as const },
  { tab: "reported", href: "/incidents?tab=reported", label: "Reported incidents", icon: "incidents" as const },
  { tab: "responding", href: "/incidents?tab=responding", label: "Responding", icon: "crew" as const },
  { tab: "closed", href: "/incidents?tab=closed", label: "Closed incidents", icon: "log" as const },
  { tab: "", href: "/sensors", label: "Sensors", icon: "sensors" as const },
  { tab: "", href: "/crew", label: "Crew", icon: "crew" as const },
  { tab: "", href: "/log", label: "Packet log", icon: "log" as const },
  { tab: "", href: "/gateway", label: "Gateway", icon: "gateway" as const },
  { tab: "", href: "/system", label: "System", icon: "system" as const },
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { alerts, incidents, crew, gateway, error, now } = useBoard();
  const [menuOpen, setMenuOpen] = useState(false);
  const [clockReady, setClockReady] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(true);
  const reportedIncidents = incidents.filter((incident) => incident.status === "open" && !incident.acknowledged_at).length;
  const respondingIncidents = incidents.filter((incident) => incident.status === "open" && Boolean(incident.acknowledged_at)).length;
  const closedIncidents = incidents.filter((incident) => incident.status === "closed").length;
  const openIncidents = reportedIncidents + respondingIncidents;
  const detailId = pathname.startsWith("/incidents/") ? pathname.split("/")[2] : "";
  const detail = detailId ? incidents.find((incident) => incident.id === detailId) : undefined;
  const detailPhase = detail ? (detail.status === "closed" ? "closed" : detail.acknowledged_at ? "responding" : "reported") : null;
  const queryTab = searchParams.get("tab");
  const deskTab = detailPhase === "closed" ? "closed" : detailPhase === "reported" ? "active" : detailPhase === "responding" ? "active" : queryTab === "active" || queryTab === "closed" ? queryTab : "overview";
  const responderTab = detailPhase ?? (queryTab === "reported" || queryTab === "responding" || queryTab === "closed" ? queryTab : "");
  const isLanding = pathname === "/";

  useEffect(() => {
    setClockReady(true);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isLanding && searchParams.get("signin") === "1") setLoginOpen(true);
  }, [isLanding, searchParams]);

  useEffect(() => {
    if (isLanding) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const json = (await response.json()) as { ok?: boolean; username?: string; role?: AccountRole };
        if (cancelled) return;
        if (response.ok && json.ok && json.username) {
          setUsername(json.username);
          setRole(json.role === "commel" || json.role === "responder" || json.role === "admin" ? json.role : "admin");
          setAuthConfigured(true);
          return;
        }
        if (response.status === 503) setAuthConfigured(false);
        setUsername(null);
        setRole(null);
      } catch {
        if (!cancelled) setUsername(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, loginOpen, isLanding]);

  if (isLanding) {
    return <>{children}</>;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  function closeLogin() {
    setLoginOpen(false);
    if (searchParams.get("signin") === "1") {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("signin");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }
  }

  const gatewayState = error ? "offline" : gatewayPhase(gateway, now);
  const wearableState = error ? "offline" : wearablePhase(crew, now);
  const gatewayLabel =
    gatewayState === "up"
      ? "Gateway connected"
      : gatewayState === "down"
        ? "Gateway Wi-Fi down"
        : gatewayState === "stale"
          ? "Gateway last seen"
          : gatewayState === "offline"
            ? "Board offline"
            : "Gateway waiting";
  const wearableLabel =
    wearableState === "live" ? "Wearable connected" : wearableState === "stale" ? "Wearable stale" : wearableState === "offline" ? "Board offline" : "Wearable waiting";

  return (
    <div className="app-shell">
      <div className="station-backdrop" aria-hidden />
      <a className="skip" href="#main">
        Skip to content
      </a>
      {menuOpen ? (
        <button type="button" className="scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      ) : null}

      <aside className={`sidebar${menuOpen ? " is-open" : ""}`}>
        <Link href={role === "commel" ? "/incidents" : "/overview"} className="brand">
          <StationLogo size={52} priority />
          <span>
            <span className="brand-name">FIREALERT</span>
            <span className="brand-sub">{STATION.name}</span>
          </span>
        </Link>

        <nav className="side-nav" aria-label="Board">
          {role === "commel"
            ? COMMEL_NAV.map((item) => {
                const current = pathname === "/incidents" || pathname.startsWith("/incidents/") ? deskTab === item.tab : false;
                const count = item.tab === "active" ? openIncidents : item.tab === "closed" ? closedIncidents : 0;
                return (
                  <Link key={item.tab} href={item.href} className="nav-link" aria-current={current ? "page" : undefined}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {count > 0 ? <span className={`nav-count${item.tab === "active" ? " is-alert" : ""}`}>{count}</span> : null}
                  </Link>
                );
              })
            : role === "responder"
              ? RESPONDER_NAV.map((item) => {
                  const onIncidents = pathname === "/incidents" || pathname.startsWith("/incidents/");
                  const current = item.tab ? onIncidents && responderTab === item.tab : !item.href.startsWith("/incidents") && isCurrent(pathname, item.href);
                  const count = item.tab === "reported" ? reportedIncidents : item.tab === "responding" ? respondingIncidents : item.tab === "closed" ? closedIncidents : item.href === "/crew" ? alerts.length : 0;
                  return (
                    <Link key={item.href} href={item.href} className="nav-link" aria-current={current ? "page" : undefined}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                      {count > 0 ? <span className={`nav-count${item.tab === "reported" || item.href === "/crew" ? " is-alert" : ""}`}>{count}</span> : null}
                    </Link>
                  );
                })
            : NAV.map((item) => {
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

        <div className="side-brand-foot">
          <StationLogo size={36} className="station-logo-sm" alt="" />
          <p className="side-foot">BFP Makati · Supplements radio and dispatch. It does not replace trained judgment.</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button type="button" className="menu-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className="topbar-brand">
            <StationLogo size={42} />
            <div className="topbar-station">
              <p className="eyebrow">{STATION.name}</p>
              <p className="topbar-address">{STATION.address}</p>
            </div>
          </div>
          <div className="topbar-meta">
            <div className="link-pills" aria-live="polite">
              {role === "commel" ? (
                <p className="status-pill is-live">
                  <span className="status-dot" />
                  <span className="status-label">Station desk</span>
                </p>
              ) : (
                <>
              <p className={`status-pill is-${gatewayState === "up" ? "live" : gatewayState === "down" || gatewayState === "offline" ? "offline" : "wait"}`}>
                <span className="status-dot" />
                <span className="status-label">{gatewayLabel}</span>
              </p>
              <p className={`status-pill is-${wearableState === "live" ? "live" : wearableState === "stale" ? "wait" : wearableState === "offline" ? "offline" : "wait"}`}>
                <span className="status-dot" />
                <span className="status-label">{wearableLabel}</span>
              </p>
                </>
              )}
            </div>
            <div className="clock">
              <time dateTime={clockReady ? new Date(now).toISOString() : undefined}>{clockReady ? manilaClock(now) : "--:--:--"}</time>
              <span className="clock-date">{clockReady ? `${manilaDay(now)} PHT` : "PHT"}</span>
            </div>
            <div className="user-menu">
              {username ? (
                <>
                  <span className="user-name">{role ? roleLabel(role) : username}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
                    Sign out
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setLoginOpen(true)}>
                  Sign in
                </button>
              )}
            </div>
          </div>
        </header>
        <main className="workspace-main" id="main">
          {children}
        </main>
      </div>

      <LoginModal
        open={loginOpen}
        configured={authConfigured}
        onClose={closeLogin}
        onSignedIn={(name, signedRole) => {
          setUsername(name);
          setRole(signedRole);
          router.replace(homeForRole(signedRole));
        }}
      />
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="app-shell">
          <div className="station-backdrop" aria-hidden />
        </div>
      }
    >
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
