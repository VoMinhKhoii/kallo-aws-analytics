import { getCachedDashboardMetrics } from "@/app/lib/api";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default async function RetrievalPage() {
  const to = new Date().toISOString().slice(0, 10);
  const { data, errors } = await getCachedDashboardMetrics("2000-01-01", to);
  const latest = data.match_rate.at(-1);
  const matched = data.match_rate.reduce((sum, row) => sum + row.matched_count, 0);
  const unmatched = data.match_rate.reduce((sum, row) => sum + row.unmatched_count, 0);
  const ingredients = data.match_rate.reduce((sum, row) => sum + row.ingredient_count, 0);
  const gapOccurrences = data.coverage_gaps.reduce((sum, row) => sum + row.count, 0);

  const stats: Stat[] = [
    { label: "Latest match rate", value: percent(latest?.match_rate ?? 0), denom: latest?.date ?? "no match rows" },
    { label: "Matched ingredients", value: number(matched), denom: `of ${number(ingredients)} observed` },
    { label: "Unmatched ingredients", value: number(unmatched), denom: "curated match audit" },
    { label: "Coverage-gap events", value: number(gapOccurrences), denom: `${number(data.coverage_gaps.length)} ranked queries` },
    { label: "Top food count", value: number(data.top_foods[0]?.count ?? 0), denom: data.top_foods[0]?.ingredient_name ?? "no food rows" },
    { label: "Quality flags", value: number(data.implausible_foods.length), denom: "macro plausibility checks" },
  ];

  const trend = data.match_rate.slice(-12);
  const gapMax = Math.max(data.coverage_gaps[0]?.count ?? 0, 1);
  const foodMax = Math.max(data.top_foods[0]?.count ?? 0, 1);

  return (
    <>
      <PageHeader title="Retrieval & matching" sub={`Curated ingredient matching served by the AWS analytics API · ${to}`} />
      <StatRow stats={stats} />
      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Recent match quality</CardTitle><CardDescription className="mt-1">Last twelve observed days</CardDescription></div>
            <CardAction><Badge variant="good">{percent(latest?.match_rate ?? 0)} latest</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {trend.map((row) => (
              <BarRow key={row.date} label={row.date} n={percent(row.match_rate)} sub={`${number(row.ingredient_count)} items`}
                w={`${row.match_rate * 100}%`} color={CHART[1]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Retrieval misses</CardTitle><CardDescription className="mt-1">Queries with no confident corpus match</CardDescription></div>
            <CardAction><Badge variant="warn">Top {Math.min(data.coverage_gaps.length, 10)}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {data.coverage_gaps.slice(0, 10).map((row) => (
              <BarRow key={`${row.rank}-${row.query_text}`} label={row.query_text} n={number(row.count)}
                w={`${(row.count / gapMax) * 100}%`} color={CHART[3]} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Most resolved foods</CardTitle><CardDescription className="mt-1">Ingredient names selected most often</CardDescription></div>
            <CardAction><Badge variant="outline">DynamoDB</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {data.top_foods.slice(0, 10).map((row) => (
              <BarRow key={`${row.rank}-${row.ingredient_name}`} label={row.ingredient_name} n={number(row.count)}
                w={`${(row.count / foodMax) * 100}%`} color={CHART[2]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Corpus quality flags</CardTitle><CardDescription className="mt-1">Highest macro-calorie mismatches in the curated snapshot</CardDescription></div>
            <CardAction><Badge variant="bad">review</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.implausible_foods.slice(0, 8).map((row, index) => (
              <div key={`${row.id ?? index}`} className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{row.name_en ?? "Unnamed food"}</p><p className="text-muted-foreground mt-0.5 text-xs">{row.reasons.join(", ")}</p></div>
                <span className="tabular shrink-0 text-xs">{percent(row.mismatch_share)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
