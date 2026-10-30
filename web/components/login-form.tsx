"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BrandMark } from "./icons";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Sign-in failed");
        return;
      }
      router.replace(nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/");
      router.refresh();
    } catch {
      setError("Could not reach the board");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <p className="brand-name">FIREALERT</p>
            <p className="brand-sub">Command board sign-in</p>
          </div>
        </div>
        {!configured ? (
          <p className="warn-text">
            Auth is not ready on this server. Set <code>DATABASE_URL</code> and <code>SESSION_SECRET</code> in{" "}
            <code>web/.env.local</code>, run <code>npm run db:push</code>, then <code>npm run user:create</code>.
          </p>
        ) : (
          <form className="form" autoComplete="off" noValidate onSubmit={submit}>
            <div className="field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={saving}
                maxLength={32}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
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
        <p className="fine auth-foot">Supplements radio and dispatch. It does not replace trained judgment.</p>
      </div>
    </div>
  );
}
