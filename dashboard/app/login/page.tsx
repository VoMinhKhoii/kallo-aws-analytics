"use client";

import * as React from "react";
import { AUTH_ENV_NAMES, safeReturnPath } from "@/lib/auth-config";

type ConfigState = { configured: boolean; reason: string | null } | null;

export default function LoginPage() {
  const [config, setConfig] = React.useState<ConfigState>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch("/api/auth/config", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as ConfigState;
        if (!active) return;
        if (!response.ok || !body) {
          setConfig({ configured: false, reason: "Dashboard authentication setup could not be verified." });
          return;
        }
        setConfig(body);
      })
      .catch(() => active && setConfig({ configured: false, reason: "Dashboard authentication setup could not be verified." }));
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config?.configured || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
      if (!response.ok) {
        setMessage(response.status === 503 ? "Dashboard authentication is not configured." : body?.code === "CSRF_ORIGIN_REQUIRED" ? "Use the dashboard's own URL to sign in." : "Credentials not accepted.");
        return;
      }
      const next = safeReturnPath(new URL(window.location.href).searchParams.get("next"));
      window.location.assign(next);
    } catch {
      setMessage("Sign-in could not be completed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const setupPending = config === null;
  const configured = config?.configured === true;

  return (
    <main className="flex min-h-[calc(100dvh-2.5rem)] items-center justify-center py-12">
      <section className="w-full max-w-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-6 py-7 shadow-[0_12px_34px_color-mix(in_oklab,var(--console-ink)_7%,transparent)] sm:px-8" aria-labelledby="login-title">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--console-ink)] text-sm font-semibold text-[var(--console-surface)]">K</span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--console-muted)]">Private operator console</p>
            <h1 id="login-title" className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[var(--console-ink)]">Kallo analytics</h1>
          </div>
        </div>
        <p className="mt-6 text-sm leading-6 text-[var(--console-muted)]">Sign in to inspect aggregate usage, application health, AI pipeline, and food-data quality. Access is limited to the configured founder and reviewer accounts.</p>

        {setupPending ? <p className="mt-6 border-l-2 border-[var(--console-amber)] bg-[color-mix(in_oklab,var(--console-amber)_8%,var(--console-surface))] px-3 py-3 text-xs leading-5 text-[var(--console-ink)]" role="status">Checking dashboard authentication setup…</p> : null}
        {!setupPending && !configured ? (
          <div className="mt-6 border-l-2 border-[var(--console-brick)] bg-[color-mix(in_oklab,var(--console-brick)_7%,var(--console-surface))] px-3 py-3 text-xs leading-5 text-[var(--console-ink)]" role="alert">
            <p className="font-semibold">Dashboard access is unavailable until credentials are configured.</p>
            <p className="mt-2 text-[var(--console-muted)]">Set these Vercel environment variable names without exposing their values in the client:</p>
            <ul className="mt-2 grid gap-1 font-mono text-[10px] text-[var(--console-muted)]">{AUTH_ENV_NAMES.map((name) => <li key={name}>{name}</li>)}</ul>
            {config?.reason && !config.reason.includes("could not") ? <p className="mt-2 text-[var(--console-muted)]">{config.reason}</p> : null}
          </div>
        ) : null}

        <form className="mt-6 grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--console-ink)]">
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" disabled={!configured || busy} required maxLength={256} className="h-10 rounded-md border border-[var(--console-rule)] bg-[var(--console-bg)] px-3 text-sm font-normal outline-none focus-visible:border-[var(--console-blue)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--console-blue)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--console-ink)]">
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={!configured || busy} required maxLength={1_024} className="h-10 rounded-md border border-[var(--console-rule)] bg-[var(--console-bg)] px-3 text-sm font-normal outline-none focus-visible:border-[var(--console-blue)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--console-blue)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60" />
          </label>
          <button type="submit" disabled={!configured || busy} className="mt-1 min-h-10 rounded-md bg-[var(--console-ink)] px-4 text-xs font-semibold text-[var(--console-surface)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--console-blue)] disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Signing in…" : "Sign in"}</button>
          {message ? <p className="text-xs leading-5 text-[var(--console-brick)]" role="alert">{message}</p> : null}
        </form>
        <p className="mt-6 border-t border-[var(--console-rule)] pt-4 text-[11px] leading-5 text-[var(--console-muted)]">Sessions use a short-lived, signed HttpOnly cookie. Reviewer access is read-only; founder access includes guarded manual snapshot actions.</p>
      </section>
    </main>
  );
}
