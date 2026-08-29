import { getCachedDashboardMetrics } from "@/app/lib/api";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");

function nutrientLabel(value: string) {
  return value.replace("_kcal", "").replace("_g", "").replaceAll("_", " ");
}

export default async function CoveragePage() {
  const to = new Date().toISOString().slice(0, 10);
  const { data, errors } = await getCachedDashboardMetrics("2000-01-01", to);
  const foodSelections = data.top_foods.reduce((sum, row) => sum + row.count, 0);
  const gapOccurrences = data.coverage_gaps.reduce((sum, row) => sum + row.count, 0);
  const flaggedReasons = data.implausible_foods.reduce((sum, row) => sum + row.reasons.length, 0);
  const macroObservations = data.macro_distributions.reduce((sum, row) => sum + row.count, 0);
  const latestMatch = data.match_rate.at(-1);

  const stats: Stat[] = [
    { label: "Ranked foods", value: number(data.top_foods.length), denom: `${number(foodSelections)} selections` },
    { label: "Gap queries", value: number(data.coverage_gaps.length), denom: `${number(gapOccurrences)} occurrences` },
    { label: "Macro buckets", value: number(data.macro_distributions.length), denom: `${number(macroObservations)} observations` },
    { label: "Flagged foods", value: number(data.implausible_foods.length), denom: `${number(flaggedReasons)} quality reasons` },
    { label: "Latest ingredients", value: number(latestMatch?.ingredient_count ?? 0), denom: latestMatch?.date ?? "no match rows" },
    { label: "Unaccounted", value: number(latestMatch?.unaccounted_count ?? 0), denom: "latest match audit" },
  ];

  const foodMax = Math.max(data.top_foods[0]?.count ?? 0, 1);
  const gapMax = Math.max(data.coverage_gaps[0]?.count ?? 0, 1);
  const macroRows = [...data.macro_distributions].sort((a, b) => b.count - a.count).slice(0, 16);
  const macroMax = Math.max(macroRows[0]?.count ?? 0, 1);

  return (
    <>
      <PageHeader title="Coverage & corpus" sub={`AWS-curated food coverage and plausibility controls · ${to}`} />
      <StatRow stats={stats} />
      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Corpus demand</CardTitle><CardDescription className="mt-1">Most frequently resolved ingredient names</CardDescription></div>
            <CardAction><Badge variant="outline">Top {Math.min(data.top_foods.length, 12)}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {data.top_foods.slice(0, 12).map((row) => (
              <BarRow key={`${row.rank}-${row.ingredient_name}`} label={row.ingredient_name} n={number(row.count)}
                w={`${(row.count / foodMax) * 100}%`} color={CHART[1]} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Coverage backlog</CardTitle><CardDescription className="mt-1">Vietnamese queries requiring corpus attention</CardDescription></div>
            <CardAction><Badge variant="warn">prioritise</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {data.coverage_gaps.slice(0, 12).map((row) => (
              <BarRow key={`${row.rank}-${row.query_text}`} label={row.query_text} n={number(row.count)}
                w={`${(row.count / gapMax) * 100}%`} color={CHART[3]} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div><CardTitle>Macro distribution</CardTitle><CardDescription className="mt-1">Largest curated nutrient buckets</CardDescription></div>
            <CardAction><Badge variant="outline">Parquet → DynamoDB</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {macroRows.map((row, index) => (
              <BarRow key={`${row.nutrient}-${row.bucket_min}-${row.bucket_max ?? "plus"}`}
                label={`${nutrientLabel(row.nutrient)} · ${row.bucket_min}–${row.bucket_max ?? "+"}`}
                n={number(row.count)} w={`${(row.count / macroMax) * 100}%`} color={CHART[(index % 5 + 1) as keyof typeof CHART]} labelWidth="w-52" />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Quality controls</CardTitle><CardDescription className="mt-1">Examples flagged by macro plausibility rules</CardDescription></div>
            <CardAction><Badge variant="bad">{number(data.implausible_foods.length)} flags</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.implausible_foods.slice(0, 10).map((row, index) => (
              <div key={`${row.id ?? index}`} className="border-b py-2 last:border-0">
                <p className="truncate text-sm font-medium">{row.name_en ?? "Unnamed food"}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{row.type_en ?? "Unknown category"} · {row.reasons.join(", ")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
