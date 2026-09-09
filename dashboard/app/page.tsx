"use client";

import * as React from "react";
import type { DauWauRow, FailureRow, LatencyRow, MatchRateRow, TokenCostRow } from "@/app/lib/types";
import {
  ConsolePage,
  formatDuration,
  formatNumber,
  formatPercent,
  latestByDate,
  MetricRibbon,
  MetricState,
  PageIntro,
  Panel,
  RangeControl,
  SourceTag,
  InlineNote,
  rangeWindow,
  type ConsoleRange,
} from "@/components/console/console";
import { useMetricBundle } from "@/lib/use-metric-bundle";
import { TimeSeriesChart } from "@/components/console/time-series-chart";

const OVERVIEW_METRICS = ["dau_wau", "ai_latency", "ai_failure_rate", "token_cost_daily", "match_rate"] as const;

function metricError(bundle: { error: string | null; errors: Partial<Record<string, string>> }, name: string) {
  return bundle.errors[name] ?? bundle.error;
}

export default function TodayPage() {
  const [range, setRange] = React.useState<ConsoleRange>("30d");
  const pipelineWindow = React.useMemo(() => rangeWindow(range), [range]);
  const pipeline = useMetricBundle(OVERVIEW_METRICS, pipelineWindow.from, pipelineWindow.to);

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
  const costByDate = new Map<string, { date: string; cost: number; models: string[] }>();
  for (const row of costs.filter((item) => item.pricing_known)) {
    const current = costByDate.get(row.date);
    costByDate.set(row.date, {
      date: row.date,
      cost: (current?.cost ?? 0) + row.cost_usd,
      models: [...(current?.models ?? []), `${row.model}: $${row.cost_usd.toFixed(4)}`],
    });
  }
  const costTrend = [...costByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
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
  return (
    <ConsolePage>
      <PageIntro eyebrow="Operational overview" title="Today" description="High-level DAU/WAU context and AI-pipeline performance. Cloud Run system health lives on the System page.">
        <div className="flex flex-wrap items-center gap-2">
          <RangeControl value={range} onChange={setRange} label="Pipeline window" />
        </div>
      </PageIntro>

      <div className="mt-3 grid gap-3">
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

        <div className="grid gap-3">
          <Panel title="Model latency" description="Daily call volume and p50/p95/p99 latency by model." source={<SourceTag>AWS aggregate</SourceTag>}>
            <MetricState loading={pipeline.loading} error={metricError(pipeline, "ai_latency")} empty={latency.length === 0} emptyMessage="No AI latency rows were returned for this window.">
              <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={latencyTrend} series={[{ key: "p50", label: "p50", color: "var(--console-green)" }, { key: "p95", label: "p95", color: "var(--console-blue)" }, { key: "p99", label: "p99", color: "var(--console-brick)" }]} ariaLabel="AI pipeline p50, p95, and p99 latency over time" format="duration" /></div>
              <InlineNote>Each point uses the highest model percentile for that UTC day. p99 appears after the reduced aggregate contract is deployed.</InlineNote>
            </MetricState>
          </Panel>

          <Panel title="AI operating cost" description="Known-price token rows only; this is not total AWS infrastructure spend." source={<SourceTag>AWS aggregate</SourceTag>}>
            <MetricState loading={pipeline.loading} error={metricError(pipeline, "token_cost_daily")} empty={costs.length === 0} emptyMessage="No token-use rows were returned for this window.">
              <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={costTrend} series={[{ key: "cost", label: "Estimated cost", color: "var(--console-amber)" }]} ariaLabel="Estimated AI operating cost over time" format="currency" tooltipDetails={(point) => <ul className="grid gap-1">{((point?.models ?? []) as string[]).map((model) => <li key={model}>{model}</li>)}</ul>} /></div>
              <InlineNote>{cost == null ? "Price unavailable" : `$${cost.toFixed(4)} estimated total`} from {formatNumber(costs.reduce((total, row) => total + row.input_tokens + row.output_tokens, 0))} observed tokens in the selected window.</InlineNote>
            </MetricState>
          </Panel>
        </div>
      </div>
    </ConsolePage>
  );
}
