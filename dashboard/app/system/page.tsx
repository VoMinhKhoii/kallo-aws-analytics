"use client";

import * as React from "react";
import type { RunStatus } from "@/app/lib/types";
import {
  ConsolePage,
  formatDuration,
  formatNumber,
  formatPercent,
  LoadingLine,
  MetricRibbon,
  MetricState,
  PageIntro,
  Panel,
  RangeControl,
  SourceTag,
  InlineNote,
  RefreshButton,
  rangeWindow,
  type ConsoleRange,
} from "@/components/console/console";
import { useSessionRole } from "@/lib/use-auth";
import { useCloudMonitoring } from "@/lib/use-cloud-monitoring";
import { TimeSeriesChart } from "@/components/console/time-series-chart";

function RunControl() {
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
        const response = await fetch(`/api/runs/${encodeURIComponent(status.run_id)}`, { cache: "no-store" });
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
      const response = await fetch("/api/runs", { method: "POST", credentials: "same-origin" });
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

export default function SystemPage() {
  const [productRange, setProductRange] = React.useState<ConsoleRange>("7d");
  const productWindow = React.useMemo(() => rangeWindow(productRange), [productRange]);
  const monitoring = useCloudMonitoring(productWindow.from, productWindow.to);
  const source = monitoring.data;
  const points = (source?.series ?? []).map((point) => ({
    ...point,
    date: point.timestamp.slice(0, 16).replace("T", " "),
  }));
  const latest = points.at(-1);
  const requests = points.reduce((sum, point) => sum + (point.request_count ?? 0), 0);
  const errors = points.reduce((sum, point) => sum + (point.error_count ?? 0), 0);
  const sourceTag = <SourceTag tone={points.length ? "live" : "neutral"}>Google Monitoring</SourceTag>;

  return (
    <ConsolePage>
      <PageIntro eyebrow="System" title="System" description="Normal Cloud Run request latency, traffic, errors, startup, capacity, and resources.">
        <div className="flex flex-wrap items-center gap-2">
          <RangeControl value={productRange} onChange={setProductRange} label="Window" options={["24h", "7d", "30d", "90d"]} />
          <RefreshButton refreshing={monitoring.refreshing} onClick={monitoring.refresh} />
        </div>
      </PageIntro>

      <div className="mt-3 grid gap-3">
        <MetricRibbon items={[
          { label: "Normal requests", value: formatNumber(requests || undefined), detail: "Cloud Run traffic", tone: "blue", loading: monitoring.loading, error: monitoring.error },
          { label: "5xx rate", value: formatPercent(requests ? errors / requests : undefined), detail: requests ? `${errors} of ${requests}` : "No requests", tone: errors ? "amber" : "green", loading: monitoring.loading, error: monitoring.error },
          { label: "Latest request p95", value: formatDuration(latest?.p95_ms), detail: "normal API, not AI model latency", tone: "blue", loading: monitoring.loading, error: monitoring.error },
          { label: "Latest instances", value: formatNumber(latest?.instances), detail: source ? `${source.service} · ${source.location}` : "Cloud Run service", loading: monitoring.loading, error: monitoring.error },
        ]} />

        <Panel title="Normal API request latency" description="Cloud Run request p50/p95/p99 for all requests reaching the service container. This is separate from AI meal-model latency." source={sourceTag}>
          <MetricState loading={monitoring.loading} error={monitoring.error} empty={points.length === 0} emptyMessage="Google Cloud Monitoring returned no Cloud Run request-latency points for this window.">
            <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={points} series={[{ key: "p50_ms", label: "p50", color: "var(--console-green)" }, { key: "p95_ms", label: "p95", color: "var(--console-blue)" }, { key: "p99_ms", label: "p99", color: "var(--console-brick)" }]} ariaLabel="Normal Cloud Run API request latency" format="duration" /></div>
            <InlineNote>Cloud Run&apos;s GA request-latency metric excludes container startup. Startup p95 is charted separately below.</InlineNote>
          </MetricState>
        </Panel>

        <Panel title="Request and server-error volume" description="Aligned request totals and HTTP 5xx responses from Cloud Monitoring." source={sourceTag}><MetricState loading={monitoring.loading} error={monitoring.error} empty={points.length === 0} emptyMessage="No Cloud Run request-count points were returned."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={points} series={[{ key: "request_count", label: "Requests", color: "var(--console-blue)" }, { key: "error_count", label: "5xx", color: "var(--console-brick)" }]} ariaLabel="Cloud Run request and server error volume" /></div></MetricState></Panel>

        <Panel title="Container startup latency" description="p95 time spent starting a new Cloud Run container instance." source={sourceTag}><MetricState loading={monitoring.loading} error={monitoring.error} empty={points.every((point) => point.startup_p95_ms == null)} emptyMessage="No container starts occurred in this window, so startup latency has no points."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={points} series={[{ key: "startup_p95_ms", label: "Startup p95", color: "var(--console-amber)" }]} ariaLabel="Cloud Run container startup p95 latency" format="duration" /></div></MetricState></Panel>

        <Panel title="Container resource utilization" description="p95 CPU and memory utilization across Cloud Run instances." source={sourceTag}><MetricState loading={monitoring.loading} error={monitoring.error} empty={points.every((point) => point.cpu_p95 == null && point.memory_p95 == null)} emptyMessage="No Cloud Run resource-utilization points were returned."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={points} series={[{ key: "cpu_p95", label: "CPU p95", color: "var(--console-blue)" }, { key: "memory_p95", label: "Memory p95", color: "var(--console-green)" }]} ariaLabel="Cloud Run CPU and memory p95 utilization" format="percent" /></div></MetricState></Panel>

        <Panel title="Container instances" description="Active and idle Cloud Run instance count after cross-series reduction." source={sourceTag}><MetricState loading={monitoring.loading} error={monitoring.error} empty={points.every((point) => point.instances == null)} emptyMessage="No Cloud Run instance-count points were returned."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={points} series={[{ key: "instances", label: "Instances", color: "var(--console-ink)" }]} ariaLabel="Cloud Run container instance count" /></div></MetricState></Panel>

        <Panel title="Manual snapshot control" description="Operator action against the existing run endpoint. The server-authoritative 30-minute guard is shared across tabs and devices; endpoint authorization remains authoritative." source={<SourceTag tone="warn">Operator action</SourceTag>}>
          <RunControl />
        </Panel>
        {source ? <InlineNote tone="plain">Monitoring aligned points every {source.alignment_seconds / 3600}h. Google samples Cloud Run metrics about once per minute and can publish them up to roughly two minutes later.</InlineNote> : null}
      </div>
    </ConsolePage>
  );
}
