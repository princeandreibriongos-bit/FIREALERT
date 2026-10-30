"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { STATION } from "@/lib/station";
import { StationLogo } from "./station-logo";

export function LoginModal({
  open,
  configured,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  configured: boolean;
  onClose: () => void;
  onSignedIn: (username: string) => void;
}) {
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const timer = window.setTimeout(() => firstField.current?.focus(), 40);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string; username?: string };
      if (!response.ok || !json.ok || !json.username) {
        setError(json.error ?? "Sign-in failed");
        return;
      }
      onSignedIn(json.username);
      setPassword("");
      onClose();
    } catch {
      setError("Could not reach the board");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="login-modal-root" role="presentation">
      <button type="button" className="login-modal-scrim" aria-label="Close sign-in" onClick={onClose} />
      <div className="login-modal card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="login-modal-brand">
          <StationLogo size={72} className="station-logo-lg" priority />
          <div>
            <p id={titleId} className="brand-name">
              FIREALERT
            </p>
            <p className="brand-sub">{STATION.name}</p>
          </div>
        </div>
        <p className="fine">Sign in to the command board when you are ready. Guests can still browse.</p>
        {!configured ? (
          <p className="warn-text">Auth is not configured on this server yet.</p>
        ) : (
          <form className="form" autoComplete="off" noValidate onSubmit={submit}>
            <div className="field">
              <label htmlFor="modal-login-username">Username</label>
              <input
                ref={firstField}
                id="modal-login-username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={saving}
                maxLength={32}
              />
            </div>
            <div className="field">
              <label htmlFor="modal-login-password">Password</label>
              <input
                id="modal-login-password"
                name="password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={saving}
                maxLength={128}
              />
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShow((value) => !value)}>
                {show ? "Hide password" : "Show password"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Signing in…" : "Sign in"}
              </button>
            </div>
            {error ? <p className="warn-text">{error}</p> : null}
          </form>
        )}
        <button type="button" className="btn btn-ghost login-modal-close" onClick={onClose}>
          Continue as guest
        </button>
      </div>
    </div>
  );
}
