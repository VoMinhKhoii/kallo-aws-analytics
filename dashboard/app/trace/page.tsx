import { getCachedSelectedMetrics } from "@/app/lib/api";
import { OPERATIONAL_METRIC_NAMES } from "@/app/lib/types";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestTraceDetail } from "@/components/console/request-trace-detail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");

export default async function TracePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.request) ? params.request[0] : params.request;
  const requestId = requested && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)
    ? requested
    : undefined;
  const to = new Date().toISOString().slice(0, 10);
  const bundle = await getCachedSelectedMetrics(OPERATIONAL_METRIC_NAMES, "2000-01-01", to);
  const errors = Object.entries(bundle.errors).map(([metric, error]) => `${metric}: ${error}`);
  const data = {
    dau_wau: bundle.data.dau_wau ?? [],
    macro_distributions: bundle.data.macro_distributions ?? [],
    ai_latency: bundle.data.ai_latency ?? [],
    ai_failure_rate: bundle.data.ai_failure_rate ?? [],
    token_cost_daily: bundle.data.token_cost_daily ?? [],
    match_rate: bundle.data.match_rate ?? [],
    implausible_foods: bundle.data.implausible_foods ?? [],
    app_health: bundle.data.app_health ?? [],
    ingredient_demand: bundle.data.ingredient_demand ?? [],
    ingredient_mappings: bundle.data.ingredient_mappings ?? [],
    corpus_reverse_lookup: bundle.data.corpus_reverse_lookup ?? [],
    ingredient_gaps: bundle.data.ingredient_gaps ?? [],
    ingredient_rank_distribution: bundle.data.ingredient_rank_distribution ?? [],
  };
  const aiCalls = data.ai_latency.reduce((sum, row) => sum + row.call_count, 0);
  const observedDays = new Set(data.dau_wau.map((row) => row.date)).size;
  const metricFamilies = OPERATIONAL_METRIC_NAMES.length - errors.length;
  const latestActivity = data.dau_wau.at(-1);
  const latestMatch = data.match_rate.at(-1);
  const latestLatency = data.ai_latency.at(-1);

  const stats: Stat[] = [
    { label: "Metric families", value: number(metricFamilies), denom: "authenticated API reads" },
    { label: "Observed days", value: number(observedDays), denom: "DAU/WAU series" },
    { label: "AI calls", value: number(aiCalls), denom: "telemetry aggregate" },
    { label: "Health buckets", value: number(data.app_health.length), denom: "application telemetry" },
    { label: "Ingredient mappings", value: number(data.ingredient_mappings.length), denom: "bounded curation set" },
    { label: "Quality flags", value: number(data.implausible_foods.length), denom: "plausibility audit" },
  ];

  const contractRows = [
    ["dau_wau", data.dau_wau.length],
    ["macro_distributions", data.macro_distributions.length],
    ["ai_latency", data.ai_latency.length],
    ["ai_failure_rate", data.ai_failure_rate.length],
    ["token_cost_daily", data.token_cost_daily.length],
    ["match_rate", data.match_rate.length],
    ["implausible_foods", data.implausible_foods.length],
    ["app_health", data.app_health.length],
    ["ingredient_demand", data.ingredient_demand.length],
    ["ingredient_mappings", data.ingredient_mappings.length],
    ["corpus_reverse_lookup", data.corpus_reverse_lookup.length],
    ["ingredient_gaps", data.ingredient_gaps.length],
    ["ingredient_rank_distribution", data.ingredient_rank_distribution.length],
  ] as const;
  const maxRows = Math.max(...contractRows.map(([, count]) => count), 1);

  return (
    <>
      <PageHeader title="AWS path trace" sub={`A live aggregate trace across the deployed analytics plane · ${to}`} />
      <StatRow stats={stats} />
      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}
      {requestId ? <RequestTraceDetail requestId={requestId} /> : null}

      <Card className="mt-3">
        <CardHeader>
          <div><CardTitle>End-to-end request path</CardTitle><CardDescription className="mt-1">What one dashboard read proves at each boundary</CardDescription></div>
          <CardAction><Badge variant="good">authorised</Badge></CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Note tone="plain"><b>1 · Vercel</b><br />The server component reads encrypted runtime configuration. The bearer token never reaches the browser.</Note>
          <Note tone="plain"><b>2 · API Gateway</b><br />The Lambda authorizer validates the bearer; its stage-scoped Allow is cached for five minutes.</Note>
          <Note tone="plain"><b>3 · Lambda</b><br />The metrics function uses two bounded read lanes for the requested aggregate partitions.</Note>
          <Note tone="plain"><b>4 · DynamoDB</b><br />Curated payloads are returned to this server-rendered page with no mock fallback.</Note>
        </CardContent>
      </Card>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Latest serving signals</CardTitle><CardDescription className="mt-1">Newest rows visible through the AWS API</CardDescription></div>
            <CardAction><Badge>live</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b py-2"><span>Activity</span><span className="tabular">DAU {number(latestActivity?.dau ?? 0)} · WAU {number(latestActivity?.wau ?? 0)}</span></div>
            <div className="flex justify-between border-b py-2"><span>Ingredient matching</span><span className="tabular">{((latestMatch?.match_rate ?? 0) * 100).toFixed(1)}%</span></div>
            <div className="flex justify-between border-b py-2"><span>AI latency</span><span className="tabular">P95 {number(latestLatency?.p95_ms ?? 0)} ms</span></div>
            <div className="flex justify-between border-b py-2"><span>AI model</span><span className="truncate pl-4">{latestLatency?.model ?? "no model row"}</span></div>
            <div className="flex justify-between py-2"><span>Serving date</span><span className="tabular">{latestActivity?.date ?? to}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Serving contract coverage</CardTitle><CardDescription className="mt-1">Rows returned by each aggregate family</CardDescription></div>
            <CardAction><Badge variant="outline">{metricFamilies}/{OPERATIONAL_METRIC_NAMES.length} healthy</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {contractRows.map(([metric, count], index) => (
              <BarRow key={metric} label={metric} n={number(count)} w={`${(count / maxRows) * 100}%`}
                color={CHART[(index % 5 + 1) as keyof typeof CHART]} labelWidth="w-44" />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-3">
        <Note tone="plain"><b>Trace boundary:</b> the AWS serving schema exposes aggregate usage context, application health, and AI-pipeline operations. It excludes funnels, retention cohorts, journeys, profiles, and raw meal payloads.</Note>
      </div>
    </>
  );
}
