"use client";

import { useEffect, useState, type FormEvent } from "react";
import { manilaTime } from "@/lib/format";

export function RouterForm({ gatewaySsid }: { gatewaySsid: string | null }) {
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
      setMessage(`Saved ${json.ssid ?? ssid}. Plug in the gateway and run npm run bridge, or wait for its next check-in if it is already online.`);
    } catch {
      setError("Could not save the router");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel router-panel" aria-labelledby="router-heading">
      <div className="panel-head">
        <h2 id="router-heading">Router</h2>
      </div>
      <p className="note">
        Wi-Fi name and password for the field gateway. Saved on this computer, not in the firmware source. Anyone who can open this dashboard can read the password.
      </p>
      {!ready ? <p className="empty">Loading the saved router…</p> : null}
      <form className="incident-form" autoComplete="off" noValidate onSubmit={submit}>
        <label htmlFor="router-ssid">Wi-Fi name</label>
        <input
          id="router-ssid"
          name="ssid"
          value={ssid}
          onChange={(event) => setSsid(event.target.value)}
          maxLength={32}
          placeholder="Router name"
          autoComplete="off"
          disabled={!ready || saving}
        />
        <label htmlFor="router-password">Password</label>
        <input
          id="router-password"
          name="password"
          type={show ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={63}
          placeholder="Router password"
          autoComplete="new-password"
          disabled={!ready || saving}
        />
        <div className="row-actions">
          <button type="button" className="quiet" onClick={() => setShow((value) => !value)}>
            {show ? "Hide password" : "Show password"}
          </button>
          <button type="submit" className="primary" disabled={!ready || saving}>
            {saving ? "Saving…" : "Save router"}
          </button>
        </div>
        {updatedAt ? <p className="note">Last saved {manilaTime(updatedAt)} PHT.</p> : <p className="note">No router saved yet.</p>}
        {gatewaySsid ? <p className="note">Last gateway packet was on {gatewaySsid}.</p> : null}
        {message ? <p className="note">{message}</p> : null}
        {error ? <p className="warn">{error}</p> : null}
      </form>
    </section>
  );
}
