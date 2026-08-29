import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { getCachedDashboardMetrics } from "@/app/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default async function AwsAnalyticsDashboard() {
  const to = new Date().toISOString().slice(0, 10);
  const from = "2000-01-01";
  const { data, errors } = await getCachedDashboardMetrics(from, to);
  const presentationLabel = process.env.VERCEL === "1"
    ? "Next.js on Vercel (iteration host)"
    : "ECS Fargate behind this ALB";

  const latestActivity = data.dau_wau.at(-1);
  const latestMatch = data.match_rate.at(-1);
  const latestFailure = data.ai_failure_rate.at(-1);
  const totalMeals = data.meal_volume.reduce((sum, row) => sum + row.count, 0);
  const totalCost = data.token_cost_daily.reduce((sum, row) => sum + row.cost_usd, 0);
  const funnel = data.onboarding_funnel;

  const stats: Stat[] = [
    { label: "Daily active users", value: number(latestActivity?.dau ?? 0), denom: `WAU ${number(latestActivity?.wau ?? 0)}` },
    { label: "Meals processed", value: number(totalMeals), denom: "curated aggregate" },
    { label: "Ingredient match rate", value: percent(latestMatch?.match_rate ?? 0), denom: `${number(latestMatch?.ingredient_count ?? 0)} ingredients` },
    { label: "Onboarding complete", value: percent(funnel.completion_share), denom: `${number(funnel.completed_users)} of ${number(funnel.total_users)} users` },
    { label: "AI failure rate", value: percent(latestFailure?.failure_rate ?? 0), denom: latestFailure?.model ?? "no model rows" },
    { label: "Estimated token cost", value: `$${totalCost.toFixed(4)}`, denom: "known-price calls" },
  ];

  const topFoodMax = Math.max(data.top_foods[0]?.count ?? 0, 1);
  const coverageMax = Math.max(data.coverage_gaps[0]?.count ?? 0, 1);
  const cohortRows = data.retention_cohorts.filter((row) => row.weeks_later === 0).slice(-8);

  return (
    <>
      <PageHeader title="AWS analytics plane" sub={`Live aggregates from API Gateway → Lambda → DynamoDB · ${to}`} />
      <StatRow stats={stats} />

      {errors.length > 0 && (
        <div className="mt-3">
          <Note>
            <b>{errors.length} metric request{errors.length === 1 ? "" : "s"} returned an error.</b>{" "}
            {errors.slice(0, 2).join(" · ")}
          </Note>
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Most logged foods</CardTitle>
              <CardDescription className="mt-1">Ranked from curated meal-item aggregates</CardDescription>
            </div>
            <CardAction><Badge variant="outline">DynamoDB</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {data.top_foods.slice(0, 8).map((row) => (
              <BarRow key={`${row.rank}-${row.ingredient_name}`} label={row.ingredient_name} n={number(row.count)}
                w={`${(row.count / topFoodMax) * 100}%`} color={CHART[1]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Coverage gaps</CardTitle>
              <CardDescription className="mt-1">Unmatched Vietnamese food queries to prioritise</CardDescription>
            </div>
            <CardAction><Badge variant="outline">Top {Math.min(data.coverage_gaps.length, 8)}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {data.coverage_gaps.slice(0, 8).map((row) => (
              <BarRow key={`${row.rank}-${row.query_text}`} label={row.query_text} n={number(row.count)}
                w={`${(row.count / coverageMax) * 100}%`} color={CHART[3]} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Retention cohorts</CardTitle>
              <CardDescription className="mt-1">Week-zero activation for recent cohorts</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {cohortRows.map((row) => (
              <BarRow key={row.cohort_week} label={row.cohort_week} n={`${row.active_users}/${row.cohort_size}`}
                sub={percent(row.retention_rate)} w={`${row.retention_rate * 100}%`} color={CHART[2]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pipeline proof</CardTitle>
              <CardDescription className="mt-1">Current AWS path exercised end to end</CardDescription>
            </div>
            <CardAction><Badge>live</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p><b>Source:</b> restricted Supabase analytics views</p>
            <p><b>Transform:</b> Glue PySpark to curated Parquet</p>
            <p><b>Serving:</b> DynamoDB through an authorised API Gateway</p>
            <p><b>Presentation:</b> {presentationLabel}</p>
            <Note tone="plain">All figures on this page came from the deployed AWS API. No mock-data mode is enabled.</Note>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
