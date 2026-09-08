import { getCachedSelectedMetrics } from "@/app/lib/api";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { TimeSeriesChart } from "@/components/console/time-series-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const RETRIEVAL_METRICS = ["match_rate", "ingredient_gaps", "implausible_foods"] as const;

export default async function RetrievalPage() {
  const to = new Date().toISOString().slice(0, 10);
  const bundle = await getCachedSelectedMetrics(RETRIEVAL_METRICS, "2000-01-01", to);
  const errors = Object.entries(bundle.errors).map(([metric, error]) => `${metric}: ${error}`);
  const matches = bundle.data.match_rate ?? [];
  const gaps = bundle.data.ingredient_gaps ?? [];
  const flags = bundle.data.implausible_foods ?? [];
  const latest = matches.at(-1);
  const ingredients = matches.reduce((sum, row) => sum + row.ingredient_count, 0);
  const matched = matches.reduce((sum, row) => sum + row.matched_count, 0);
  const unmatched = matches.reduce((sum, row) => sum + row.unmatched_count, 0);
  const gapCount = gaps.reduce((sum, row) => sum + row.count, 0);
  const maxGap = Math.max(...gaps.map((row) => row.count), 1);

  const stats: Stat[] = [
    { label: "Latest match rate", value: percent(latest?.match_rate ?? 0), denom: latest?.date ?? "no match rows" },
    { label: "Matched", value: number(matched), denom: `of ${number(ingredients)} ingredients` },
    { label: "Unmatched", value: number(unmatched), denom: "pipeline output" },
    { label: "Unresolved groups", value: number(gaps.length), denom: `${number(gapCount)} decisions` },
    { label: "Quality flags", value: number(flags.length), denom: "catalogue plausibility" },
  ];

  return (
    <>
      <PageHeader title="Retrieval & matching" sub={`Matching quality and unresolved ingredient diagnostics · ${to}`} />
      <StatRow stats={stats} />
      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}

      <Card className="mt-3">
        <CardHeader><div><CardTitle>Recent match quality</CardTitle><CardDescription className="mt-1">Daily match rate shows direction and volatility; hover for the exact percentage</CardDescription></div><CardAction><Badge variant="outline">time series</Badge></CardAction></CardHeader>
        <CardContent>{matches.length ? <TimeSeriesChart data={matches} series={[{ key: "match_rate", label: "Match rate", color: "var(--console-green)" }]} ariaLabel="Ingredient match rate over time" format="percent" /> : <Note tone="plain">No matching rows were present in the latest snapshot.</Note>}</CardContent>
      </Card>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Unresolved ingredient clusters</CardTitle><CardDescription className="mt-1">Highest-volume unmatched or rejected normalized queries</CardDescription></div></CardHeader>
          <CardContent>{gaps.slice(0, 14).map((row) => <BarRow key={`${row.ingredient_query}-${row.verdict}-${row.reject_bucket}`} label={row.ingredient_query} sub={`${row.verdict} · ${row.reject_bucket}`} n={number(row.count)} w={`${(row.count / maxGap) * 100}%`} color={CHART[4]} />)}{gaps.length === 0 ? <Note tone="plain">No unresolved ingredient groups were returned.</Note> : null}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Catalogue quality watchlist</CardTitle><CardDescription className="mt-1">Records with implausible or internally inconsistent nutrition values</CardDescription></div><CardAction><Badge variant={flags.length ? "bad" : "good"}>{number(flags.length)} flags</Badge></CardAction></CardHeader>
          <CardContent className="space-y-2">{flags.slice(0, 12).map((row) => <Note key={String(row.id)} tone="plain"><b>{row.name_en ?? `Food ${row.id ?? "unknown"}`}</b><br />{row.reasons.join(" · ")}</Note>)}{flags.length === 0 ? <Note tone="plain">No catalogue plausibility flags were returned.</Note> : null}</CardContent>
        </Card>
      </div>
    </>
  );
}
