import { getCachedDashboardMetrics } from "@/app/lib/api";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default async function PipelinePage() {
  const to = new Date().toISOString().slice(0, 10);
  const { data, errors } = await getCachedDashboardMetrics("2000-01-01", to);

  const calls = data.ai_latency.reduce((sum, row) => sum + row.call_count, 0);
  const events = data.ai_failure_rate.reduce((sum, row) => sum + row.event_count, 0);
  const failures = data.ai_failure_rate.reduce((sum, row) => sum + row.failure_count, 0);
  const cost = data.token_cost_daily.reduce((sum, row) => sum + row.cost_usd, 0);
  const tokens = data.token_cost_daily.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0);
  const meals = data.meal_volume.reduce((sum, row) => sum + row.count, 0);
  const latestLatency = data.ai_latency.at(-1);

  const stats: Stat[] = [
    { label: "AI calls", value: number(calls), denom: "curated telemetry" },
    { label: "P95 latency", value: number(latestLatency?.p95_ms ?? 0), unit: "ms", denom: latestLatency?.model ?? "no model rows" },
    { label: "Failure rate", value: percent(events ? failures / events : 0), denom: `${number(failures)} of ${number(events)} events` },
    { label: "Token volume", value: number(tokens), denom: "input + output" },
    { label: "Estimated cost", value: `$${cost.toFixed(4)}`, denom: "known-price calls" },
    { label: "Meals transformed", value: number(meals), denom: "Glue aggregate output" },
  ];

  const modelLatency = new Map<string, { calls: number; p95: number }>();
  for (const row of data.ai_latency) {
    const current = modelLatency.get(row.model) ?? { calls: 0, p95: 0 };
    modelLatency.set(row.model, { calls: current.calls + row.call_count, p95: Math.max(current.p95, row.p95_ms) });
  }
  const latencyRows = [...modelLatency.entries()].sort((a, b) => b[1].calls - a[1].calls);
  const maxP95 = Math.max(...latencyRows.map(([, value]) => value.p95), 1);

  const slotCounts = new Map<string, number>();
  for (const row of data.meal_volume) slotCounts.set(row.meal_slot, (slotCounts.get(row.meal_slot) ?? 0) + row.count);
  const slots = [...slotCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxSlot = Math.max(slots[0]?.[1] ?? 0, 1);

  return (
    <>
      <PageHeader title="Pipeline overview" sub={`Live AWS telemetry · API Gateway → Lambda → DynamoDB · ${to}`} />
      <StatRow stats={stats} />

      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Model latency</CardTitle><CardDescription className="mt-1">Worst observed P95 by model</CardDescription></div>
            <CardAction><Badge variant="outline">Lambda API</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {latencyRows.map(([model, value]) => (
              <BarRow key={model} label={model} n={`${number(value.p95)} ms`} sub={`${number(value.calls)} calls`}
                w={`${(value.p95 / maxP95) * 100}%`} color={CHART[2]} />
            ))}
            {latencyRows.length === 0 && <Note tone="plain">No AI latency rows were present in the latest curated snapshot.</Note>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Meal throughput</CardTitle><CardDescription className="mt-1">Processed entries by meal slot</CardDescription></div>
            <CardAction><Badge variant="good">{number(meals)} total</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {slots.map(([slot, count]) => (
              <BarRow key={slot} label={slot} n={number(count)} w={`${(count / maxSlot) * 100}%`} color={CHART[1]} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-3" id="history">
        <CardHeader>
          <div><CardTitle>Pipeline execution path</CardTitle><CardDescription className="mt-1">The deployed assessment path represented by these aggregates</CardDescription></div>
          <CardAction><Badge>live</Badge></CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm leading-relaxed md:grid-cols-4">
          <Note tone="plain"><b>1 · Extract</b><br />Restricted analytics views are written to raw S3 JSONL.</Note>
          <Note tone="plain"><b>2 · Transform</b><br />Glue PySpark produces curated Parquet and aggregate JSON.</Note>
          <Note tone="plain"><b>3 · Load</b><br />The loader Lambda writes serving records into DynamoDB.</Note>
          <Note tone="plain"><b>4 · Serve</b><br />API Gateway authorizes this dashboard before invoking Lambda.</Note>
        </CardContent>
      </Card>
    </>
  );
}
