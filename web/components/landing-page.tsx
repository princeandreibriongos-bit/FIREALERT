"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STATION } from "@/lib/station";
import { LoginModal } from "./login-modal";
import { StationLogo } from "./station-logo";

const HIGHLIGHTS = [
  {
    title: "Crew monitoring",
    body: "Live wearable cues for physiology, air, motion, and location — for a person to review, not to replace radio.",
  },
  {
    title: "Incident board",
    body: "Capture addresses, advisory driving options from Malugay Street, and keep open calls visible to the watch.",
  },
  {
    title: "Gateway link",
    body: "ESP32 wearable to field gateway to this board. Wi‑Fi credentials and packet status stay under station control.",
  },
];

export function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [authConfigured, setAuthConfigured] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantSignIn = params.get("signin") === "1";

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const json = (await response.json()) as { ok?: boolean; username?: string };
        if (cancelled) return;
        if (response.ok && json.ok && json.username) {
          setUsername(json.username);
          // Already signed in and asked for the board — go straight in.
          if (wantSignIn) {
            const next = params.get("next");
            const target =
              next && next.startsWith("/") && !next.startsWith("//") && next !== "/" && !next.startsWith("/login")
                ? next
                : "/overview";
            window.location.replace(target);
            return;
          }
          return;
        }
        setUsername(null);
        if (wantSignIn) setLoginOpen(true);
      } catch {
        if (!cancelled) {
          setUsername(null);
          if (wantSignIn) setLoginOpen(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function closeLogin() {
    setLoginOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("signin")) {
      url.searchParams.delete("signin");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
  }

  return (
    <div className="landing">
      <div className="station-backdrop" aria-hidden />

      <header className="landing-top">
        <div className="landing-brand">
          <StationLogo size={56} priority />
          <div>
            <p className="brand-name">FIREALERT</p>
            <p className="brand-sub">{STATION.name}</p>
          </div>
        </div>
        <div className="landing-top-actions">
          {username ? (
            <>
              <span className="user-name">{username}</span>
              <Link href="/overview" className="btn btn-primary">
                Enter command board
              </Link>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setLoginOpen(true)}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero card">
          <p className="eyebrow">Bureau of Fire Protection · Makati City</p>
          <h1>{STATION.name}</h1>
          <p className="landing-lead">
            Command board for the FIREALERT wearable prototype. Review crew status, incidents, and gateway health —
            then sign in when you are ready to work the board.
          </p>
          <p className="fine">{STATION.address}</p>
          <div className="landing-cta">
            {username ? (
              <Link href="/overview" className="btn btn-primary">
                Open overview
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setLoginOpen(true)}>
                Sign in to continue
              </button>
            )}
            <a className="btn btn-ghost" href="#about">
              About this board
            </a>
          </div>
        </section>

        <section className="landing-grid" id="about">
          {HIGHLIGHTS.map((item) => (
            <article key={item.title} className="card landing-card">
              <h2 className="card-title">{item.title}</h2>
              <p className="card-note">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="card landing-notice">
          <h2 className="card-title">Operational limits</h2>
          <p className="card-note">
            FIREALERT supplements radio and dispatch. It is not protective equipment, not a certified gas instrument,
            and it does not make tactical or medical decisions. Sign in with a station account to use the live board.
          </p>
        </section>
      </main>

      <footer className="landing-foot">
        <StationLogo size={36} className="station-logo-sm" alt="" />
        <p className="fine">BFP Makati · FIREALERT prototype</p>
      </footer>

      <LoginModal
        open={loginOpen}
        configured={authConfigured}
        onClose={closeLogin}
        onSignedIn={(name) => {
          setUsername(name);
          setAuthConfigured(true);
          const params = new URLSearchParams(window.location.search);
          const next = params.get("next");
          const target =
            next && next.startsWith("/") && !next.startsWith("//") && next !== "/" && !next.startsWith("/login")
              ? next
              : "/overview";
          window.location.href = target;
        }}
      />
    </div>
  );
}
