"use client";

import { useEffect, useState, type FormEvent } from "react";
import { manilaTime } from "@/lib/format";

export function RouterForm() {
  const [kind, setKind] = useState<"hotspot" | "router">("hotspot");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/network", { cache: "no-store" });
        const json = (await response.json()) as { ok?: boolean; ssid?: string; password?: string; updated_at?: string | null };
        if (cancelled || !response.ok || !json.ok) {
          if (!cancelled) setError("The saved router could not be loaded.");
          return;
        }
        setSsid(json.ssid ?? "");
        setPassword(json.password ?? "");
        setUpdatedAt(json.updated_at ?? null);
      } catch {
        if (!cancelled) setError("The saved router could not be loaded.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/network", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssid, password }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string; updated_at?: string | null; ssid?: string };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Could not save the router");
        return;
      }
      setUpdatedAt(json.updated_at ?? null);
      setMessage(
        kind === "hotspot"
          ? "Saved the phone hotspot. Leave the hotspot on, and keep the USB bridge running. The gateway joins it like any other Wi-Fi network."
          : "Saved the router. The USB bridge sends it to the gateway, or the gateway picks it up on its next check-in.",
      );
    } catch {
      setError("Could not save the router");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">{kind === "hotspot" ? "Phone hotspot" : "Room router"}</h2>
          <p className="card-note">
            {kind === "hotspot"
              ? "A phone hotspot is a normal Wi-Fi network for the gateway. Use 2.4 GHz. On Android, turn on maximize compatibility. Keep the phone awake."
              : "Name and password for the access point at the station. The same form is used for a phone hotspot."}
          </p>
        </div>
      </div>
      {!ready ? <p className="fine">Loading saved settings…</p> : null}
      <form className="form" autoComplete="off" noValidate onSubmit={submit}>
        <div className="chips" role="group" aria-label="Network type">
          <button type="button" className="chip" aria-pressed={kind === "hotspot"} onClick={() => setKind("hotspot")}>
            Phone hotspot
          </button>
          <button type="button" className="chip" aria-pressed={kind === "router"} onClick={() => setKind("router")}>
            Room router
          </button>
        </div>
        <div className="field">
          <label htmlFor="router-ssid">{kind === "hotspot" ? "Hotspot name" : "Wi-Fi name (SSID)"}</label>
          <input
            id="router-ssid"
            name="ssid"
            value={ssid}
            onChange={(event) => setSsid(event.target.value)}
            maxLength={32}
            placeholder={kind === "hotspot" ? "iPhone or Android hotspot name" : "Router name"}
            autoComplete="off"
            disabled={!ready || saving}
          />
        </div>
        <div className="field">
          <label htmlFor="router-password">Password</label>
          <input
            id="router-password"
            name="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={63}
            placeholder={kind === "hotspot" ? "Hotspot password" : "Router password"}
            autoComplete="new-password"
            disabled={!ready || saving}
          />
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setShow((value) => !value)}>
            {show ? "Hide password" : "Show password"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready || saving}>
            {saving ? "Saving…" : "Save router"}
          </button>
        </div>
        {updatedAt ? <p className="fine">Last saved {manilaTime(updatedAt)} PHT.</p> : <p className="fine">No router saved yet.</p>}
        {message ? <p className="fine">{message}</p> : null}
        {error ? <p className="warn-text">{error}</p> : null}
      </form>
    </section>
  );
}
