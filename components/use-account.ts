"use client";

import { useEffect, useState } from "react";
import type { AccountRole } from "@/lib/auth/roles";

export function useAccount() {
  const [role, setRole] = useState<AccountRole | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const json = (await response.json()) as { ok?: boolean; username?: string; role?: AccountRole };
        if (cancelled) return;
        if (response.ok && json.ok) {
          setUsername(json.username ?? null);
          setRole(json.role === "commel" || json.role === "responder" || json.role === "admin" ? json.role : "admin");
        }
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, username, ready };
}
