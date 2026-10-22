"use client";
import { plural } from '@/lib/traces-ui/graph';

import * as React from "react";
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
import { decimal, int, ms, pct } from "@/lib/ai-usage/format";
import { cn } from "@/lib/utils";

const duration = ms;
const macro = (value: number | null | undefined, unit = "") =>
  value == null || !Number.isFinite(value) ? "—" : `${int(value)}${unit}`;

const matchConfidence = (value: string | number | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) return `${pct(value, 0)} match`;
  return value ? String(value) : "";
};

const FIELD_LABELS: Record<string, string> = {
  mealItems: "Meals",
  ingredientName: "Ingredient",
  ingredients: "Ingredients",
  foodCompositionId: "Food composition ID",
  selectedCandidateId: "Selected candidate",
  selectedCandidateIdx: "Selected candidate rank",
  caloriesKcal: "Calories (kcal)",
  proteinG: "Protein (g)",
  carbohydrateG: "Carbohydrate (g)",
  fatG: "Fat (g)",
  grossG: "Gross weight (g)",
  edibleG: "Edible weight (g)",
  refusePct: "Refuse (%)",
  mealSlot: "Meal slot",
  isFood: "Recognized as food",
};

function fieldLabel(key: string) {
  return FIELD_LABELS[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function scalar(value: unknown) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">Not returned</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return decimal(value, 4, 0);
  return String(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasValue = (value: unknown) => value !== null && value !== undefined && value !== "";

const MAJOR_NUTRIENTS = new Set(["caloriesKcal", "proteinG", "carbohydrateG", "fatG"]);

function recordTitle(value: unknown, index: number) {
  if (!isRecord(value)) return `Entry ${index + 1}`;
  const name = value.matchedName ?? value.ingredientName ?? value.name ?? value.foodCompositionId;
  return name ? String(name) : `Entry ${index + 1}`;
}

function ScalarGrid({ entries }: { entries: [string, unknown][] }) {
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-[var(--console-rule)] bg-[var(--console-rule)] md:grid-cols-3 xl:grid-cols-4">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0 bg-[var(--console-surface)] px-2 py-2">
          <dt className="truncate text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">{fieldLabel(key)}</dt>
          <dd className="mt-1 break-words font-mono text-xs leading-5 text-foreground">{scalar(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NutritionOutput({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, item]) => hasValue(item));
  const major = entries.filter(([key]) => MAJOR_NUTRIENTS.has(key));
  const details = entries.filter(([key]) => !MAJOR_NUTRIENTS.has(key));
  return (
    <div className="grid gap-2">
      <ScalarGrid entries={major} />
      {details.length ? (
        <details className="group rounded border border-[var(--console-rule)] bg-[var(--console-surface)]">
          <summary className="cursor-pointer px-2 py-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]">
            {details.length} micronutrients and source fields
          </summary>
          <div className="border-t border-[var(--console-rule)] p-2"><ScalarGrid entries={details} /></div>
        </details>
      ) : null}
    </div>
  );
}

function StructuredOutput({ value, depth = 0, contextKey = "" }: { value: unknown; depth?: number; contextKey?: string }) {
  if (!Array.isArray(value) && (!value || typeof value !== "object")) {
    return <span className="font-mono text-xs text-foreground">{scalar(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-xs text-muted-foreground">No entries</span>;
    return (
      <ol className="divide-y divide-[var(--console-rule)]">
        {value.slice(0, 20).map((item, index) => (
          <li key={index} className="py-4 first:pt-0 last:pb-0">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              <h4 className="text-xs font-semibold text-foreground">{recordTitle(item, index)}</h4>
            </div>
            <StructuredOutput value={item} depth={depth + 1} contextKey={contextKey} />
          </li>
        ))}
        {value.length > 20 ? <li className="py-2 text-xs text-muted-foreground">{value.length - 20} more bounded entries</li> : null}
      </ol>
    );
  }

  const record = value as Record<string, unknown>;
  if (/nutrition/i.test(contextKey)) return <NutritionOutput value={record} />;

  const entries = Object.entries(record).filter(([, item]) => hasValue(item));
  if (!entries.length) return <span className="text-xs text-muted-foreground">No structured fields</span>;
  const simple = entries.filter(([, item]) => !Array.isArray(item) && !isRecord(item));
  const composite = entries.filter(([, item]) => Array.isArray(item) || isRecord(item));
  return (
    <div className="grid gap-4">
      <ScalarGrid entries={simple} />
      {composite.map(([key, item]) => (
        <section key={key} className={cn("grid gap-2", depth > 0 && "border-t border-[var(--console-rule)] pt-4")}>
          <div className="flex items-baseline justify-between gap-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{fieldLabel(key)}</h4>
            {Array.isArray(item) ? <span className="font-mono text-xs text-muted-foreground">{item.length} entries</span> : null}
          </div>
          <StructuredOutput value={item} depth={depth + 1} contextKey={key} />
        </section>
      ))}
    </div>
  );
}

function NutritionRow({ label, nutrition, total = false }: { label: string; nutrition?: TraceNutrition; total?: boolean }) {
  return (
    <tr className={total ? "border-t-2 border-[var(--console-rule)] font-semibold" : "border-t border-[var(--console-rule)]"}>
      <th scope="row" className="py-2 pr-4 text-left font-medium">{label}</th>
      <td className="px-4 py-2 text-right tabular-nums">{macro(nutrition?.caloriesKcal)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{macro(nutrition?.proteinG, "g")}</td>
      <td className="px-4 py-2 text-right tabular-nums">{macro(nutrition?.carbohydrateG, "g")}</td>
      <td className="py-2 pl-4 text-right tabular-nums">{macro(nutrition?.fatG, "g")}</td>
    </tr>
  );
}

function MealAnalysis({ items, total }: { items: TraceMealItem[]; total?: TraceNutrition }) {
  return (
    <section className="border-t border-[var(--console-rule)] pt-6" aria-labelledby="trace-result-heading">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="trace-result-heading" className="text-sm font-semibold text-foreground">Final meal analysis</h3>
        <span className="text-xs text-muted-foreground">Displayed nutrition returned to the app</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-xs">
          <thead className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            <tr><th className="pb-2 pr-4 text-left">Meal</th><th className="px-4 pb-2 text-right">kcal</th><th className="px-4 pb-2 text-right">Protein</th><th className="px-4 pb-2 text-right">Carbs</th><th className="pb-2 pl-4 text-right">Fat</th></tr>
          </thead>
          <tbody>
            {items.map((item, index) => <NutritionRow key={`${item.name}-${index}`} label={item.name} nutrition={item.displayedNutrition} />)}
            <NutritionRow label="Total" nutrition={total} total />
          </tbody>
        </table>
      </div>
      {items.some((item) => (item.ingredients?.length ?? 0) > 0) ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {items.map((item, itemIndex) => item.ingredients?.length ? (
            <div key={`${item.name}-ingredients-${itemIndex}`} className="border-t border-[var(--console-rule)] pt-4">
              <h4 className="text-xs font-semibold">{item.name}</h4>
              <ul className="mt-2 divide-y divide-[var(--console-rule)] text-xs">
                {item.ingredients.map((ingredient, ingredientIndex) => (
                  <li key={`${ingredient.ingredientName}-${ingredientIndex}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                    <span>{ingredient.ingredientName ?? "Unnamed ingredient"}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {ingredient.estimatedGrams == null ? "quantity unavailable" : `${macro(ingredient.estimatedGrams, "g")} estimated`}
                      {matchConfidence(ingredient.matchConfidence) ? ` · ${matchConfidence(ingredient.matchConfidence)}` : ""}
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
  const stageOutputs = data?.stageOutputs ?? [];
  const [selectedStageKey, setSelectedStageKey] = React.useState<string | null>(null);
  const nutritionItems = data?.analysis.mealItems ?? [];
  const totalTokens = data?.modelCalls.reduce((sum, call) => sum + call.inputTokens + call.outputTokens, 0) ?? 0;
  const selectedStage = stageOutputs.find((stage) => stage.key === selectedStageKey) ?? stageOutputs[0];

  React.useEffect(() => {
    if (!stageOutputs.length) {
      setSelectedStageKey(null);
      return;
    }
    setSelectedStageKey((current) => stageOutputs.some((stage) => stage.key === current) ? current : stageOutputs[0].key);
  }, [requestId, stageOutputs]);

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
          <div className="space-y-6 px-4 py-6 sm:px-6">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-5">
              <div><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Status</dt><dd className="mt-1 text-sm font-medium capitalize">{data.status ?? "unknown"}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">End to end</dt><dd className="mt-1 text-sm font-medium tabular-nums">{duration(data.total)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ingredients</dt><dd className="mt-1 text-sm font-medium tabular-nums">{int(data.counts.ingredients)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Model calls</dt><dd className="mt-1 text-sm font-medium tabular-nums">{int(data.modelCalls.length)} · {plural(totalTokens,'token')}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Started</dt><dd className="mt-1 text-sm font-medium tabular-nums">{data.startedAt ? new Date(data.startedAt).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : "—"}</dd></div>
            </dl>

            {data.rawInput || data.meal ? <div className="border-t border-[var(--console-rule)] pt-4"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{data.rawInput ? "Typed meal" : "Parsed meal summary"}</p><p className="mt-1 max-w-4xl text-sm font-medium leading-6 text-foreground">{data.rawInput ?? data.meal}</p>{data.rawInput && data.meal ? <p className="mt-1 text-xs text-muted-foreground">Returned meal groups: {data.meal}</p> : null}</div> : null}

            <section className="border-t border-[var(--console-rule)] pt-6" aria-labelledby="trace-stages-heading">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="trace-stages-heading" className="text-sm font-semibold">Pipeline stages</h3>
                <span className="text-xs text-muted-foreground">Retries remain visible as separate stage rows</span>
              </div>
              <ol className="space-y-2">
                {data.spans.map((span) => {
                  const share = data.total ? Math.max(2, Math.min(100, (span.dur / data.total) * 100)) : 2;
                  return (
                    <li key={span.key}>
                      <button type="button" aria-pressed={span.key === selectedStage?.key} onClick={() => setSelectedStageKey(span.key)} className={cn("grid w-full grid-cols-[7.5rem_1fr_auto] items-center gap-4 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-[var(--console-panel)] focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]", span.key === selectedStage?.key && "bg-[var(--console-panel)]")}>
                        <span className="truncate font-medium capitalize"><span className="mr-2 font-mono text-xs text-muted-foreground">#{span.index}</span>{span.name}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--console-rule)_65%,transparent)]" aria-hidden="true"><span className={`block h-full rounded-full ${span.ok ? "bg-[var(--console-green)]" : "bg-[var(--console-brick)]"}`} style={{ width: `${share}%` }} /></span>
                        <span className="min-w-16 text-right font-mono text-xs text-muted-foreground">{duration(span.dur)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>

            {selectedStage ? (
              <section className="border-t border-[var(--console-rule)] pt-6" aria-labelledby="trace-output-heading">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <div><h3 id="trace-output-heading" className="text-sm font-semibold capitalize">{selectedStage.name} output</h3><p className="mt-1 text-xs text-muted-foreground">Structured fields from this stage, with raw prompts, wire responses, and actor identifiers removed.</p></div>
                  <span className="font-mono text-xs text-muted-foreground">#{selectedStage.index} · {duration(selectedStage.durationMs)}</span>
                </div>
                <div className="rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-4 py-4 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--console-surface)_75%,transparent)] sm:px-4">
                  <StructuredOutput value={selectedStage.output} />
                </div>
              </section>
            ) : null}

            {data.modelCalls.length ? (
              <section className="overflow-x-auto border-t border-[var(--console-rule)] pt-6" aria-labelledby="trace-model-heading">
                <h3 id="trace-model-heading" className="mb-2 text-sm font-semibold">AI model calls</h3>
                <table className="w-full min-w-[42rem] text-left text-xs">
                  <thead className="text-xs uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="py-2 pr-4">Stage</th><th className="py-2 pr-4">Model</th><th className="py-2 pr-4">Attempt</th><th className="py-2 pr-4 text-right">Latency</th><th className="py-2 pr-4 text-right">Input</th><th className="py-2 pr-4 text-right">Output</th><th className="py-2">Result</th></tr></thead>
                  <tbody>{data.modelCalls.map((call, index) => <tr key={`${call.stage}-${call.model}-${index}`} className="border-t border-[var(--console-rule)]"><td className="py-2 pr-4 capitalize">{call.stage}</td><td className="py-2 pr-4 font-mono text-xs">{call.model}</td><td className="py-2 pr-4 tabular-nums">{int(call.attempt)}</td><td className="py-2 pr-4 text-right tabular-nums">{duration(call.latencyMs)}</td><td className="py-2 pr-4 text-right tabular-nums">{int(call.inputTokens)}</td><td className="py-2 pr-4 text-right tabular-nums">{int(call.outputTokens)}</td><td className={call.ok ? "py-2 text-muted-foreground mark-good" : "py-2 text-foreground mark-bad"}>{call.ok ? "OK" : call.error ?? "Error"}</td></tr>)}</tbody>
                </table>
              </section>
            ) : null}

            {nutritionItems.length || data.analysis.displayedNutrition ? <MealAnalysis items={nutritionItems} total={data.analysis.displayedNutrition} /> : null}

            {data.rows.length > 0 ? (
              <section className="overflow-x-auto border-t border-[var(--console-rule)] pt-6" aria-labelledby="trace-decisions-heading">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h3 id="trace-decisions-heading" className="text-sm font-semibold">Ingredient retrieval decisions</h3><span className="text-xs text-muted-foreground">{int(data.counts.accepted)} accepted · {int(data.counts.unmatched)} unmatched · {int(data.counts.rejected)} rejected</span></div>
                <table className="w-full min-w-[38rem] text-left text-xs">
                  <thead className="text-xs uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="py-2 pr-4">Ingredient</th><th className="py-2 pr-4">Selected match</th><th className="py-2 pr-4 text-right">Pool</th><th className="py-2 pr-4">Choice</th><th className="py-2">Verdict</th></tr></thead>
                  <tbody>{data.rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-[var(--console-rule)]"><td className="py-2 pr-4">{row[0]}</td><td className="py-2 pr-4">{row[1]}</td><td className="py-2 pr-4 text-right tabular-nums">{row[2]}</td><td className="py-2 pr-4">{row[3]}</td><td className="py-2 capitalize">{row[4]}</td></tr>)}</tbody>
                </table>
              </section>
            ) : null}
          </div>
        ) : null}
      </MetricState>
    </Panel>
  );
}
