"use client";

import * as React from "react";
import type { FailureRow, LatencyRow, TokenCostRow } from "@/app/lib/types";
import {
  ConsolePage, formatDuration, formatNumber, formatPercent, InlineNote,
  latestByDate, MetricRibbon, MetricState, PageIntro, Panel, RangeControl,
  RefreshButton, SimpleTable, SourceTag, TableCell, TableRow, rangeWindow,
  type ConsoleRange,
} from "@/components/console/console";
import { TimeSeriesChart } from "@/components/console/time-series-chart";
import { useRequests, type RequestRow } from "@/lib/analytics-hooks";
import { useMetricBundle, type MetricBundleState } from "@/lib/use-metric-bundle";

const AI_METRICS = ["ai_latency", "ai_failure_rate", "token_cost_daily"] as const;
type Detail = { label: string; value: string };
type TrendPoint = { date: string; details: Detail[] } & Record<string, unknown>;

function metricError(bundle: MetricBundleState, name: string) {
  return (bundle.errors as Record<string, string | undefined>)[name] ?? bundle.error;
}

function detailList(rows: Detail[]) {
  return <div className="grid gap-1">{rows.map((row) => <div key={`${row.label}-${row.value}`} className="flex min-w-56 justify-between gap-4"><span>{row.label}</span><span className="font-mono text-[var(--console-ink)]">{row.value}</span></div>)}</div>;
}

function CallsPanel({ rows, state }: { rows: LatencyRow[]; state: MetricBundleState }) {
  const grouped = new Map<string, LatencyRow[]>();
  for (const row of rows) grouped.set(row.date, [...(grouped.get(row.date) ?? []), row]);
  const trend: TrendPoint[] = [...grouped].map(([date, dayRows]) => ({
    date,
    calls: dayRows.reduce((sum, row) => sum + row.call_count, 0),
    details: dayRows.map((row) => ({ label: row.model, value: `${formatNumber(row.call_count)} calls` })),
  })).sort((a, b) => a.date.localeCompare(b.date));
  return <Panel title="AI calls over time" description="Completed model-call observations per UTC day; hover for the model split." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={state.loading} error={metricError(state, "ai_latency")} empty={trend.length === 0} emptyMessage="No AI call rows were returned for this window."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={trend} series={[{ key: "calls", label: "AI calls", color: "var(--console-blue)" }]} ariaLabel="AI calls over time" tooltipDetails={(point) => detailList((point?.details ?? []) as Detail[])} /></div></MetricState></Panel>;
}

function LatencyPanel({ rows, state }: { rows: LatencyRow[]; state: MetricBundleState }) {
  const grouped = new Map<string, LatencyRow[]>();
  for (const row of rows) grouped.set(row.date, [...(grouped.get(row.date) ?? []), row]);
  const trend: TrendPoint[] = [...grouped].map(([date, dayRows]) => ({
    date,
    p50: Math.max(...dayRows.map((row) => row.p50_ms)),
    p95: Math.max(...dayRows.map((row) => row.p95_ms)),
    p99: Math.max(...dayRows.map((row) => row.p99_ms ?? 0)),
    details: dayRows.map((row) => ({ label: row.model, value: `p95 ${formatDuration(row.p95_ms)} · n=${row.call_count}` })),
  })).sort((a, b) => a.date.localeCompare(b.date));
  return <Panel title="Latency over time" description="Highest daily model percentile; hover for each model's p95 and sample." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={state.loading} error={metricError(state, "ai_latency")} empty={trend.length === 0} emptyMessage="No AI latency rows were returned for this window."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={trend} series={[{ key: "p50", label: "p50", color: "var(--console-green)" }, { key: "p95", label: "p95", color: "var(--console-blue)" }, { key: "p99", label: "p99", color: "var(--console-brick)" }]} ariaLabel="AI latency percentiles over time" format="duration" tooltipDetails={(point) => detailList((point?.details ?? []) as Detail[])} /></div></MetricState></Panel>;
}

function FailurePanel({ rows, state }: { rows: FailureRow[]; state: MetricBundleState }) {
  const grouped = new Map<string, FailureRow[]>();
  for (const row of rows) grouped.set(row.date, [...(grouped.get(row.date) ?? []), row]);
  const trend: TrendPoint[] = [...grouped].map(([date, dayRows]) => {
    const events = dayRows.reduce((sum, row) => sum + row.event_count, 0);
    const failures = dayRows.reduce((sum, row) => sum + row.failure_count, 0);
    return { date, rate: events ? failures / events : 0, details: dayRows.map((row) => ({ label: `${row.provider} · ${row.model}`, value: `${row.failure_count}/${row.event_count} · ${formatPercent(row.failure_rate)}` })) };
  }).sort((a, b) => a.date.localeCompare(b.date));
  return <Panel title="Failure rate over time" description="Weighted controlled failures; hover for provider and model counts." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={state.loading} error={metricError(state, "ai_failure_rate")} empty={trend.length === 0} emptyMessage="No AI failure rows were returned for this window."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={trend} series={[{ key: "rate", label: "Failure rate", color: "var(--console-brick)" }]} ariaLabel="AI failure rate over time" format="percent" tooltipDetails={(point) => detailList((point?.details ?? []) as Detail[])} /></div></MetricState></Panel>;
}

function TokenPanel({ rows, state }: { rows: TokenCostRow[]; state: MetricBundleState }) {
  const grouped = new Map<string, TokenCostRow[]>();
  for (const row of rows) grouped.set(row.date, [...(grouped.get(row.date) ?? []), row]);
  const trend: TrendPoint[] = [...grouped].map(([date, dayRows]) => ({
    date,
    input: dayRows.reduce((sum, row) => sum + row.input_tokens, 0),
    output: dayRows.reduce((sum, row) => sum + row.output_tokens, 0),
    details: dayRows.map((row) => ({ label: row.model, value: `${formatNumber(row.input_tokens)} in · ${formatNumber(row.output_tokens)} out${row.pricing_known ? ` · $${row.cost_usd.toFixed(4)}` : " · price unknown"}` })),
  })).sort((a, b) => a.date.localeCompare(b.date));
  return <Panel title="Token use over time" description="Observed input and output tokens; hover for model usage and the rate-card estimate." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={state.loading} error={metricError(state, "token_cost_daily")} empty={trend.length === 0} emptyMessage="No token rows were returned for this window."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={trend} series={[{ key: "input", label: "Input tokens", color: "var(--console-blue)" }, { key: "output", label: "Output tokens", color: "var(--console-green)" }]} ariaLabel="AI token use over time" tooltipDetails={(point) => detailList((point?.details ?? []) as Detail[])} /></div><InlineNote>Cost is an estimate from observed tokens and configured model rates, not Google billing data.</InlineNote></MetricState></Panel>;
}

function RequestPanel({ requests }: { requests: { rows: RequestRow[]; total: number; loading: boolean; error: string | null } }) {
  return <Panel title="Exact AI meal traces" description="Bounded Supabase RPC results for individual meal calls." source={<SourceTag tone={requests.error ? "warn" : "live"}>Supabase RPC</SourceTag>}><MetricState loading={requests.loading} error={requests.error} empty={requests.rows.length === 0} emptyMessage="No exact trace rows were recorded in this window. The RPC succeeded; the trace tables may still be empty."><SimpleTable columns={["Request", "UTC", "Meal", { label: "Duration", align: "right" }, { label: "Verdicts", align: "right" }, "Trace"]} caption="Recent AI meal traces">{requests.rows.slice(0, 12).map((row) => <TableRow key={row[9]}><TableCell><span className="font-mono text-[11px]">{row[0]}</span></TableCell><TableCell muted><span className="font-mono text-[11px]">{row[1]} {row[2]}</span></TableCell><TableCell className="max-w-52 truncate">{row[3]}</TableCell><TableCell numeric>{formatDuration(row[4])}</TableCell><TableCell numeric muted>{formatNumber(row[5])} · {formatNumber(row[6])} accepted</TableCell><TableCell><a className="text-[var(--console-blue)] hover:underline" href={`/trace?request=${encodeURIComponent(row[9])}`}>Open</a></TableCell></TableRow>)}</SimpleTable></MetricState></Panel>;
}

export default function AiPage() {
  const [range, setRange] = React.useState<ConsoleRange>("30d");
  const window = React.useMemo(() => rangeWindow(range), [range]);
  const bundle = useMetricBundle(AI_METRICS, window.from, window.to);
  const requests = useRequests(range, 12);
  const latency = (bundle.data?.ai_latency ?? []) as LatencyRow[];
  const failures = (bundle.data?.ai_failure_rate ?? []) as FailureRow[];
  const costs = (bundle.data?.token_cost_daily ?? []) as TokenCostRow[];
  const latestLatency = latestByDate(latency);
  const failureEvents = failures.reduce((sum, row) => sum + row.event_count, 0);
  const failureCount = failures.reduce((sum, row) => sum + row.failure_count, 0);
  const knownCost = costs.filter((row) => row.pricing_known).reduce((sum, row) => sum + row.cost_usd, 0);
  const hasKnownCost = costs.some((row) => row.pricing_known);

  return <ConsolePage><PageIntro eyebrow="AI" title="AI" description="AI call volume, latency, failures, tokens, estimated cost, and exact meal-call traces."><div className="flex flex-wrap items-center gap-2"><RangeControl value={range} onChange={setRange} label="Window" /><RefreshButton refreshing={bundle.refreshing || requests.refreshing} onClick={() => { bundle.refresh(); requests.refresh(); }} /></div></PageIntro><div className="mt-3 grid gap-3"><MetricRibbon items={[
    { label: "Latest p95", value: formatDuration(latestLatency?.p95_ms), detail: latestLatency?.date ?? "No latency row", tone: "blue", loading: bundle.loading, error: metricError(bundle, "ai_latency") },
    { label: "Failure rate", value: formatPercent(failureEvents ? failureCount / failureEvents : undefined), detail: failureEvents ? `${failureCount} of ${failureEvents} events` : "No failure rows", tone: failureCount ? "amber" : "green", loading: bundle.loading, error: metricError(bundle, "ai_failure_rate") },
    { label: "Estimated cost", value: hasKnownCost ? `$${knownCost.toFixed(4)}` : "Price unavailable", detail: "token rate card", loading: bundle.loading, error: metricError(bundle, "token_cost_daily") },
    { label: "Exact traces", value: formatNumber(requests.total || undefined), detail: "Supabase RPC rows", loading: requests.loading, error: requests.error },
  ]} /><CallsPanel rows={latency} state={bundle} /><LatencyPanel rows={latency} state={bundle} /><FailurePanel rows={failures} state={bundle} /><TokenPanel rows={costs} state={bundle} /><RequestPanel requests={requests} /></div></ConsolePage>;
}
