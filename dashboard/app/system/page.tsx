"use client";

import * as React from "react";
import type {
  AppHealthRow,
  FailureRow,
  LatencyRow,
  RunStatus,
  TokenCostRow,
} from "@/app/lib/types";
import {
  ConsolePage,
  formatDuration,
  formatNumber,
  HealthTable,
  latestByDate,
  latestByHour,
  LoadingLine,
  MetricRibbon,
  MetricState,
  PageIntro,
  Panel,
  RangeControl,
  ScopeControls,
  SimpleTable,
  SourceTag,
  TableCell,
  TableRow,
  InlineNote,
  type ConsoleRange,
} from "@/components/console/console";
import { useMetricBundle, type MetricBundleState } from "@/lib/use-metric-bundle";
import { useSessionRole } from "@/lib/use-auth";

const SYSTEM_METRICS = ["app_health", "ai_latency", "ai_failure_rate", "token_cost_daily"] as const;

function metricError(bundle: MetricBundleState, name: string) {
  return (bundle.errors as Record<string, string | undefined>)[name] ?? bundle.error;
}

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

function FreshnessPanel({ health, pipeline }: { health: AppHealthRow[]; pipeline: { latency: LatencyRow[]; failures: FailureRow[] } }) {
  const latestHealth = latestByHour(health);
  const latestLatency = latestByDate(pipeline.latency);
  const latestFailure = latestByDate(pipeline.failures);
  return (
    <Panel title="Data freshness" description="Newest observed dates from each configured source; this is freshness, not a claim that all source rows are complete." source={<SourceTag>Source timestamps</SourceTag>}>
      <SimpleTable columns={["Dataset", "Latest observed", "Read"]} caption="Analytics data freshness">
        <TableRow><TableCell>App health</TableCell><TableCell muted>{latestHealth?.hour ?? "No data"}</TableCell><TableCell><SourceTag tone={latestHealth ? "live" : "neutral"}>{latestHealth ? "present" : "absent"}</SourceTag></TableCell></TableRow>
        <TableRow><TableCell>AI latency</TableCell><TableCell muted>{latestLatency?.date ?? "No data"}</TableCell><TableCell><SourceTag tone={latestLatency ? "live" : "neutral"}>{latestLatency ? "present" : "absent"}</SourceTag></TableCell></TableRow>
        <TableRow><TableCell>AI failures</TableCell><TableCell muted>{latestFailure?.date ?? "No data"}</TableCell><TableCell><SourceTag tone={latestFailure ? "live" : "neutral"}>{latestFailure ? "present" : "absent"}</SourceTag></TableCell></TableRow>
      </SimpleTable>
    </Panel>
  );
}

function StatusPanel({ status, error, costs }: { status: { ok: boolean; reason?: string; authMode?: string } | null; error: string | null; costs: TokenCostRow[] }) {
  const knownCost = costs.some((row) => row.pricing_known) ? costs.filter((row) => row.pricing_known).reduce((total, row) => total + row.cost_usd, 0) : undefined;
  return (
    <Panel title="AWS status and cost boundary" description="The status probe performs a real AWS metric read. Product token cost is available when priced; account-level AWS billing is not part of this dashboard contract." source={<SourceTag tone={status?.ok ? "live" : status ? "error" : "neutral"}>{status?.ok ? "AWS reachable" : status ? "AWS unavailable" : "Checking"}</SourceTag>}>
      <div className="grid gap-0 divide-y divide-[var(--console-rule)]">
        <div className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5"><div><p className="text-xs font-medium text-[var(--console-ink)]">Metric path</p><p className="mt-1 text-[11px] text-[var(--console-muted)]">{error ?? status?.reason ?? (status ? `Authenticated via ${status.authMode ?? "configured path"}` : "Waiting for probe")}</p></div><SourceTag tone={status?.ok ? "live" : status ? "error" : "neutral"}>{status?.ok ? "healthy" : status ? "unavailable" : "pending"}</SourceTag></div>
        <div className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5"><div><p className="text-xs font-medium text-[var(--console-ink)]">Known-price token estimate</p><p className="mt-1 text-[11px] text-[var(--console-muted)]">Observed model usage in the selected product window</p></div><span className="tabular text-sm font-semibold text-[var(--console-ink)]">{knownCost == null ? "No data" : `$${knownCost.toFixed(4)}`}</span></div>
        <div className="px-4 py-3 text-xs leading-5 text-[var(--console-muted)] sm:px-5">AWS account billing and infrastructure spend are intentionally not inferred from token usage. Connect an approved billing contract before displaying those values.</div>
      </div>
    </Panel>
  );
}

export default function SystemPage() {
  const [productRange, setProductRange] = React.useState<ConsoleRange>("30d");
  const [platform, setPlatform] = React.useState("all");
  const productWindow = React.useMemo(() => {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromDate = new Date(`${to}T00:00:00Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - Number(productRange.slice(0, -1)) + 1);
    return { from: fromDate.toISOString().slice(0, 10), to };
  }, [productRange]);
  const systemBundle = useMetricBundle(SYSTEM_METRICS, productWindow.from, productWindow.to);
  const health = (systemBundle.data?.app_health ?? []) as AppHealthRow[];
  const latency = (systemBundle.data?.ai_latency ?? []) as LatencyRow[];
  const failures = (systemBundle.data?.ai_failure_rate ?? []) as FailureRow[];
  const costs = (systemBundle.data?.token_cost_daily ?? []) as TokenCostRow[];
  const metricErrors = Object.values(systemBundle.errors).filter((error): error is string => Boolean(error));
  const status = systemBundle.loading
    ? null
    : {
        ok: !systemBundle.error && metricErrors.length === 0,
        reason: systemBundle.error ?? metricErrors[0],
        authMode: "aws",
      };
  const count = health.length ? health.reduce((total, row) => total + row.count, 0) : undefined;
  const latestP95 = latestByDate(latency)?.p95_ms;
  const failureCount = failures.length ? failures.reduce((total, row) => total + row.failure_count, 0) : undefined;

  return (
    <ConsolePage>
      <PageIntro eyebrow="Operate / System" title="System" description="Health buckets, AI-pipeline freshness, cost boundaries, and a guarded manual snapshot control. Health and pipeline metrics use the selected window.">
        <div className="grid gap-3 sm:justify-items-end">
          <RangeControl value={productRange} onChange={setProductRange} label="Pipeline window" options={["7d", "30d", "90d"]} />
          <ScopeControls values={{ platform }} onChange={(name, value) => name === "platform" && setPlatform(value)} supported={{ platform: true, locale: false, mealMode: false }} />
        </div>
      </PageIntro>

      <div className="mt-6 grid gap-3">
        <MetricRibbon items={[
          { label: "Health observations", value: formatNumber(count), detail: "selected product window", tone: count == null ? "ink" : "green", loading: systemBundle.loading, error: metricError(systemBundle, "app_health") },
          { label: "Latest p95", value: formatDuration(latestP95), detail: "selected product window", tone: "blue", loading: systemBundle.loading, error: metricError(systemBundle, "ai_latency") },
          { label: "Failure observations", value: formatNumber(failureCount), detail: "controlled AI failures", tone: failureCount == null ? "ink" : "amber", loading: systemBundle.loading, error: metricError(systemBundle, "ai_failure_rate") },
          { label: "Health buckets", value: formatNumber(health.length || undefined), detail: "UTC hour × dimension", loading: systemBundle.loading, error: metricError(systemBundle, "app_health") },
        ]} />

        <Panel title="Application health buckets" description="Controlled health events grouped by UTC hour, platform, and dimension. Select a platform only for this panel." source={<SourceTag tone={health.length ? "live" : "neutral"}>AWS aggregate</SourceTag>}>
          <MetricState loading={systemBundle.loading} error={metricError(systemBundle, "app_health")} empty={health.length === 0} emptyMessage="No app-health rows were returned for the selected window. This is an absence state, not an inferred healthy signal.">
            <HealthTable rows={health.slice().sort((a, b) => b.hour.localeCompare(a.hour)).slice(0, 48)} platform={platform} />
          </MetricState>
        </Panel>

        <div className="grid gap-3 xl:grid-cols-2">
          <FreshnessPanel health={health} pipeline={{ latency, failures }} />
          <StatusPanel status={status} error={null} costs={costs} />
        </div>

        <Panel title="Manual snapshot control" description="Operator action against the existing run endpoint. The server-authoritative 30-minute guard is shared across tabs and devices; endpoint authorization remains authoritative." source={<SourceTag tone="warn">Operator action</SourceTag>}>
          <RunControl />
        </Panel>
        <InlineNote tone="plain">Locale and meal-mode selectors are intentionally marked “Not segmented” for System. Platform filtering applies only to the health bucket table; other panels retain their source-defined scope.</InlineNote>
      </div>
    </ConsolePage>
  );
}
