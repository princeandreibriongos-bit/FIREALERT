"use client";

import { gatewayPhase } from "@/lib/connection";
import { HOSTED_BOARD_URL } from "@/lib/hosts";
import { ageLabel } from "@/lib/format";
import { useBoard } from "./board-provider";
import { RouterForm } from "./router-form";
import { PageHeader } from "./ui";

export function GatewayPage() {
  const { items, gateway, now } = useBoard();
  const reported = items?.find((row) => row.router_ssid)?.router_ssid ?? null;
  const phase = gatewayPhase(gateway, now);

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
            <h2 className="card-title">Gateway now</h2>
            <p className={`metric-value ${phase === "up" ? "is-ok" : ""}`} style={{ fontSize: "1.15rem" }}>
              {phase === "up" ? "Connected" : phase === "down" ? "Wi-Fi down" : "Waiting"}
            </p>
            <p className="card-note">
              {phase === "waiting"
                ? "No fresh heartbeat. Plug in the gateway and run npm run bridge."
                : `${gateway?.ip ?? "No address"} · channel ${gateway?.channel ?? "—"} · ${gateway?.mac ?? "No MAC"} · ${gateway?.seen_at ? ageLabel(gateway.seen_at, now) : "—"}`}
            </p>
            {gateway?.ssid ? <p className="card-note">Joined {gateway.ssid}.</p> : null}
            {reported ? <p className="card-note">Last packet named the network {reported}.</p> : null}
          </section>
          <section className="card">
            <h2 className="card-title">Presentation setup</h2>
            <ol className="steps">
              <li>Turn on the phone hotspot and set it to 2.4 GHz.</li>
              <li>Enter that name and password here, then save.</li>
              <li>Leave the gateway on the USB cable and keep npm run bridge running.</li>
              <li>Watch the top of the board. Both pills turn green when the link is up.</li>
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
          <section className="card">
            <h2 className="card-title">Access</h2>
            <p className="card-note">Anyone who can open this board can read the saved password. This prototype has no login.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
