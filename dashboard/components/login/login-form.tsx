"use client";

import * as React from "react";
import { AUTH_ENV_NAMES, safeReturnPath } from "@/lib/auth-config";
import { KalloMark } from "@/components/shell/sidebar";

type ConfigState = { configured: boolean; reason: string | null } | null;

export default function LoginForm() {
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

  React.useEffect(() => { if (configured) document.getElementById('username')?.focus(); }, [configured]);
  return <main className="flex min-h-[calc(100dvh-2.5rem)] items-center justify-center px-4 py-12"><section className="w-full max-w-[360px]" aria-labelledby="login-title"><div className="mb-8 flex items-center gap-3"><KalloMark className="h-7 w-auto text-[var(--console-data)]" /><h1 id="login-title" className="text-xl font-semibold">Kallo admin</h1></div><form className="grid gap-4" onSubmit={event => void submit(event)}>{[['Username', 'username'], ['Password', 'password']].map(([label, name]) => <label key={name} className="grid gap-2 text-xs">{label}<input id={name} type={name === 'password' ? 'password' : 'text'} autoComplete={name === 'password' ? 'current-password' : 'username'} value={name === 'password' ? password : username} onChange={e => name === 'password' ? setPassword(e.target.value) : setUsername(e.target.value)} disabled={!configured || busy} required maxLength={name === 'password' ? 1024 : 256} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" /></label>)}<button disabled={!configured || busy} className="mt-1 flex h-10 items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background disabled:opacity-50">{busy && <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}{setupPending ? 'Checking…' : busy ? 'Signing in…' : 'Sign in'}</button>{message && <p role="alert" className="text-xs text-[var(--console-brick)]">{message}</p>}{!setupPending && !configured && <div role="alert" className="text-xs text-[var(--console-brick)]">Dashboard authentication is not configured.<details className="mt-2"><summary>Required environment variables</summary><ul className="mt-2 grid gap-1 break-all">{AUTH_ENV_NAMES.map(name => <li key={name}>{name}</li>)}</ul></details></div>}</form></section></main>;
}
