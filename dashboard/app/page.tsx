"use client";

import * as React from "react";
import type { AppHealthRow, DauWauRow, FailureRow, LatencyRow, MatchRateRow, TokenCostRow } from "@/app/lib/types";
import {
  ConsolePage,
  formatDuration,
  formatNumber,
  formatPercent,
  HealthTable,
  latestByDate,
  MetricRibbon,
  MetricState,
  PageIntro,
  Panel,
  RangeControl,
  ScopeControls,
  SourceTag,
  InlineNote,
  type ConsoleRange,
} from "@/components/console/console";
import { useMetricBundle } from "@/lib/use-metric-bundle";
import { TimeSeriesChart } from "@/components/console/time-series-chart";

const OVERVIEW_METRICS = ["dau_wau", "ai_latency", "ai_failure_rate", "token_cost_daily", "match_rate", "app_health"] as const;

function metricError(bundle: { error: string | null; errors: Partial<Record<string, string>> }, name: string) {
  return bundle.errors[name] ?? bundle.error;
}

export default function TodayPage() {
  const [range, setRange] = React.useState<ConsoleRange>("30d");
  const [platform, setPlatform] = React.useState("all");
  const pipelineWindow = React.useMemo(() => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(`${to}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - Number(range.slice(0, -1)) + 1);
    return { from: from.toISOString().slice(0, 10), to };
  }, [range]);
  const pipeline = useMetricBundle(OVERVIEW_METRICS, pipelineWindow.from, pipelineWindow.to);

  const healthRows = (pipeline.data?.app_health ?? []) as AppHealthRow[];
  const usage = (pipeline.data?.dau_wau ?? []) as DauWauRow[];
  const latency = (pipeline.data?.ai_latency ?? []) as LatencyRow[];
  const failures = (pipeline.data?.ai_failure_rate ?? []) as FailureRow[];
  const costs = (pipeline.data?.token_cost_daily ?? []) as TokenCostRow[];
  const matches = (pipeline.data?.match_rate ?? []) as MatchRateRow[];
  const latestLatency = latestByDate(latency);
  const latestMatch = latestByDate(matches);
  const latestUsage = latestByDate(usage);
  const calls = latency.length ? latency.reduce((total, row) => total + row.call_count, 0) : undefined;
  const events = failures.reduce((total, row) => total + row.event_count, 0);
  const failed = failures.reduce((total, row) => total + row.failure_count, 0);
  const cost = costs.some((row) => row.pricing_known)
    ? costs.filter((row) => row.pricing_known).reduce((total, row) => total + row.cost_usd, 0)
    : undefined;
  const latencyByDate = new Map<string, { date: string; p50: number; p95: number; p99?: number }>();
  for (const row of latency) {
    const current = latencyByDate.get(row.date);
    latencyByDate.set(row.date, {
      date: row.date,
      p50: Math.max(current?.p50 ?? 0, row.p50_ms),
      p95: Math.max(current?.p95 ?? 0, row.p95_ms),
      p99: row.p99_ms == null ? current?.p99 : Math.max(current?.p99 ?? 0, row.p99_ms),
    });
  }
  const latencyTrend = [...latencyByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const healthByHour = new Map<string, number>();
  for (const row of healthRows) {
    if (platform !== "all" && row.platform !== platform) continue;
    healthByHour.set(row.hour, (healthByHour.get(row.hour) ?? 0) + row.count);
  }
  const healthTrend = [...healthByHour]
    .map(([date, eventCount]) => ({ date: date.replace("T", " ").replace(/:00:00(?:Z)?$/, ":00"), eventCount }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return (
    <ConsolePage>
      <PageIntro eyebrow="Operational overview" title="Today" description="High-level DAU/WAU context, application health, and AI-pipeline performance. Funnels, retention analysis, journeys, meal trends, and user-level drilldowns are outside this analytics plane.">
        <div className="grid gap-3 sm:justify-items-end">
          <RangeControl value={range} onChange={setRange} label="Pipeline window" options={["7d", "30d", "90d"]} />
          <ScopeControls values={{ platform }} onChange={(name, value) => name === "platform" && setPlatform(value)} supported={{ platform: true, locale: false, mealMode: false }} />
        </div>
      </PageIntro>

      <div className="mt-6 grid gap-3">
        <MetricRibbon items={[
          { label: "DAU", value: formatNumber(latestUsage?.dau), detail: latestUsage?.date ?? "No activity row", loading: pipeline.loading, error: metricError(pipeline, "dau_wau") },
          { label: "WAU", value: formatNumber(latestUsage?.wau), detail: "active meal loggers", tone: "blue", loading: pipeline.loading, error: metricError(pipeline, "dau_wau") },
          { label: "AI calls", value: formatNumber(calls), detail: `${range} operational window`, loading: pipeline.loading, error: metricError(pipeline, "ai_latency") },
          { label: "AI failure rate", value: formatPercent(events ? failed / events : undefined), detail: events ? `${formatNumber(failed)} of ${formatNumber(events)} events` : "No failure rows", tone: failed ? "amber" : "green", loading: pipeline.loading, error: metricError(pipeline, "ai_failure_rate") },
          { label: "Latest match rate", value: formatPercent(latestMatch?.match_rate), detail: latestMatch?.date ?? "No matching rows", tone: "blue", loading: pipeline.loading, error: metricError(pipeline, "match_rate") },
        ]} />

        <Panel title="Active usage over time" description="DAU and rolling WAU are aggregate context only; no user journey or individual profile is exposed." source={<SourceTag>AWS aggregate</SourceTag>}>
          <MetricState loading={pipeline.loading} error={metricError(pipeline, "dau_wau")} empty={usage.length === 0} emptyMessage="No aggregate usage rows were returned for this window.">
            <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={usage} series={[{ key: "dau", label: "DAU", color: "var(--console-green)" }, { key: "wau", label: "WAU", color: "var(--console-blue)" }]} ariaLabel="Daily active and weekly active users over time" /></div>
          </MetricState>
        </Panel>

        <Panel title="Application health" description="Controlled crash, API-failure, health-check and performance buckets; no error text, stack traces or actor identifiers." source={<SourceTag tone={healthRows.length ? "live" : "neutral"}>AWS aggregate</SourceTag>}>
          <MetricState loading={pipeline.loading} error={metricError(pipeline, "app_health")} empty={healthRows.length === 0} emptyMessage="No app-health events were returned for the selected window.">
            <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={healthTrend} series={[{ key: "eventCount", label: "Health events", color: "var(--console-brick)" }]} ariaLabel="Application health events by UTC hour" /></div>
            <HealthTable rows={healthRows.slice().sort((a, b) => b.hour.localeCompare(a.hour)).slice(0, 24)} platform={platform} />
          </MetricState>
        </Panel>

        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Model latency" description="Daily call volume and p50/p95/p99 latency by model." source={<SourceTag>AWS aggregate</SourceTag>}>
            <MetricState loading={pipeline.loading} error={metricError(pipeline, "ai_latency")} empty={latency.length === 0} emptyMessage="No AI latency rows were returned for this window.">
              <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={latencyTrend} series={[{ key: "p50", label: "p50", color: "var(--console-green)" }, { key: "p95", label: "p95", color: "var(--console-blue)" }, { key: "p99", label: "p99", color: "var(--console-brick)" }]} ariaLabel="AI pipeline p50, p95, and p99 latency over time" format="duration" /></div>
              <InlineNote>Each point uses the highest model percentile for that UTC day. p99 appears after the reduced aggregate contract is deployed.</InlineNote>
            </MetricState>
          </Panel>

          <Panel title="AI operating cost" description="Known-price token rows only; this is not total AWS infrastructure spend." source={<SourceTag>AWS aggregate</SourceTag>}>
            <MetricState loading={pipeline.loading} error={metricError(pipeline, "token_cost_daily")} empty={costs.length === 0} emptyMessage="No token-use rows were returned for this window.">
              <div className="px-4 py-5 sm:px-5"><p className="text-3xl font-semibold tracking-[-0.04em]">{cost == null ? "Price unavailable" : `$${cost.toFixed(4)}`}</p><p className="mt-2 text-xs text-[var(--console-muted)]">Latest p95: {formatDuration(latestLatency?.p95_ms)} · {latestLatency?.model ?? "no model row"}</p></div>
              <InlineNote>{formatNumber(costs.reduce((total, row) => total + row.input_tokens + row.output_tokens, 0))} observed input and output tokens in the selected window.</InlineNote>
            </MetricState>
          </Panel>
        </div>
      </div>
    </ConsolePage>
  );
}
