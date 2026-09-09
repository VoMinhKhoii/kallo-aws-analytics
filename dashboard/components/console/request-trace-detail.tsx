"use client";

import {
  MetricState,
  Panel,
  RefreshButton,
  SourceTag,
} from "@/components/console/console";
import {
  useTraceDetail,
  type TraceMealItem,
  type TraceNutrition,
} from "@/lib/analytics-hooks";

const duration = (milliseconds: number) =>
  milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${milliseconds.toLocaleString("en-US")} ms`;

const macro = (value: number | null | undefined, unit = "") =>
  value == null || !Number.isFinite(value) ? "—" : `${Math.round(value).toLocaleString("en-US")}${unit}`;

function NutritionRow({ label, nutrition, total = false }: { label: string; nutrition?: TraceNutrition; total?: boolean }) {
  return (
    <tr className={total ? "border-t-2 border-[var(--console-rule)] font-semibold" : "border-t border-[var(--console-rule)]"}>
      <th scope="row" className="py-2.5 pr-4 text-left font-medium">{label}</th>
      <td className="px-3 py-2.5 text-right tabular-nums">{macro(nutrition?.caloriesKcal)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{macro(nutrition?.proteinG, "g")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{macro(nutrition?.carbohydrateG, "g")}</td>
      <td className="py-2.5 pl-3 text-right tabular-nums">{macro(nutrition?.fatG, "g")}</td>
    </tr>
  );
}

function MealAnalysis({ items, total }: { items: TraceMealItem[]; total?: TraceNutrition }) {
  return (
    <section className="border-t border-[var(--console-rule)] pt-5" aria-labelledby="trace-result-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="trace-result-heading" className="text-sm font-semibold text-[var(--console-ink)]">Final meal analysis</h3>
        <span className="text-[11px] text-[var(--console-muted)]">Displayed nutrition returned to the app</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-xs">
          <thead className="text-[10px] uppercase tracking-[0.08em] text-[var(--console-muted)]">
            <tr><th className="pb-2 pr-4 text-left">Meal item</th><th className="px-3 pb-2 text-right">kcal</th><th className="px-3 pb-2 text-right">Protein</th><th className="px-3 pb-2 text-right">Carbs</th><th className="pb-2 pl-3 text-right">Fat</th></tr>
          </thead>
          <tbody>
            {items.map((item, index) => <NutritionRow key={`${item.name}-${index}`} label={item.name} nutrition={item.displayedNutrition} />)}
            <NutritionRow label="Total" nutrition={total} total />
          </tbody>
        </table>
      </div>
      {items.some((item) => (item.ingredients?.length ?? 0) > 0) ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {items.map((item, itemIndex) => item.ingredients?.length ? (
            <div key={`${item.name}-ingredients-${itemIndex}`} className="border-t border-[var(--console-rule)] pt-3">
              <h4 className="text-xs font-semibold">{item.name}</h4>
              <ul className="mt-2 divide-y divide-[var(--console-rule)] text-xs">
                {item.ingredients.map((ingredient, ingredientIndex) => (
                  <li key={`${ingredient.ingredientName}-${ingredientIndex}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                    <span>{ingredient.ingredientName ?? "Unnamed ingredient"}</span>
                    <span className="font-mono text-[11px] text-[var(--console-muted)]">
                      {ingredient.estimatedGrams == null ? "quantity unavailable" : `${macro(ingredient.estimatedGrams, "g")} estimated`}
                      {ingredient.matchConfidence ? ` · ${ingredient.matchConfidence}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null)}
        </div>
      ) : null}
    </section>
  );
}

export function RequestTraceDetail({ requestId }: { requestId: string }) {
  const trace = useTraceDetail(requestId);
  const data = trace.data;
  const nutritionItems = data?.analysis.mealItems ?? [];
  const totalTokens = data?.modelCalls.reduce((sum, call) => sum + call.inputTokens + call.outputTokens, 0) ?? 0;

  return (
    <Panel
      title="Selected meal analysis"
      description={`Request ${requestId.slice(0, 8)} · exact bounded operator trace`}
      source={(
        <div className="flex items-center gap-2">
          <SourceTag tone={trace.error ? "error" : "live"}>Supabase RPC</SourceTag>
          <RefreshButton refreshing={trace.refreshing} onClick={trace.refresh} label="Refresh trace" />
        </div>
      )}
    >
      <MetricState
        loading={trace.loading}
        error={trace.error}
        empty={!data}
        emptyMessage="No trace was returned for this request id."
      >
        {data ? (
          <div className="space-y-5 px-4 py-5 sm:px-5">
            <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-5">
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Status</dt><dd className="mt-1 text-sm font-medium capitalize">{data.status ?? "unknown"}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">End to end</dt><dd className="mt-1 text-sm font-medium tabular-nums">{duration(data.total)}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Ingredients</dt><dd className="mt-1 text-sm font-medium tabular-nums">{data.counts.ingredients.toLocaleString("en-US")}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Model calls</dt><dd className="mt-1 text-sm font-medium tabular-nums">{data.modelCalls.length} · {totalTokens.toLocaleString("en-US")} tokens</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Started</dt><dd className="mt-1 text-sm font-medium tabular-nums">{data.startedAt ? new Date(data.startedAt).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : "—"}</dd></div>
            </dl>

            {data.meal ? <p className="border-t border-[var(--console-rule)] pt-4 text-sm leading-6"><span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Analyzed meal</span>{data.meal}</p> : null}

            <section className="border-t border-[var(--console-rule)] pt-5" aria-labelledby="trace-stages-heading">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="trace-stages-heading" className="text-sm font-semibold">Pipeline stages</h3>
                <span className="text-[11px] text-[var(--console-muted)]">Retries remain visible as separate stage rows</span>
              </div>
              <ol className="space-y-2">
                {data.spans.map((span) => {
                  const share = data.total ? Math.max(2, Math.min(100, (span.dur / data.total) * 100)) : 2;
                  return (
                    <li key={span.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-xs">
                      <span className="truncate font-medium capitalize"><span className="mr-2 font-mono text-[10px] text-[var(--console-muted)]">#{span.index}</span>{span.name}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-[var(--console-panel)]" aria-hidden="true"><span className={`block h-full rounded-full ${span.ok ? "bg-[var(--console-green)]" : "bg-[var(--console-brick)]"}`} style={{ width: `${share}%` }} /></span>
                      <span className="min-w-16 text-right font-mono text-[11px] text-[var(--console-muted)]">{duration(span.dur)}</span>
                    </li>
                  );
                })}
              </ol>
            </section>

            {data.modelCalls.length ? (
              <section className="overflow-x-auto border-t border-[var(--console-rule)] pt-5" aria-labelledby="trace-model-heading">
                <h3 id="trace-model-heading" className="mb-2 text-sm font-semibold">AI model calls</h3>
                <table className="w-full min-w-[42rem] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-[0.08em] text-[var(--console-muted)]"><tr><th className="py-2 pr-4">Stage</th><th className="py-2 pr-4">Model</th><th className="py-2 pr-4">Attempt</th><th className="py-2 pr-4 text-right">Latency</th><th className="py-2 pr-4 text-right">Input</th><th className="py-2 pr-4 text-right">Output</th><th className="py-2">Result</th></tr></thead>
                  <tbody>{data.modelCalls.map((call, index) => <tr key={`${call.stage}-${call.model}-${index}`} className="border-t border-[var(--console-rule)]"><td className="py-2.5 pr-4 capitalize">{call.stage}</td><td className="py-2.5 pr-4 font-mono text-[11px]">{call.model}</td><td className="py-2.5 pr-4 tabular-nums">{call.attempt}</td><td className="py-2.5 pr-4 text-right tabular-nums">{duration(call.latencyMs)}</td><td className="py-2.5 pr-4 text-right tabular-nums">{call.inputTokens.toLocaleString("en-US")}</td><td className="py-2.5 pr-4 text-right tabular-nums">{call.outputTokens.toLocaleString("en-US")}</td><td className={call.ok ? "py-2.5 text-[var(--console-green)]" : "py-2.5 text-[var(--console-brick)]"}>{call.ok ? "OK" : call.error ?? "Error"}</td></tr>)}</tbody>
                </table>
              </section>
            ) : null}

            {nutritionItems.length || data.analysis.displayedNutrition ? <MealAnalysis items={nutritionItems} total={data.analysis.displayedNutrition} /> : null}

            {data.rows.length > 0 ? (
              <section className="overflow-x-auto border-t border-[var(--console-rule)] pt-5" aria-labelledby="trace-decisions-heading">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h3 id="trace-decisions-heading" className="text-sm font-semibold">Ingredient retrieval decisions</h3><span className="text-[11px] text-[var(--console-muted)]">{data.counts.accepted} accepted · {data.counts.unmatched} unmatched · {data.counts.rejected} rejected</span></div>
                <table className="w-full min-w-[38rem] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-[0.08em] text-[var(--console-muted)]"><tr><th className="py-2 pr-4">Ingredient</th><th className="py-2 pr-4">Selected match</th><th className="py-2 pr-4 text-right">Pool</th><th className="py-2 pr-4">Choice</th><th className="py-2">Verdict</th></tr></thead>
                  <tbody>{data.rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-[var(--console-rule)]"><td className="py-2.5 pr-4">{row[0]}</td><td className="py-2.5 pr-4">{row[1]}</td><td className="py-2.5 pr-4 text-right tabular-nums">{row[2]}</td><td className="py-2.5 pr-4">{row[3]}</td><td className="py-2.5 capitalize">{row[4]}</td></tr>)}</tbody>
                </table>
              </section>
            ) : null}
          </div>
        ) : null}
      </MetricState>
    </Panel>
  );
}
