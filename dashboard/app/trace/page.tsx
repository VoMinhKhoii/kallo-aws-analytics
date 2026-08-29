import { getCachedDashboardMetrics } from "@/app/lib/api";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");

export default async function TracePage() {
  const to = new Date().toISOString().slice(0, 10);
  const { data, errors } = await getCachedDashboardMetrics("2000-01-01", to);
  const aiCalls = data.ai_latency.reduce((sum, row) => sum + row.call_count, 0);
  const mealRows = data.meal_volume.reduce((sum, row) => sum + row.count, 0);
  const observedDays = new Set(data.dau_wau.map((row) => row.date)).size;
  const cohortCount = new Set(data.retention_cohorts.map((row) => row.cohort_week)).size;
  const metricFamilies = 12 - errors.length;
  const latestActivity = data.dau_wau.at(-1);
  const latestMatch = data.match_rate.at(-1);
  const latestLatency = data.ai_latency.at(-1);

  const stats: Stat[] = [
    { label: "Metric families", value: number(metricFamilies), denom: "authenticated API reads" },
    { label: "Observed days", value: number(observedDays), denom: "DAU/WAU series" },
    { label: "Meal records", value: number(mealRows), denom: "curated aggregate" },
    { label: "AI calls", value: number(aiCalls), denom: "telemetry aggregate" },
    { label: "Cohorts", value: number(cohortCount), denom: "retention series" },
    { label: "Quality flags", value: number(data.implausible_foods.length), denom: "plausibility audit" },
  ];

  const contractRows = [
    ["dau_wau", data.dau_wau.length],
    ["retention_cohorts", data.retention_cohorts.length],
    ["meal_volume", data.meal_volume.length],
    ["macro_distributions", data.macro_distributions.length],
    ["top_foods", data.top_foods.length],
    ["ai_latency", data.ai_latency.length],
    ["ai_failure_rate", data.ai_failure_rate.length],
    ["token_cost_daily", data.token_cost_daily.length],
    ["match_rate", data.match_rate.length],
    ["coverage_gaps", data.coverage_gaps.length],
    ["implausible_foods", data.implausible_foods.length],
    ["onboarding_funnel", data.onboarding_funnel.steps.length],
  ] as const;
  const maxRows = Math.max(...contractRows.map(([, count]) => count), 1);

  return (
    <>
      <PageHeader title="AWS path trace" sub={`A live aggregate trace across the deployed analytics plane · ${to}`} />
      <StatRow stats={stats} />
      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}

      <Card className="mt-3">
        <CardHeader>
          <div><CardTitle>End-to-end request path</CardTitle><CardDescription className="mt-1">What one dashboard read proves at each boundary</CardDescription></div>
          <CardAction><Badge variant="good">authorised</Badge></CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Note tone="plain"><b>1 · Vercel</b><br />The server component reads encrypted runtime configuration. The bearer token never reaches the browser.</Note>
          <Note tone="plain"><b>2 · API Gateway</b><br />The Lambda authorizer validates the bearer before the metrics route runs.</Note>
          <Note tone="plain"><b>3 · Lambda</b><br />A single-concurrency metrics function reads the requested aggregate partition.</Note>
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
            <CardAction><Badge variant="outline">{metricFamilies}/12 healthy</Badge></CardAction>
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
        <Note tone="plain"><b>Trace boundary:</b> this deployed AWS serving schema exposes privacy-safe aggregates, not raw per-meal request payloads. The page therefore traces the real infrastructure and aggregate contracts without inventing individual spans.</Note>
      </div>
    </>
  );
}
