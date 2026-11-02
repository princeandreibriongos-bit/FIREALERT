"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { gatewayPhase, wearablePhase } from "@/lib/connection";
import { manilaClock, manilaDay } from "@/lib/format";
import { STATION } from "@/lib/station";
import { useBoard } from "./board-provider";
import { Icon } from "./icons";
import { LoginModal } from "./login-modal";
import { StationLogo } from "./station-logo";

const NAV = [
  { href: "/overview", label: "Overview", icon: "overview" as const },
  { href: "/sensors", label: "Sensors", icon: "sensors" as const },
  { href: "/crew", label: "Crew", icon: "crew" as const },
  { href: "/incidents", label: "Incidents", icon: "incidents" as const },
  { href: "/log", label: "Packet log", icon: "log" as const },
  { href: "/gateway", label: "Gateway", icon: "gateway" as const },
  { href: "/system", label: "System", icon: "system" as const },
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(true);
  const openIncidents = incidents.filter((incident) => incident.status === "open").length;
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
        const json = (await response.json()) as { ok?: boolean; username?: string };
        if (cancelled) return;
        if (response.ok && json.ok && json.username) {
          setUsername(json.username);
          setAuthConfigured(true);
          return;
        }
        if (response.status === 503) setAuthConfigured(false);
        setUsername(null);
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
    gatewayState === "up" ? "Gateway connected" : gatewayState === "down" ? "Gateway Wi-Fi down" : gatewayState === "offline" ? "Board offline" : "Gateway waiting";
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
        <Link href="/overview" className="brand">
          <StationLogo size={52} priority />
          <span>
            <span className="brand-name">FIREALERT</span>
            <span className="brand-sub">{STATION.name}</span>
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
            <div className="user-menu">
              {username ? (
                <>
                  <span className="user-name">{username}</span>
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
        onSignedIn={(name) => {
          setUsername(name);
          router.replace("/overview");
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
