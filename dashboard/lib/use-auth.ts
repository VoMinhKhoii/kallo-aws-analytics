"use client";

import * as React from "react";
import type { DashboardRole } from "./auth-config";

export type AuthState = {
  role: DashboardRole | null;
  expiresAt: string | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: AuthState = { role: null, expiresAt: null, loading: true, error: null };

/** Read the server-authoritative session without exposing cookie or credential values. */
export function useSessionRole(enabled = true): AuthState {
  const [state, setState] = React.useState<AuthState>(() => ({ ...INITIAL_STATE, loading: enabled }));

  React.useEffect(() => {
    if (!enabled) {
      setState({ role: null, expiresAt: null, loading: false, error: null });
      return;
    }
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { role?: unknown; expires_at?: unknown } | null;
        if (!response.ok || (body?.role !== "founder" && body?.role !== "reviewer")) {
          throw new Error(response.status === 503 ? "Dashboard authentication is not configured" : "Authentication required");
        }
        return body;
      })
      .then((body) => {
        if (!active) return;
        setState({ role: body.role as DashboardRole, expiresAt: typeof body.expires_at === "string" ? body.expires_at : null, loading: false, error: null });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setState({ role: null, expiresAt: null, loading: false, error: reason instanceof Error ? reason.message : "Authentication required" });
      });
    return () => { active = false; };
  }, [enabled]);

  return state;
}
