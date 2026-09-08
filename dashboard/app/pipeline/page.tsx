import { getCachedSelectedMetrics } from "@/app/lib/api";
import { Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { TimeSeriesChart } from "@/components/console/time-series-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const PIPELINE_METRICS = ["ai_latency", "ai_failure_rate", "token_cost_daily"] as const;

export default async function PipelinePage() {
  const to = new Date().toISOString().slice(0, 10);
  const bundle = await getCachedSelectedMetrics(PIPELINE_METRICS, "2000-01-01", to);
  const errors = Object.entries(bundle.errors).map(([metric, error]) => `${metric}: ${error}`);
  const latency = bundle.data.ai_latency ?? [];
  const failureRows = bundle.data.ai_failure_rate ?? [];
  const costRows = bundle.data.token_cost_daily ?? [];
  const calls = latency.reduce((sum, row) => sum + row.call_count, 0);
  const events = failureRows.reduce((sum, row) => sum + row.event_count, 0);
  const failures = failureRows.reduce((sum, row) => sum + row.failure_count, 0);
  const tokens = costRows.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0);
  const cost = costRows.filter((row) => row.pricing_known).reduce((sum, row) => sum + row.cost_usd, 0);

  const latencyDays = new Map<string, { date: string; p50: number; p95: number; p99?: number }>();
  for (const row of latency) {
    const current = latencyDays.get(row.date);
    latencyDays.set(row.date, {
      date: row.date,
      p50: Math.max(current?.p50 ?? 0, row.p50_ms),
      p95: Math.max(current?.p95 ?? 0, row.p95_ms),
      p99: row.p99_ms == null ? current?.p99 : Math.max(current?.p99 ?? 0, row.p99_ms),
    });
  }
  const failureDays = new Map<string, { date: string; rate: number; failures: number; events: number }>();
  for (const row of failureRows) {
    const current = failureDays.get(row.date) ?? { date: row.date, rate: 0, failures: 0, events: 0 };
    current.failures += row.failure_count;
    current.events += row.event_count;
    current.rate = current.events ? current.failures / current.events : 0;
    failureDays.set(row.date, current);
  }
  const tokenDays = new Map<string, { date: string; tokens: number; cost: number }>();
  for (const row of costRows) {
    const current = tokenDays.get(row.date) ?? { date: row.date, tokens: 0, cost: 0 };
    current.tokens += row.input_tokens + row.output_tokens;
    if (row.pricing_known) current.cost += row.cost_usd;
    tokenDays.set(row.date, current);
  }
  const sortByDate = <T extends { date: string }>(rows: T[]) => rows.sort((left, right) => left.date.localeCompare(right.date));
  const latencyTrend = sortByDate([...latencyDays.values()]);
  const failureTrend = sortByDate([...failureDays.values()]);
  const tokenTrend = sortByDate([...tokenDays.values()]);
  const latestLatency = latencyTrend.at(-1);

  const stats: Stat[] = [
    { label: "AI calls", value: number(calls), denom: "curated telemetry" },
    { label: "Latest p95", value: number(latestLatency?.p95 ?? 0), unit: "ms", denom: latestLatency?.date ?? "no latency rows" },
    { label: "Latest p99", value: latestLatency?.p99 == null ? "Pending" : number(latestLatency.p99), unit: latestLatency?.p99 == null ? undefined : "ms", denom: "available after next snapshot" },
    { label: "Failure rate", value: percent(events ? failures / events : 0), denom: `${number(failures)} of ${number(events)} events` },
    { label: "Token volume", value: number(tokens), denom: "input + output" },
    { label: "Known cost", value: `$${cost.toFixed(4)}`, denom: "configured prices" },
  ];

  return (
    <>
      <PageHeader title="Pipeline overview" sub={`AI pipeline trends · API Gateway → Lambda → DynamoDB · ${to}`} />
      <StatRow stats={stats} />
      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}

      <div className="mt-3 grid gap-3">
        <Card>
          <CardHeader><div><CardTitle>Latency trend</CardTitle><CardDescription className="mt-1">Highest observed model percentile for each UTC day</CardDescription></div><CardAction><Badge variant="outline">p50 · p95 · p99</Badge></CardAction></CardHeader>
          <CardContent>{latencyTrend.length ? <TimeSeriesChart data={latencyTrend} series={[{ key: "p50", label: "p50", color: "var(--console-green)" }, { key: "p95", label: "p95", color: "var(--console-blue)" }, { key: "p99", label: "p99", color: "var(--console-brick)" }]} ariaLabel="AI latency percentiles over time" format="duration" /> : <Note tone="plain">No latency rows were present in the latest snapshot.</Note>}</CardContent>
        </Card>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card><CardHeader><div><CardTitle>Failure rate trend</CardTitle><CardDescription className="mt-1">Weighted controlled failures across providers and models</CardDescription></div></CardHeader><CardContent>{failureTrend.length ? <TimeSeriesChart data={failureTrend} series={[{ key: "rate", label: "Failure rate", color: "var(--console-brick)" }]} ariaLabel="AI failure rate over time" format="percent" /> : <Note tone="plain">No failure rows were present in the latest snapshot.</Note>}</CardContent></Card>
          <Card><CardHeader><div><CardTitle>Token volume trend</CardTitle><CardDescription className="mt-1">Input and output tokens combined by UTC day</CardDescription></div></CardHeader><CardContent>{tokenTrend.length ? <TimeSeriesChart data={tokenTrend} series={[{ key: "tokens", label: "Tokens", color: "var(--console-blue)" }]} ariaLabel="AI token volume over time" /> : <Note tone="plain">No token rows were present in the latest snapshot.</Note>}</CardContent></Card>
        </div>
      </div>

      <Card className="mt-3" id="history">
        <CardHeader><div><CardTitle>Pipeline execution path</CardTitle><CardDescription className="mt-1">The deployed assessment path represented by these aggregates</CardDescription></div><CardAction><Badge>live</Badge></CardAction></CardHeader>
        <CardContent className="grid gap-3 text-sm leading-relaxed md:grid-cols-4">
          <Note tone="plain"><b>1 · Extract</b><br />Six restricted operational views are written to raw S3 JSONL.</Note>
          <Note tone="plain"><b>2 · Transform</b><br />Glue produces curated Parquet and thirteen operational aggregates.</Note>
          <Note tone="plain"><b>3 · Load</b><br />The loader Lambda writes serving records into DynamoDB.</Note>
          <Note tone="plain"><b>4 · Serve</b><br />API Gateway authorizes the dashboard before invoking Lambda.</Note>
        </CardContent>
      </Card>
    </>
  );
}
