"use client";

import { useEffect, useState, type FormEvent } from "react";
import { manilaTime } from "@/lib/format";

type Kind = "hotspot" | "router";

type Profile = {
  ssid: string;
  password: string;
  updated_at: string | null;
};

type Stored = {
  active: Kind;
  router: Profile;
  hotspot: Profile;
};

const emptyProfile = (): Profile => ({ ssid: "", password: "", updated_at: null });

export function RouterForm() {
  const [kind, setKind] = useState<Kind>("hotspot");
  const [active, setActive] = useState<Kind>("router");
  const [profiles, setProfiles] = useState<Stored>({ active: "router", router: emptyProfile(), hotspot: emptyProfile() });
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyStored(stored: Stored, nextKind: Kind) {
    setProfiles(stored);
    setActive(stored.active);
    setKind(nextKind);
    setSsid(stored[nextKind].ssid);
    setPassword(stored[nextKind].password);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/network", { cache: "no-store" });
        const json = (await response.json()) as { ok?: boolean; active?: Kind; router?: Profile; hotspot?: Profile };
        if (cancelled || !response.ok || !json.ok || !json.router || !json.hotspot || !json.active) {
          if (!cancelled) setError("The saved networks could not be loaded.");
          return;
        }
        const stored: Stored = { active: json.active, router: json.router, hotspot: json.hotspot };
        if (!cancelled) applyStored(stored, "hotspot");
      } catch {
        if (!cancelled) setError("The saved networks could not be loaded.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function showKind(next: Kind) {
    setProfiles((current) => {
      const draft = { ...current, [kind]: { ...current[kind], ssid, password } };
      setSsid(draft[next].ssid);
      setPassword(draft[next].password);
      return draft;
    });
    setKind(next);
    setMessage(null);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/network", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ssid, password }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        active?: Kind;
        router?: Profile;
        hotspot?: Profile;
      };
      if (!response.ok || !json.ok || !json.router || !json.hotspot || !json.active) {
        setError(json.error ?? "Could not save that network");
        return;
      }
      applyStored({ active: json.active, router: json.router, hotspot: json.hotspot }, kind);
      setMessage(
        kind === "hotspot"
          ? "Phone hotspot is the network the gateway will join. The room router is still saved."
          : "Room router is the network the gateway will join. The phone hotspot is still saved.",
      );
    } catch {
      setError("Could not save that network");
    } finally {
      setSaving(false);
    }
  }

  async function useSavedRouter() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/network", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activate: "router" }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        active?: Kind;
        router?: Profile;
        hotspot?: Profile;
      };
      if (!response.ok || !json.ok || !json.router || !json.hotspot || !json.active) {
        setError(json.error ?? "Could not switch back to the room router");
        return;
      }
      applyStored({ active: json.active, router: json.router, hotspot: json.hotspot }, "router");
      setMessage("Room router is active again. The saved hotspot was left as it is.");
    } catch {
      setError("Could not switch back to the room router");
    } finally {
      setSaving(false);
    }
  }

  const savedRouter = profiles.router.ssid;
  const updatedAt = profiles[kind].updated_at;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">{kind === "hotspot" ? "Phone hotspot" : "Room router"}</h2>
          <p className="card-note">
            {kind === "hotspot"
              ? "A phone hotspot is a normal Wi-Fi network for the gateway. Use 2.4 GHz. On Android, turn on maximize compatibility. Keep the phone awake."
              : "Name and password for the access point at the station. Saving here does not erase a hotspot you already stored."}
          </p>
        </div>
      </div>
      {!ready ? <p className="fine">Loading saved settings…</p> : null}
      <form className="form" autoComplete="off" noValidate onSubmit={submit}>
        <div className="chips" role="group" aria-label="Network type">
          <button type="button" className="chip" aria-pressed={kind === "hotspot"} onClick={() => showKind("hotspot")}>
            Phone hotspot
          </button>
          <button type="button" className="chip" aria-pressed={kind === "router"} onClick={() => showKind("router")}>
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
            {saving ? "Saving…" : kind === "hotspot" ? "Save hotspot" : "Save router"}
          </button>
        </div>
        {savedRouter && kind === "hotspot" ? (
          <div className="row-actions">
            <p className="fine">
              Room router {savedRouter} is saved.
              {active === "router" ? " The gateway is still using it until you save a hotspot." : ""}
            </p>
            {active !== "router" ? (
              <button type="button" className="btn btn-ghost" onClick={() => void useSavedRouter()} disabled={saving}>
                Use room router
              </button>
            ) : null}
          </div>
        ) : null}
        {updatedAt ? <p className="fine">Last saved {manilaTime(updatedAt)} PHT.</p> : <p className="fine">Nothing saved for this network yet.</p>}
        <p className="fine">{active === "hotspot" ? "Live network: phone hotspot." : "Live network: room router."}</p>
        {message ? <p className="fine">{message}</p> : null}
        {error ? <p className="warn-text">{error}</p> : null}
      </form>
    </section>
  );
}
