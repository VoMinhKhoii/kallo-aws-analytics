"use client";

import * as React from "react";
import type {
  CorpusReverseLookupRow,
  IngredientDemandRow,
  IngredientGapRow,
  IngredientMappingRow,
  IngredientRankDistributionRow,
} from "@/app/lib/types";
import {
  BarList,
  ConsolePage,
  formatDecimal,
  formatNumber,
  formatPercent,
  MetricRibbon,
  MetricState,
  PageIntro,
  Panel,
  RangeControl,
  ScopeControls,
  SimpleTable,
  SourceTag,
  TableCell,
  TableRow,
  InlineNote,
  type ConsoleRange,
} from "@/components/console/console";
import { useMetricBundle, type MetricBundleState } from "@/lib/use-metric-bundle";
import { useCorpusRows, useOverturnGroups, useReverseRows, useUnresolved } from "@/lib/analytics-hooks";

const INGREDIENT_METRICS = [
  "ingredient_demand",
  "ingredient_mappings",
  "corpus_reverse_lookup",
  "ingredient_gaps",
  "ingredient_rank_distribution",
] as const;

function metricError(bundle: MetricBundleState, name: string) {
  return (bundle.errors as Record<string, string | undefined>)[name] ?? bundle.error;
}

function MappingSummary({ row }: { row: IngredientMappingRow }) {
  const chosen = row.chosen ? `${row.chosen.name ?? row.chosen.food_id ?? "Unresolved"}${row.chosen.source ? ` · ${row.chosen.source}` : ""}` : "No chosen food";
  return (
    <div className="min-w-[18rem]">
      <p className="truncate text-xs font-medium text-[var(--console-ink)]">{chosen}</p>
      <p className="mt-1 truncate text-[10px] text-[var(--console-muted)]">
        {(row.candidates.length ? row.candidates : [{ rank: 0, name: "No candidate", food_id: null, source: null, similarity: null }]).map((candidate) => `${candidate.rank || "—"}. ${candidate.name ?? candidate.food_id ?? "No candidate"}${candidate.similarity == null ? "" : ` (${formatDecimal(candidate.similarity, 3)})`}`).join(" · ")}
      </p>
    </div>
  );
}

function DemandPanel({ rows, state }: { rows: IngredientDemandRow[]; state: MetricBundleState }) {
  return (
    <Panel title="Ingredient demand" description="Ranked sanitized queries in the selected window. Ties are stable and the source caps the list." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "ingredient_demand")} empty={rows.length === 0} emptyMessage="No sanitized ingredient decisions were returned for this window.">
        <BarList items={rows.slice(0, 20).map((row) => ({ label: row.ingredient_query, value: row.count, valueLabel: formatNumber(row.count), detail: `rank ${row.rank}`, tone: "blue" }))} emptyLabel="No demand rows." />
      </MetricState>
    </Panel>
  );
}

function MappingPanel({ rows, state }: { rows: IngredientMappingRow[]; state: MetricBundleState }) {
  return (
    <Panel title="Query → candidate → chosen" description="One deterministic candidate summary for each frequent query. Catalog IDs are shown only as catalog identifiers." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "ingredient_mappings")} empty={rows.length === 0} emptyMessage="No ingredient mapping decisions were returned for this window.">
        <SimpleTable columns={["Query", "Decisions", "Accepted", "Mapping"]} caption="Ingredient candidate mappings">
          {rows.slice(0, 24).map((row) => (
            <TableRow key={`${row.rank}-${row.ingredient_query}`}>
              <TableCell><span className="font-mono text-[11px]">{row.ingredient_query}</span></TableCell>
              <TableCell numeric>{formatNumber(row.decision_count)}</TableCell>
              <TableCell numeric muted>{formatNumber(row.accepted_count)}</TableCell>
              <TableCell><MappingSummary row={row} /></TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </MetricState>
    </Panel>
  );
}

function ReversePanel({ rows, state }: { rows: CorpusReverseLookupRow[]; state: MetricBundleState }) {
  return (
    <Panel title="Reverse corpus lookup" description="Accepted decisions ranked by canonical food, with bounded query examples." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "corpus_reverse_lookup")} empty={rows.length === 0} emptyMessage="No accepted canonical food mappings were returned for this window.">
        <SimpleTable columns={["Food", "Source", "Decisions", "Queries", "Examples"]} caption="Canonical food reverse lookup">
          {rows.slice(0, 24).map((row) => (
            <TableRow key={`${row.rank}-${row.food_id ?? row.food_name}`}>
              <TableCell><p className="max-w-56 truncate text-xs font-medium">{row.food_name ?? row.food_id ?? "No name"}</p><p className="mt-0.5 font-mono text-[10px] text-[var(--console-muted)]">{row.food_id ?? "No catalog id"}</p></TableCell>
              <TableCell muted>{row.source ?? "No source"}</TableCell>
              <TableCell numeric>{formatNumber(row.decision_count)}</TableCell>
              <TableCell numeric>{formatNumber(row.query_count)}</TableCell>
              <TableCell className="max-w-64 truncate" muted>{row.query_examples.join(" · ") || "No examples"}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </MetricState>
    </Panel>
  );
}

function GapPanel({ rows, state }: { rows: IngredientGapRow[]; state: MetricBundleState }) {
  return (
    <Panel title="Unresolved and rejected gaps" description="Controlled verdict and reject buckets only; raw reject text is not part of the contract." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "ingredient_gaps")} empty={rows.length === 0} emptyMessage="No unmatched or rejected ingredient decisions were returned for this window.">
        <SimpleTable columns={["Query", "Verdict", "Bucket", "Count"]} caption="Ingredient coverage gaps">
          {rows.slice(0, 24).map((row) => (
            <TableRow key={`${row.rank}-${row.ingredient_query}-${row.verdict}-${row.reject_bucket}`}>
              <TableCell><span className="font-mono text-[11px]">{row.ingredient_query}</span></TableCell>
              <TableCell><SourceTag tone={row.verdict === "rejected" ? "warn" : "neutral"}>{row.verdict}</SourceTag></TableCell>
              <TableCell muted>{row.reject_bucket}</TableCell>
              <TableCell numeric>{formatNumber(row.count)}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </MetricState>
    </Panel>
  );
}

function RankPanel({ rows, state }: { rows: IngredientRankDistributionRow[]; state: MetricBundleState }) {
  return (
    <Panel title="Candidate rank distribution" description="Accepted decisions only, grouped by candidate pool size and selected rank." source={<SourceTag>AWS aggregate</SourceTag>}>
      <MetricState loading={state.loading} error={metricError(state, "ingredient_rank_distribution")} empty={rows.length === 0} emptyMessage="No accepted decisions with a valid selected rank were returned for this window.">
        <SimpleTable columns={["Pool size", "Selected rank", "Count", "Share"]} caption="Ingredient selected rank distribution">
          {rows.map((row) => (
            <TableRow key={`${row.pool_size}-${row.selected_rank}`}>
              <TableCell numeric>{row.pool_size}</TableCell>
              <TableCell numeric>{row.selected_rank}</TableCell>
              <TableCell numeric>{formatNumber(row.count)}</TableCell>
              <TableCell numeric muted>{formatPercent(row.share)}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      </MetricState>
    </Panel>
  );
}

function LiveDrilldowns({ range }: { range: string }) {
  const reverse = useReverseRows(range, 10);
  const corpus = useCorpusRows(range, 10);
  const unresolved = useUnresolved(range, 10);
  const overturn = useOverturnGroups(range, 8);
  return (
    <Panel title="Live catalog drilldowns" description="Existing cached Supabase RPCs remain available for deeper operator review. These panels are separate from the AWS aggregate contract." source={<SourceTag tone="live">Supabase cache</SourceTag>}>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        <div className="border border-[var(--console-rule)] bg-[var(--console-panel)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--console-muted)]">Reverse rows</p>
          <MetricState loading={reverse.loading} error={reverse.error} empty={reverse.rows.length === 0} emptyMessage="No live rows."><p className="mt-2 text-2xl font-semibold text-[var(--console-ink)]">{formatNumber(reverse.total)}</p><p className="mt-1 text-[11px] text-[var(--console-muted)]">catalog foods in current page</p></MetricState>
        </div>
        <div className="border border-[var(--console-rule)] bg-[var(--console-panel)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--console-muted)]">Corpus rows</p>
          <MetricState loading={corpus.loading} error={corpus.error} empty={corpus.rows.length === 0} emptyMessage="No live rows."><p className="mt-2 text-2xl font-semibold text-[var(--console-ink)]">{formatNumber(corpus.total)}</p><p className="mt-1 text-[11px] text-[var(--console-muted)]">accepted catalog rows</p></MetricState>
        </div>
        <div className="border border-[var(--console-rule)] bg-[var(--console-panel)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--console-muted)]">Unresolved queue</p>
          <MetricState loading={unresolved.loading} error={unresolved.error} empty={unresolved.rows.length === 0} emptyMessage="No live rows."><p className="mt-2 text-2xl font-semibold text-[var(--console-ink)]">{formatNumber(unresolved.total)}</p><p className="mt-1 text-[11px] text-[var(--console-muted)]">distinct unresolved queries</p></MetricState>
        </div>
        <div className="border border-[var(--console-rule)] bg-[var(--console-panel)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--console-muted)]">Overturn groups</p>
          <MetricState loading={overturn.loading} error={overturn.error} empty={overturn.rows.length === 0} emptyMessage="No live rows."><p className="mt-2 text-2xl font-semibold text-[var(--console-ink)]">{formatNumber(overturn.total)}</p><p className="mt-1 text-[11px] text-[var(--console-muted)]">query/rank groups</p></MetricState>
        </div>
      </div>
      <InlineNote>Live totals are returned by the existing cached RPCs. Raw request, session, and user identifiers are not rendered in this console.</InlineNote>
    </Panel>
  );
}

export default function IngredientsPage() {
  const [range, setRange] = React.useState<ConsoleRange>("30d");
  const [platform, setPlatform] = React.useState("all");
  const window = React.useMemo(() => {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromDate = new Date(`${to}T00:00:00Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - Number(range.slice(0, -1)) + 1);
    return { from: fromDate.toISOString().slice(0, 10), to };
  }, [range]);
  const bundle = useMetricBundle(INGREDIENT_METRICS, window.from, window.to);
  const demand = (bundle.data?.ingredient_demand ?? []) as IngredientDemandRow[];
  const mappings = (bundle.data?.ingredient_mappings ?? []) as IngredientMappingRow[];
  const reverse = (bundle.data?.corpus_reverse_lookup ?? []) as CorpusReverseLookupRow[];
  const gaps = (bundle.data?.ingredient_gaps ?? []) as IngredientGapRow[];
  const ranks = (bundle.data?.ingredient_rank_distribution ?? []) as IngredientRankDistributionRow[];
  const accepted = mappings.length ? mappings.reduce((total, row) => total + row.accepted_count, 0) : undefined;
  const decisions = mappings.length ? mappings.reduce((total, row) => total + row.decision_count, 0) : undefined;

  return (
    <ConsolePage>
      <PageIntro eyebrow="Data quality / Ingredients" title="Ingredients" description="Demand, candidate mappings, corpus coverage, and rank behavior from sanitized ingredient decisions, with live catalog drilldowns alongside the aggregate view.">
        <div className="grid gap-3 sm:justify-items-end">
          <RangeControl value={range} onChange={setRange} label="Decision window" options={["7d", "30d", "90d"]} />
          <ScopeControls values={{ platform }} onChange={(name, value) => name === "platform" && setPlatform(value)} supported={{ platform: false, locale: false, mealMode: false }} />
        </div>
      </PageIntro>

      <div className="mt-6 grid gap-3">
        <MetricRibbon items={[
          { label: "Observed queries", value: formatNumber(decisions), detail: "ingredient decisions", loading: bundle.loading, error: metricError(bundle, "ingredient_mappings") },
          { label: "Accepted decisions", value: formatNumber(accepted), detail: "shown mapping subset", tone: accepted == null ? "ink" : "green", loading: bundle.loading, error: metricError(bundle, "ingredient_mappings") },
          { label: "Demand rows", value: formatNumber(demand.length || undefined), detail: demand.length ? "capped ranked list" : "No demand rows", loading: bundle.loading, error: metricError(bundle, "ingredient_demand") },
          { label: "Corpus foods", value: formatNumber(reverse.length || undefined), detail: reverse.length ? "accepted reverse lookup" : "No accepted mappings", loading: bundle.loading, error: metricError(bundle, "corpus_reverse_lookup") },
        ]} />

        <div className="grid gap-3 xl:grid-cols-[0.75fr_1.25fr]">
          <DemandPanel rows={demand} state={bundle} />
          <MappingPanel rows={mappings} state={bundle} />
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <ReversePanel rows={reverse} state={bundle} />
          <GapPanel rows={gaps} state={bundle} />
        </div>
        <RankPanel rows={ranks} state={bundle} />
        <LiveDrilldowns range={range} />
        <InlineNote tone="plain">Platform, locale, and meal-mode selectors are intentionally marked “Not segmented”: the current ingredient aggregate payloads do not carry those dimensions.</InlineNote>
      </div>
    </ConsolePage>
  );
}
