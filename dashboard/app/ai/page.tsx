"use client";

import * as React from "react";
import type {
  FailureRow,
  LatencyRow,
  TokenCostRow,
} from "@/app/lib/types";
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
  ScopeControls,
  SimpleTable,
  SourceTag,
  TableCell,
  TableRow,
  InlineNote,
  type ConsoleRange,
} from "@/components/console/console";
import { useMetricBundle, type MetricBundleState } from "@/lib/use-metric-bundle";
import { useRequests, type RequestRow } from "@/lib/analytics-hooks";
import { TimeSeriesChart } from "@/components/console/time-series-chart";

const AI_METRICS = [
  "ai_latency",
  "ai_failure_rate",
  "token_cost_daily",
] as const;

function metricError(bundle: MetricBundleState, name: string) {
  return (bundle.errors as Record<string, string | undefined>)[name] ?? bundle.error;
}

function sumRows<T>(rows: T[], getValue: (row: T) => number): number | undefined {
  if (rows.length === 0) return undefined;
  return rows.reduce((total, row) => total + getValue(row), 0);
}

function weightedRate(rows: FailureRow[]): number | undefined {
  const events = sumRows(rows, (row) => row.event_count);
  if (!events) return undefined;
  return (sumRows(rows, (row) => row.failure_count) ?? 0) / events;
}

function LatencyPanel({ rows, state }: { rows: LatencyRow[]; state: MetricBundleState }) {
  const byDate = new Map<string, { date: string; p50: number; p95: number; p99?: number }>();
  for (const row of rows) {
    const previous = byDate.get(row.date);
    byDate.set(row.date, {
      date: row.date,
      p50: Math.max(previous?.p50 ?? 0, row.p50_ms),
      p95: Math.max(previous?.p95 ?? 0, row.p95_ms),
      p99: row.p99_ms == null ? previous?.p99 : Math.max(previous?.p99 ?? 0, row.p99_ms),
    });
  }
  const trend = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  return (
    <Panel title="Latency over time" description="Daily p50, p95 and p99 latency. Each point uses the highest model percentile on that UTC day." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "ai_latency")} empty={rows.length === 0} emptyMessage="No AI latency rows were returned for this window.">
        <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={trend} series={[{ key: "p50", label: "p50", color: "var(--console-green)" }, { key: "p95", label: "p95", color: "var(--console-blue)" }, { key: "p99", label: "p99", color: "var(--console-brick)" }]} ariaLabel="AI pipeline p50, p95 and p99 latency over time" format="duration" /></div>
        <InlineNote>p99 is part of the reduced aggregate contract and appears after the next AWS deployment and snapshot.</InlineNote>
      </MetricState>
    </Panel>
  );
}

function FailurePanel({ rows, state }: { rows: FailureRow[]; state: MetricBundleState }) {
  const byDate = new Map<string, { date: string; events: number; failures: number }>();
  for (const row of rows) {
    const current = byDate.get(row.date) ?? { date: row.date, events: 0, failures: 0 };
    current.events += row.event_count;
    current.failures += row.failure_count;
    byDate.set(row.date, current);
  }
  const trend = [...byDate.values()]
    .map((row) => ({ date: row.date, rate: row.events ? row.failures / row.events : 0 }))
    .sort((left, right) => left.date.localeCompare(right.date));
  return (
    <Panel title="Failure rate over time" description="Daily weighted failure rate, with provider and model detail underneath. No stack content is exposed." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "ai_failure_rate")} empty={rows.length === 0} emptyMessage="No AI failure rows were returned for this window.">
        <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={trend} series={[{ key: "rate", label: "Failure rate", color: "var(--console-brick)" }]} ariaLabel="AI pipeline weighted failure rate over time" format="percent" /></div>
        <SimpleTable columns={["Day", "Provider", "Model", "Events", "Failures", "Rate"]} caption="AI failure observations">
          {rows.slice().reverse().slice(0, 24).map((row) => (
            <TableRow key={`${row.date}-${row.provider}-${row.model}`}>
              <TableCell muted><span className="font-mono text-[11px]">{row.date}</span></TableCell>
              <TableCell>{row.provider}</TableCell>
              <TableCell><span className="font-mono text-[11px]">{row.model}</span></TableCell>
              <TableCell numeric>{formatNumber(row.event_count)}</TableCell>
              <TableCell numeric>{formatNumber(row.failure_count)}</TableCell>
              <TableCell numeric>{formatPercent(row.failure_rate)}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </MetricState>
    </Panel>
  );
}

function CostPanel({ rows, state }: { rows: TokenCostRow[]; state: MetricBundleState }) {
  const knownRows = rows.filter((row) => row.pricing_known);
  const byDate = new Map<string, { date: string; input: number; output: number }>();
  for (const row of rows) {
    const current = byDate.get(row.date) ?? { date: row.date, input: 0, output: 0 };
    current.input += row.input_tokens;
    current.output += row.output_tokens;
    byDate.set(row.date, current);
  }
  const trend = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  return (
    <Panel title="Token use over time" description="Daily input and output token volume. Exact model rows and known-price estimates remain available underneath." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "token_cost_daily")} empty={rows.length === 0} emptyMessage="No token-cost rows were returned for this window.">
        <div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={trend} series={[{ key: "input", label: "Input tokens", color: "var(--console-blue)" }, { key: "output", label: "Output tokens", color: "var(--console-green)" }]} ariaLabel="AI input and output token volume over time" /></div>
        <SimpleTable columns={["Day", "Model", "Input", "Output", "Estimated cost"]} caption="AI token usage and cost">
          {rows.slice().reverse().slice(0, 24).map((row) => (
            <TableRow key={`${row.date}-${row.model}`}>
              <TableCell muted><span className="font-mono text-[11px]">{row.date}</span></TableCell>
              <TableCell><span className="font-mono text-[11px]">{row.model}</span></TableCell>
              <TableCell numeric>{formatNumber(row.input_tokens)}</TableCell>
              <TableCell numeric>{formatNumber(row.output_tokens)}</TableCell>
              <TableCell numeric>{row.pricing_known ? `$${row.cost_usd.toFixed(4)}` : "Price unknown"}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
        {knownRows.length === 0 ? <InlineNote>Pricing is not configured for the observed models, so a dollar estimate is not available.</InlineNote> : null}
      </MetricState>
    </Panel>
  );
}

function RequestPanel({ requests }: { requests: { rows: RequestRow[]; total: number; loading: boolean; error: string | null } }) {
  return (
    <Panel title="Recent pipeline traces" description="Live Supabase RPC rows link the aggregate view back to a bounded, operator-only trace list." source={<SourceTag tone={requests.error ? "warn" : "live"}>Supabase cache</SourceTag>}>
      <MetricState loading={requests.loading} error={requests.error} empty={requests.rows.length === 0} emptyMessage="No cached pipeline trace rows were returned for this window.">
        <SimpleTable columns={["Request", "UTC", "Meal items", "Duration", "Verdicts", "Trace"]} caption="Recent pipeline requests">
          {requests.rows.slice(0, 12).map((row) => (
            <TableRow key={row[9]}>
              <TableCell><span className="font-mono text-[11px]">{row[0]}</span></TableCell>
              <TableCell muted><span className="font-mono text-[11px]">{row[1]} {row[2]}</span></TableCell>
              <TableCell className="max-w-52 truncate">{row[3]}</TableCell>
              <TableCell numeric>{formatDuration(row[4])}</TableCell>
              <TableCell numeric muted>{formatNumber(row[5])} total · {formatNumber(row[6])} accepted</TableCell>
              <TableCell><a className="text-[var(--console-blue)] underline-offset-2 hover:underline" href={`/trace?request=${encodeURIComponent(row[9])}`}>Open</a></TableCell>
            </TableRow>
          ))}
        </SimpleTable>
        {requests.total > requests.rows.length ? <InlineNote>{formatNumber(requests.total)} total trace rows are available through the cached RPC; this panel shows the first page.</InlineNote> : null}
      </MetricState>
    </Panel>
  );
}

export default function AiPage() {
  const [range, setRange] = React.useState<ConsoleRange>("30d");
  const [platform, setPlatform] = React.useState("all");
  const window = React.useMemo(() => {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromDate = new Date(`${to}T00:00:00Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - Number(range.slice(0, -1)) + 1);
    return { from: fromDate.toISOString().slice(0, 10), to };
  }, [range]);
  const bundle = useMetricBundle(AI_METRICS, window.from, window.to);
  const latency = (bundle.data?.ai_latency ?? []) as LatencyRow[];
  const failures = (bundle.data?.ai_failure_rate ?? []) as FailureRow[];
  const costs = (bundle.data?.token_cost_daily ?? []) as TokenCostRow[];
  const requests = useRequests(range, 12);
  const latestLatency = latestByDate(latency);
  const callCount = sumRows(latency, (row) => row.call_count);
  const failureRate = weightedRate(failures);
  const knownCost = costs.some((row) => row.pricing_known) ? sumRows(costs.filter((row) => row.pricing_known), (row) => row.cost_usd) : undefined;

  return (
    <ConsolePage>
      <PageIntro eyebrow="Operate / AI" title="AI" description="Model latency, failures, token use, estimated cost, and bounded pipeline traces. No user-journey or meal-conversion analytics are collected.">
        <div className="grid gap-3 sm:justify-items-end">
          <RangeControl value={range} onChange={setRange} label="Pipeline window" options={["7d", "30d", "90d"]} />
          <ScopeControls values={{ platform }} onChange={(name, value) => name === "platform" && setPlatform(value)} supported={{ platform: false, locale: false, mealMode: false }} />
        </div>
      </PageIntro>

      <div className="mt-6 grid gap-3">
        <MetricRibbon items={[
          { label: "AI calls", value: formatNumber(callCount), detail: "curated latency rows", loading: bundle.loading, error: metricError(bundle, "ai_latency") },
          { label: "Latest p95", value: formatDuration(latestLatency?.p95_ms), detail: latestLatency ? `${latestLatency.model} · ${latestLatency.date}` : "No latency rows", tone: "blue", loading: bundle.loading, error: metricError(bundle, "ai_latency") },
          { label: "Failure rate", value: formatPercent(failureRate), detail: "weighted observed events", tone: failureRate == null ? "ink" : failureRate > 0 ? "amber" : "green", loading: bundle.loading, error: metricError(bundle, "ai_failure_rate") },
          { label: "Known cost", value: knownCost == null ? "Price unavailable" : `$${knownCost.toFixed(4)}`, detail: "configured model prices", tone: "ink", loading: bundle.loading, error: metricError(bundle, "token_cost_daily") },
        ]} />

        <Panel title="Observed cost" description="Known-price model rows in the selected window; not an AWS account-cost estimate." source={<SourceTag>AWS aggregate</SourceTag>}>
            <MetricState loading={bundle.loading} error={metricError(bundle, "token_cost_daily")} empty={costs.length === 0} emptyMessage="No token-cost rows were returned for this window.">
              <div className="px-4 py-5 sm:px-5"><p className="text-3xl font-semibold tracking-[-0.04em] text-[var(--console-ink)]">{knownCost == null ? "No data" : `$${knownCost.toFixed(4)}`}</p><p className="mt-2 text-xs leading-5 text-[var(--console-muted)]">Known-price rows only. Token counts and pricing coverage are shown below.</p></div>
              <InlineNote>Infrastructure spend is not included in this product metric contract; System calls that out separately.</InlineNote>
            </MetricState>
        </Panel>

        <div className="grid gap-3 xl:grid-cols-2">
          <LatencyPanel rows={latency} state={bundle} />
          <FailurePanel rows={failures} state={bundle} />
        </div>
        <CostPanel rows={costs} state={bundle} />
        <RequestPanel requests={requests} />
        <InlineNote tone="plain">Platform, locale, and meal-mode selectors are intentionally marked “Not segmented”: the current AI aggregate payloads do not carry those dimensions.</InlineNote>
      </div>
    </ConsolePage>
  );
}
