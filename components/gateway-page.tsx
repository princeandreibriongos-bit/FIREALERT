"use client";

import { useCallback, useEffect, useState } from "react";
import { diagnoseGateway, gatewayPhase, type GatewayDiagnosis } from "@/lib/connection";
import { HOSTED_BOARD_URL } from "@/lib/hosts";
import { ageLabel } from "@/lib/format";
import type { GatewayLink } from "@/lib/link-status";
import { useBoard } from "./board-provider";
import { RouterForm } from "./router-form";
import { PageHeader } from "./ui";

function toneFor(likely: GatewayDiagnosis["likely"]) {
  if (likely === "ok") return "is-ok";
  if (likely === "usb" || likely === "connecting") return "";
  return "is-warn";
}

export function GatewayPage() {
  const { items, gateway, now } = useBoard();
  const reported = items?.find((row) => row.router_ssid)?.router_ssid ?? null;
  const phase = gatewayPhase(gateway, now);
  const [activeSsid, setActiveSsid] = useState<string | null>(null);
  const [check, setCheck] = useState<GatewayDiagnosis | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const liveDiagnosis = diagnoseGateway(gateway, now, activeSsid);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const [linkRes, netRes] = await Promise.all([
        fetch("/api/link", { cache: "no-store" }),
        fetch("/api/network", { cache: "no-store" }),
      ]);
      const linkJson = (await linkRes.json()) as { ok?: boolean; gateway?: GatewayLink; error?: string };
      const netJson = (await netRes.json()) as {
        ok?: boolean;
        active?: "router" | "hotspot";
        router?: { ssid?: string };
        hotspot?: { ssid?: string };
      };
      if (!linkRes.ok || !linkJson.ok) {
        setCheckError(linkJson.error ?? "Could not read gateway status");
        return;
      }
      const active =
        netJson.ok && netJson.active
          ? netJson.active === "hotspot"
            ? netJson.hotspot?.ssid ?? null
            : netJson.router?.ssid ?? null
          : null;
      setActiveSsid(active || null);
      setCheck(diagnoseGateway(linkJson.gateway ?? null, Date.now(), active));
      setCheckedAt(Date.now());
    } catch {
      setCheckError("Could not reach the board API. Is npm run dev / start still running?");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/network", { cache: "no-store" });
        const json = (await response.json()) as {
          ok?: boolean;
          active?: "router" | "hotspot";
          router?: { ssid?: string };
          hotspot?: { ssid?: string };
        };
        if (cancelled || !response.ok || !json.ok || !json.active) return;
        const ssid = json.active === "hotspot" ? json.hotspot?.ssid : json.router?.ssid;
        if (!cancelled) setActiveSsid(ssid || null);
      } catch {
        /* ignore — diagnosis still works without the saved name */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = check ?? liveDiagnosis;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Field gateway"
        title="Gateway"
        description="Save a room router and a phone hotspot. The gateway joins the active one, and if that network is not in range it joins the other saved network."
      />
      <div className="split">
        <RouterForm />
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Gateway now</h2>
              <button type="button" className="btn btn-ghost" onClick={() => void runCheck()} disabled={checking}>
                {checking ? "Checking…" : "Check connection"}
              </button>
            </div>
            <p className={`metric-value ${phase === "up" ? "is-ok" : toneFor(shown.likely)}`} style={{ fontSize: "1.15rem" }}>
              {phase === "up" ? "Connected" : phase === "down" ? "Wi-Fi down" : "Waiting"}
            </p>
            <p className="card-note">
              {phase === "waiting"
                ? "No fresh USB heartbeat. This is not a password verdict yet — run the bridge first."
                : `${gateway?.ip ?? "No address"} · channel ${gateway?.channel ?? "—"} · ${gateway?.mac ?? "No MAC"} · ${gateway?.seen_at ? ageLabel(gateway.seen_at, now) : "—"}`}
            </p>
            {gateway?.ssid ? <p className="card-note">Joined {gateway.ssid}.</p> : null}
            {gateway?.trying && phase !== "up" ? <p className="card-note">Trying {gateway.trying}.</p> : null}
            {gateway?.detail ? <p className="card-note">Gateway detail: {gateway.detail.replaceAll("_", " ")}.</p> : null}
            {reported ? <p className="card-note">Last packet named the network {reported}.</p> : null}
            {checkError ? <p className="warn-text">{checkError}</p> : null}
          </section>

          <section className={`card diagnose is-${shown.likely}`}>
            <h2 className="card-title">{shown.title}</h2>
            <p className="card-note">{shown.summary}</p>
            <ol className="steps">
              {shown.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {checkedAt ? <p className="fine">Last check {ageLabel(new Date(checkedAt).toISOString(), now)}.</p> : <p className="fine">Live from the latest heartbeat. Press Check connection to refresh from the API.</p>}
          </section>

          <section className="card">
            <h2 className="card-title">Presentation setup</h2>
            <ol className="steps">
              <li>Turn on the phone hotspot and set it to 2.4 GHz.</li>
              <li>Enter that name and password here, use Show password to verify, then save.</li>
              <li>Leave the gateway on USB and run npm run bridge once — it auto-picks the COM port and re-finds it if you swap boards.</li>
              <li>Use Check connection above. Waiting = USB; Wi-Fi down with bad password / not in range = wireless.</li>
            </ol>
            <p className="card-note">
              The phone will give this computer a different address than the one baked into the gateway. The USB bridge still delivers packets, so the dashboard does not depend on that address.
            </p>
            <p className="card-note">
              The hosted board at{" "}
              <a href={HOSTED_BOARD_URL} style={{ textDecoration: "underline" }}>
                {HOSTED_BOARD_URL.replace("https://", "")}
              </a>{" "}
              shows the same live readings while this computer is running the bridge.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
