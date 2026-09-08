import { getCachedSelectedMetrics } from "@/app/lib/api";
import { MacroDistributionChart } from "@/components/console/macro-distribution-chart";
import { BarRow, CHART, Note, PageHeader, StatRow, type Stat } from "@/components/panels/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const number = (value: number) => value.toLocaleString("en-US");
const COVERAGE_METRICS = ["macro_distributions", "ingredient_rank_distribution", "implausible_foods"] as const;

export default async function CoveragePage() {
  const to = new Date().toISOString().slice(0, 10);
  const bundle = await getCachedSelectedMetrics(COVERAGE_METRICS, "2000-01-01", to);
  const errors = Object.entries(bundle.errors).map(([metric, error]) => `${metric}: ${error}`);
  const macros = bundle.data.macro_distributions ?? [];
  const ranks = bundle.data.ingredient_rank_distribution ?? [];
  const flags = bundle.data.implausible_foods ?? [];
  const macroObservations = macros.filter((row) => row.nutrient === "calories_kcal").reduce((sum, row) => sum + row.count, 0);
  const acceptedSelections = ranks.reduce((sum, row) => sum + row.count, 0);
  const firstChoice = ranks.filter((row) => row.selected_rank === 1).reduce((sum, row) => sum + row.count, 0);
  const maxRank = Math.max(...ranks.map((row) => row.count), 1);

  const stats: Stat[] = [
    { label: "Macro observations", value: number(macroObservations), denom: "aggregate meal-output distribution" },
    { label: "Accepted selections", value: number(acceptedSelections), denom: "valid candidate ranks" },
    { label: "First-choice share", value: acceptedSelections ? `${((firstChoice / acceptedSelections) * 100).toFixed(1)}%` : "No data", denom: "rank 1 selections" },
    { label: "Quality flags", value: number(flags.length), denom: "catalogue plausibility" },
  ];

  return (
    <>
      <PageHeader title="Coverage & corpus" sub={`Distribution-first output and catalogue quality review · ${to}`} />
      <StatRow stats={stats} />
      {errors.length > 0 && <div className="mt-3"><Note><b>{errors.length} AWS metric reads failed.</b> {errors.slice(0, 2).join(" · ")}</Note></div>}

      <Card className="mt-3">
        <CardHeader><div><CardTitle>Macro distribution</CardTitle><CardDescription className="mt-1">Switch nutrient to spot abnormal clusters, empty ranges, and long tails at a glance</CardDescription></div><CardAction><Badge variant="outline">histogram</Badge></CardAction></CardHeader>
        <CardContent>{macros.length ? <MacroDistributionChart rows={macros} /> : <Note tone="plain">No macro distribution rows were returned.</Note>}</CardContent>
      </Card>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Candidate rank shape</CardTitle><CardDescription className="mt-1">How often the pipeline accepts each rank within its candidate pool</CardDescription></div></CardHeader>
          <CardContent>{ranks.map((row) => <BarRow key={`${row.pool_size}-${row.selected_rank}`} label={`Pool ${row.pool_size} · rank ${row.selected_rank}`} sub={`${(row.share * 100).toFixed(1)}% within pool`} n={number(row.count)} w={`${(row.count / maxRank) * 100}%`} color={row.selected_rank === 1 ? CHART[1] : CHART[3]} />)}{ranks.length === 0 ? <Note tone="plain">No accepted candidate-rank rows were returned.</Note> : null}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Nutrition plausibility</CardTitle><CardDescription className="mt-1">The histogram shows shape; this list identifies the records causing suspicious values</CardDescription></div><CardAction><Badge variant={flags.length ? "bad" : "good"}>{number(flags.length)} flags</Badge></CardAction></CardHeader>
          <CardContent className="space-y-2">{flags.slice(0, 12).map((row) => <Note key={String(row.id)} tone="plain"><b>{row.name_en ?? `Food ${row.id ?? "unknown"}`}</b><br />{row.reasons.join(" · ")}</Note>)}{flags.length === 0 ? <Note tone="plain">No nutrition plausibility flags were returned.</Note> : null}</CardContent>
        </Card>
      </div>
    </>
  );
}
