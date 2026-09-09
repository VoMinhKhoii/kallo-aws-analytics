"use client";

import * as React from "react";
import type {
  CorpusReverseLookupRow, ImplausibleFoodRow, IngredientDemandRow, IngredientGapRow,
  IngredientMappingRow, IngredientRankDistributionRow, MacroRow, MatchRateRow,
} from "@/app/lib/types";
import {
  BarList, ConsolePage, formatDecimal, formatNumber, formatPercent, InlineNote,
  MetricRibbon, MetricState, PageIntro, Panel, RangeControl, SimpleTable,
  SourceTag, TableCell, TablePager, TableRow, rangeWindow, type ConsoleRange,
} from "@/components/console/console";
import { MacroDistributionChart } from "@/components/console/macro-distribution-chart";
import { TimeSeriesChart } from "@/components/console/time-series-chart";
import { useMetricBundle, type MetricBundleState } from "@/lib/use-metric-bundle";

const INGREDIENT_METRICS = [
  "ingredient_demand", "ingredient_mappings", "corpus_reverse_lookup",
  "ingredient_gaps", "ingredient_rank_distribution", "match_rate",
  "macro_distributions", "implausible_foods",
] as const;

function metricError(bundle: MetricBundleState, name: string) {
  return (bundle.errors as Record<string, string | undefined>)[name] ?? bundle.error;
}

function aggregateDemand(rows: IngredientDemandRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.ingredient_query, (counts.get(row.ingredient_query) ?? 0) + row.count);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([ingredient_query, count], index) => ({ rank: index + 1, ingredient_query, count }));
}

function aggregateMappings(rows: IngredientMappingRow[]) {
  const groups = new Map<string, IngredientMappingRow>();
  for (const row of rows) {
    const current = groups.get(row.ingredient_query);
    groups.set(row.ingredient_query, {
      ...row,
      decision_count: (current?.decision_count ?? 0) + row.decision_count,
      accepted_count: (current?.accepted_count ?? 0) + row.accepted_count,
      candidates: row.candidates.length ? row.candidates : current?.candidates ?? [],
      chosen: row.chosen ?? current?.chosen ?? null,
    });
  }
  return [...groups.values()].sort((a, b) => b.decision_count - a.decision_count || a.ingredient_query.localeCompare(b.ingredient_query)).map((row, index) => ({ ...row, rank: index + 1 }));
}

function aggregateGaps(rows: IngredientGapRow[]) {
  const groups = new Map<string, IngredientGapRow>();
  for (const row of rows) {
    const key = `${row.ingredient_query}\u0000${row.verdict}\u0000${row.reject_bucket}`;
    const current = groups.get(key);
    groups.set(key, { ...row, count: (current?.count ?? 0) + row.count });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.ingredient_query.localeCompare(b.ingredient_query)).map((row, index) => ({ ...row, rank: index + 1 }));
}

function aggregateRanks(rows: IngredientRankDistributionRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.pool_size}:${row.selected_rank}`;
    counts.set(key, (counts.get(key) ?? 0) + row.count);
  }
  const totals = new Map<number, number>();
  for (const [key, count] of counts) {
    const pool = Number(key.split(":")[0]);
    totals.set(pool, (totals.get(pool) ?? 0) + count);
  }
  return [...counts].map(([key, count]) => {
    const [pool_size, selected_rank] = key.split(":").map(Number);
    return { pool_size, selected_rank, count, share: count / (totals.get(pool_size) ?? count) };
  }).sort((a, b) => a.pool_size - b.pool_size || a.selected_rank - b.selected_rank);
}

function aggregateReverse(rows: CorpusReverseLookupRow[]) {
  const groups = new Map<string, CorpusReverseLookupRow>();
  for (const row of rows) {
    const key = row.food_id ?? `${row.food_name}:${row.source}`;
    const current = groups.get(key);
    groups.set(key, {
      ...row,
      decision_count: (current?.decision_count ?? 0) + row.decision_count,
      query_count: (current?.query_count ?? 0) + row.query_count,
      query_examples: [...new Set([...(current?.query_examples ?? []), ...row.query_examples])].slice(0, 5),
    });
  }
  return [...groups.values()].sort((a, b) => b.decision_count - a.decision_count).map((row, index) => ({ ...row, rank: index + 1 }));
}

function aggregateMacros(rows: MacroRow[]) {
  const groups = new Map<string, MacroRow>();
  for (const row of rows) {
    const key = `${row.nutrient}:${row.bucket_min}:${row.bucket_max ?? "max"}`;
    const current = groups.get(key);
    groups.set(key, { ...row, count: (current?.count ?? 0) + row.count });
  }
  return [...groups.values()];
}

function MappingDetails({ row }: { row: IngredientMappingRow | undefined }) {
  if (!row) return <span>No mapping observation</span>;
  const chosen = row.chosen?.name ?? row.chosen?.food_id;
  return (
    <ul className="min-w-[24rem] space-y-1.5 py-0.5 text-[11px] leading-4">
      <li className="flex gap-2"><span aria-hidden="true" className="text-[var(--console-green)]">●</span><span><span className="font-semibold text-[var(--console-ink)]">Chosen:</span> {chosen ?? "No chosen food"}{row.chosen?.source ? <span className="text-[var(--console-muted)]"> · {row.chosen.source}</span> : null}</span></li>
      {row.candidates.map((candidate) => (
        <li key={`${candidate.rank}-${candidate.food_id ?? candidate.name}`} className="flex gap-2 text-[var(--console-muted)]">
          <span aria-hidden="true">•</span>
          <span><span className="font-mono text-[var(--console-ink)]">c{candidate.rank}</span> {candidate.name ?? candidate.food_id ?? "Unknown candidate"}{candidate.similarity == null ? "" : ` · ${formatDecimal(candidate.similarity, 3)}`}</span>
        </li>
      ))}
    </ul>
  );
}

export default function IngredientsPage() {
  const [range, setRange] = React.useState<ConsoleRange>("30d");
  const [mappingPage, setMappingPage] = React.useState(1);
  const [corpusPage, setCorpusPage] = React.useState(1);
  const mappingPageSize = 15;
  const corpusPageSize = 12;
  const window = React.useMemo(() => rangeWindow(range), [range]);
  const bundle = useMetricBundle(INGREDIENT_METRICS, window.from, window.to);
  const demand = aggregateDemand((bundle.data?.ingredient_demand ?? []) as IngredientDemandRow[]);
  const mappings = aggregateMappings((bundle.data?.ingredient_mappings ?? []) as IngredientMappingRow[]);
  const gaps = aggregateGaps((bundle.data?.ingredient_gaps ?? []) as IngredientGapRow[]);
  const ranks = aggregateRanks((bundle.data?.ingredient_rank_distribution ?? []) as IngredientRankDistributionRow[]);
  const reverse = aggregateReverse((bundle.data?.corpus_reverse_lookup ?? []) as CorpusReverseLookupRow[]);
  const macros = aggregateMacros((bundle.data?.macro_distributions ?? []) as MacroRow[]);
  const matches = (bundle.data?.match_rate ?? []) as MatchRateRow[];
  const flags = (bundle.data?.implausible_foods ?? []) as ImplausibleFoodRow[];
  const mappingByQuery = new Map(mappings.map((row) => [row.ingredient_query, row]));
  const decisions = mappings.reduce((sum, row) => sum + row.decision_count, 0);
  const accepted = mappings.reduce((sum, row) => sum + row.accepted_count, 0);
  const unresolved = gaps.reduce((sum, row) => sum + row.count, 0);
  const acceptedRanks = ranks.reduce((sum, row) => sum + row.count, 0);
  const firstRanks = ranks.filter((row) => row.selected_rank === 1).reduce((sum, row) => sum + row.count, 0);
  const visibleDemand = demand.slice((mappingPage - 1) * mappingPageSize, mappingPage * mappingPageSize);
  const visibleCorpus = reverse.slice((corpusPage - 1) * corpusPageSize, corpusPage * corpusPageSize);

  React.useEffect(() => {
    setMappingPage(1);
    setCorpusPage(1);
  }, [range]);

  React.useEffect(() => {
    setMappingPage((page) => Math.min(page, Math.max(1, Math.ceil(demand.length / mappingPageSize))));
  }, [demand.length]);

  React.useEffect(() => {
    setCorpusPage((page) => Math.min(page, Math.max(1, Math.ceil(reverse.length / corpusPageSize))));
  }, [reverse.length]);

  return <ConsolePage>
    <PageIntro eyebrow="Ingredients" title="Ingredients" description="Demand, retrieval quality, corpus coverage, output distributions, and catalog checks."><RangeControl value={range} onChange={setRange} label="Window" /></PageIntro>
    <div className="mt-3 grid gap-3">
      <MetricRibbon items={[
        { label: "Decisions", value: formatNumber(decisions || undefined), detail: "selected window", loading: bundle.loading, error: metricError(bundle, "ingredient_mappings") },
        { label: "Accepted", value: formatPercent(decisions ? accepted / decisions : undefined), detail: decisions ? `${accepted} of ${decisions}` : "No decisions", tone: "green", loading: bundle.loading, error: metricError(bundle, "ingredient_mappings") },
        { label: "Unresolved", value: formatNumber(unresolved || undefined), detail: "controlled gap buckets", tone: unresolved ? "amber" : "green", loading: bundle.loading, error: metricError(bundle, "ingredient_gaps") },
        { label: "First choice", value: formatPercent(acceptedRanks ? firstRanks / acceptedRanks : undefined), detail: "accepted candidate ranks", tone: "blue", loading: bundle.loading, error: metricError(bundle, "ingredient_rank_distribution") },
      ]} />

      <Panel title="Match rate over time" description="Matched ingredients divided by every ingredient observed by the pipeline." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={bundle.loading} error={metricError(bundle, "match_rate")} empty={matches.length === 0} emptyMessage="No matching rows were returned for this window."><div className="px-3 py-4 sm:px-5"><TimeSeriesChart data={matches} series={[{ key: "match_rate", label: "Match rate", color: "var(--console-green)" }]} ariaLabel="Ingredient match rate over time" format="percent" /></div></MetricState></Panel>

      <Panel title="Demand and chosen mappings" description="One ranked view replaces separate demand and mapping panels." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={bundle.loading} error={metricError(bundle, "ingredient_demand") || metricError(bundle, "ingredient_mappings")} empty={demand.length === 0} emptyMessage="No ingredient decisions were returned for this window."><SimpleTable columns={["Query", { label: "Demand", align: "right" }, { label: "Accepted", align: "right" }, "Chosen and candidates"]} caption="Ingredient demand and mappings">{visibleDemand.map((row) => { const mapping = mappingByQuery.get(row.ingredient_query); return <TableRow key={row.ingredient_query}><TableCell className="align-top"><span className="font-mono text-[11px]">{row.ingredient_query}</span></TableCell><TableCell numeric className="align-top">{formatNumber(row.count)}</TableCell><TableCell numeric muted className="align-top">{mapping ? `${mapping.accepted_count}/${mapping.decision_count}` : "—"}</TableCell><TableCell muted className="align-top"><MappingDetails row={mapping} /></TableCell></TableRow>; })}</SimpleTable><TablePager page={mappingPage} pageSize={mappingPageSize} total={demand.length} onPageChange={setMappingPage} label="ingredient mappings" /></MetricState></Panel>

      <Panel title="Meal-output macro distribution" description="Distribution buckets are summed only across the selected observation window." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={bundle.loading} error={metricError(bundle, "macro_distributions")} empty={macros.length === 0} emptyMessage="No meal-output rows were returned for this window."><div className="px-3 py-4 sm:px-5"><MacroDistributionChart rows={macros} /></div></MetricState></Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Coverage gaps" description="Highest-volume unmatched and rejected normalized queries." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={bundle.loading} error={metricError(bundle, "ingredient_gaps")} empty={gaps.length === 0} emptyMessage="No unresolved ingredient groups were returned for this window."><BarList items={gaps.slice(0, 20).map((row) => ({ label: row.ingredient_query, value: row.count, detail: `${row.verdict} · ${row.reject_bucket}`, tone: "amber" }))} /></MetricState></Panel>
        <Panel title="Accepted candidate ranks" description="Selected rank within each candidate-pool size." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={bundle.loading} error={metricError(bundle, "ingredient_rank_distribution")} empty={ranks.length === 0} emptyMessage="No accepted candidate-rank rows were returned for this window."><BarList items={ranks.map((row) => ({ label: `Pool ${row.pool_size} · rank ${row.selected_rank}`, value: row.count, detail: `${formatPercent(row.share)} within pool`, tone: row.selected_rank === 1 ? "green" : "blue" }))} /></MetricState></Panel>
      </div>

      <Panel title="Corpus coverage" description="Canonical foods reached by accepted decisions, with bounded query examples." source={<SourceTag>AWS aggregate</SourceTag>}><MetricState loading={bundle.loading} error={metricError(bundle, "corpus_reverse_lookup")} empty={reverse.length === 0} emptyMessage="No accepted corpus mappings were returned for this window."><SimpleTable columns={["Food", { label: "Decisions", align: "right" }, { label: "Queries", align: "right" }, "Examples"]} caption="Corpus reverse lookup">{visibleCorpus.map((row) => <TableRow key={row.food_id ?? `${row.food_name}-${row.source}`}><TableCell className="align-top"><p className="font-medium">{row.food_name ?? row.food_id ?? "Unknown"}</p><p className="text-[10px] text-[var(--console-muted)]">{row.source ?? "No source"}</p></TableCell><TableCell numeric className="align-top">{row.decision_count}</TableCell><TableCell numeric className="align-top">{row.query_count}</TableCell><TableCell muted className="align-top"><ul className="min-w-[18rem] space-y-1">{row.query_examples.map((example) => <li key={example} className="flex gap-2"><span aria-hidden="true">•</span><span>{example}</span></li>)}</ul></TableCell></TableRow>)}</SimpleTable><TablePager page={corpusPage} pageSize={corpusPageSize} total={reverse.length} onPageChange={setCorpusPage} label="corpus rows" /></MetricState></Panel>

      <Panel title="Current catalog checks" description="Current-state nutrition plausibility checks; this inventory is not time-filtered." source={<SourceTag>Current snapshot</SourceTag>}><MetricState loading={bundle.loading} error={metricError(bundle, "implausible_foods")} empty={flags.length === 0} emptyMessage="No current catalog plausibility flags were returned."><div className="divide-y divide-[var(--console-rule)]">{flags.slice(0, 16).map((row) => <div key={String(row.id)} className="px-4 py-3 text-xs sm:px-5"><p className="font-medium text-[var(--console-ink)]">{row.name_en ?? `Food ${row.id ?? "unknown"}`}</p><p className="mt-1 text-[var(--console-muted)]">{row.reasons.join(" · ")}</p></div>)}</div></MetricState></Panel>
      <InlineNote>The selected window is applied to dated Glue aggregates. Current catalog checks intentionally describe the newest food-composition snapshot.</InlineNote>
    </div>
  </ConsolePage>;
}
