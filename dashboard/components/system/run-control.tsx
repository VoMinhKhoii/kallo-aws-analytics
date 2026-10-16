"use client";
import { apiFetch } from '@/lib/api-fetch';

import * as React from "react";
import type { RunStatus } from "@/app/lib/types";
import { LoadingLine, SourceTag, InlineNote } from '@/components/console/console';
import { useSessionRole } from "@/lib/use-auth";
import { useCloudMonitoring } from "@/lib/use-cloud-monitoring";


export function RunControl() {
  const auth = useSessionRole();
  const [status, setStatus] = React.useState<RunStatus | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [authoritativeUntil, setAuthoritativeUntil] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const cooldownSeconds = Math.max(0, Math.ceil((authoritativeUntil - now) / 1000));
  const activeRun = Boolean(status && !["completed", "failed", "error"].includes(status.phase));
  const canRun = auth.role === "founder";
  const nextAllowedLabel = authoritativeUntil > now
    ? new Date(authoritativeUntil).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
    : null;

  React.useEffect(() => {
    if (!activeRun || !status?.run_id) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await apiFetch(`/api/runs/${encodeURIComponent(status.run_id)}`, { cache: "no-store" });
        const body = await response.json().catch(() => null) as RunStatus & { error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.error ?? "Run status unavailable");
        if (active) setStatus(body);
      } catch (reason) {
        if (active) setRunError(reason instanceof Error ? reason.message : "Run status unavailable");
      }
    };
    const timer = window.setInterval(poll, 2_000);
    void poll();
    return () => { active = false; window.clearInterval(timer); };
  }, [activeRun, status?.run_id]);

  React.useEffect(() => {
    if (authoritativeUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [authoritativeUntil]);

  const applyAuthoritativeGuard = (body: { retry_after?: number | string; next_allowed_at?: string }) => {
    const parsedDate = body.next_allowed_at ? Date.parse(body.next_allowed_at) : Number.NaN;
    const retrySeconds = Number(body.retry_after);
    const parsedRetry = Number.isFinite(retrySeconds) && retrySeconds > 0 ? Date.now() + retrySeconds * 1_000 : Number.NaN;
    const until = Number.isFinite(parsedDate) ? parsedDate : parsedRetry;
    if (Number.isFinite(until) && until > Date.now()) {
      setAuthoritativeUntil(until);
      setNow(Date.now());
    }
    return Number.isFinite(until) ? until : undefined;
  };

  const start = async () => {
    if (!canRun || starting || activeRun || authoritativeUntil > Date.now()) return;
    setStarting(true);
    setRunError(null);
    try {
      const response = await apiFetch("/api/runs", { method: "POST", credentials: "same-origin" });
      const body = await response.json().catch(() => null) as { run_id?: string; error?: string; retry_after?: number | string; next_allowed_at?: string } | null;
      if (!response.ok) {
        if (response.status === 429 && body) {
          const until = applyAuthoritativeGuard(body);
          throw new Error(`Server run guard is active${until ? `; next allowed at ${new Date(until).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC` : ""}. This guard is shared across tabs and devices.`);
        }
        throw new Error(response.status === 403 ? "Founder role required for manual snapshots." : body?.error ?? "Pipeline run could not be started");
      }
      if (!body?.run_id) throw new Error("Pipeline run response did not include a run id");
      applyAuthoritativeGuard(body);
      setStatus({ run_id: body.run_id, phase: "starting", updated_at: new Date().toISOString() });
    } catch (reason) {
      setRunError(reason instanceof Error ? reason.message : "Pipeline run could not be started");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="grid gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--console-ink)]">Refresh analytics snapshot</p>
          <p className="mt-1 text-xs leading-5 text-[var(--console-muted)]">Starts the existing extract → transform → load path. The server reserves one run slot for 30 minutes across tabs and devices; browser state is only a convenience.</p>
        </div>
        <button type="button" onClick={() => void start()} disabled={!canRun || auth.loading || starting || activeRun || cooldownSeconds > 0} className="min-h-9 rounded-md bg-[var(--console-ink)] px-3 text-xs font-semibold text-[var(--console-surface)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45">
          {auth.loading ? "Checking access…" : !canRun ? "Founder only" : starting ? "Starting…" : activeRun ? "Run in progress" : cooldownSeconds > 0 ? `Server guard · ${cooldownSeconds}s` : "Run snapshot"}
        </button>
      </div>
      {!auth.loading && !canRun ? <InlineNote>Reviewer access is read-only. Manual snapshots require the founder role; the server enforces this even if browser state is bypassed.</InlineNote> : null}
      {nextAllowedLabel ? <p className="px-4 text-[11px] text-[var(--console-muted)] sm:px-5">Server next-allowed time: <span className="font-mono text-[var(--console-ink)]">{nextAllowedLabel}</span>. A bypassed or stale browser cannot bypass this guard.</p> : null}
      {runError ? <InlineNote tone="error">{runError}</InlineNote> : null}
      {status ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--console-rule)] pt-3 text-[11px] text-[var(--console-muted)]"><SourceTag tone={activeRun ? "warn" : status.phase === "completed" ? "live" : "error"}>{status.phase}</SourceTag><span className="font-mono">run {status.run_id.slice(0, 12)}</span>{status.updated_at ? <span>updated {new Date(status.updated_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</span> : null}</div> : null}
      {starting ? <LoadingLine label="Contacting the run endpoint" /> : null}
    </div>
  );
}
