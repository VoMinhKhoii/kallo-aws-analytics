import type { Nutrient, TraceCall, TraceDetail, TraceItem, TraceStage } from './types';
import { numberOrNull as n } from './query';
// Adapters accept database/log payloads at this boundary and expose one typed contract.
export type Row = Record<string, any>;
const str = (v: unknown): string | null => v == null ? null : String(v);
const timestamp = (v: unknown) => new Date(v as string).toISOString();
function nutrient(v: any): Nutrient {
  if (v == null) return null;
  if (typeof v === 'object') return n(v.low) !== null && n(v.mid) !== null && n(v.high) !== null ? { low: Number(v.low), mid: Number(v.mid), high: Number(v.high) } : null;
  return n(v);
}
export function nutrition(result: Row = {}): TraceDetail['summary'] {
  const values = (r: Row) => {
    const b = r.boundedNutrition || r.displayedNutrition || r;
    return { kcal: nutrient(b.kcal ?? b.caloriesKcal), protein: nutrient(b.protein ?? b.proteinG), carbs: nutrient(b.carbs ?? b.carbohydrateG), fat: nutrient(b.fat ?? b.fatG) };
  };
  const items: TraceItem[] = (result.items || result.mealItems || []).map((item: Row) => ({
    name: String(item.name || item.mealItemName || item.ingredientName || ''),
    grams: n(item.grams ?? item.estimatedGrams ?? item.ingredients?.reduce((sum: number, i: Row) => sum + Number(i.estimatedGrams || 0), 0)),
    ...values(item), source: str(item.source), matched: typeof item.matched === 'boolean' ? item.matched : item.foodCompositionId ? true : null,
  }));
  return { ...values(result), items };
}
export function normalizeCall(c: Row): TraceCall {
  return { id: String(c.id || c.eventId), stage: str(c.stage), attempt: Number(c.attempt || 1), provider: str(c.provider) || (String(c.model).includes('claude') ? 'anthropic' : String(c.model).includes('gemini') ? 'google' : null),
    model: String(c.model || 'unknown'), ...(c.startedAt || c.created_at ? { startedAt: c.startedAt ? timestamp(c.startedAt) : new Date(Date.parse(c.created_at) - Number(c.latency_ms || 0)).toISOString() } : {}),
    latencyMs: n(c.latencyMs ?? c.latency_ms), inputTokens: n(c.inputTokens ?? c.input_tokens), cachedTokens: n(c.cachedTokens ?? c.cached_tokens),
    cacheWriteTokens: n(c.cacheWriteTokens ?? c.cache_write_tokens), outputTokens: n(c.outputTokens ?? c.output_tokens), thoughtTokens: n(c.thoughtTokens ?? c.thought_tokens),
    costUsd: n(c.costUsd ?? c.cost_usd), error: str(c.error ?? c.error_category), fallbackFrom: str(c.fallbackFrom ?? c.fallback_from),
    promptVersionId: str(c.promptVersionId ?? c.prompt_version_id),
    ...(c.prompt ?? c.prompt_rendered ? { prompt: String(c.prompt ?? c.prompt_rendered) } : {}),
    ...(c.response ?? c.response_raw ? { response: String(c.response ?? c.response_raw) } : {}),
  };
}
export function assembleDetail(request: Row, stages: TraceStage[], calls: TraceCall[], result: Row, source: TraceDetail['source'], billed: number, truncated = false): TraceDetail {
  stages.sort((a,b) => a.index-b.index || a.startedAt.localeCompare(b.startedAt));
  for (const s of stages) s.calls = calls.filter(c => c.stage === s.key || c.stage === s.name).map(c => c.id);
  const gaps: TraceDetail['gaps'] = [];
  for (let i=1; i<stages.length; i++) {
    const previous = stages[i-1];
    const ms = Date.parse(stages[i].startedAt) - Date.parse(previous.startedAt) - (previous.durationMs || 0);
    if (ms > 0) gaps.push({ after: previous.key, ms });
  }
  const summary = nutrition(result);
  for (const [key, column] of [['kcal','calories_kcal'],['protein','protein_g'],['carbs','carbohydrate_g'],['fat','fat_g']] as const) summary[key] ??= n(request[column]);
  return { id: String(request.id), source, createdAt: timestamp(request.createdAt || request.created_at), status: String(request.status),
    errorCode: str(request.errorCode ?? request.error_code), error: str(request.error), durationMs: n(request.durationMs ?? request.duration_ms),
    rawInput: String(request.rawInput ?? request.raw_input ?? ''), mealName: String(request.mealName ?? request.meal_name ?? (summary.items.map(i => i.name).join(', ') || request.rawInput || request.raw_input || '').slice(0,160)),
    profile: str(request.profile ?? request.model_profile), summary, stages, calls, gaps,
    completeness: { stagesExpected: 4, stagesFound: stages.length, callsLogged: calls.length, callsBilled: billed, truncated },
  };
}
export function postgresDetail(request: Row, rows: Row[], callRows: Row[], budget: Row[], run: Row = {}): TraceDetail {
  const stages: TraceStage[] = rows.map(s => ({ key: String(s.id), name: String(s.stage), index: Number(s.stage_index),
    // Legacy created_at is written after the stage completes.
    startedAt: new Date(Date.parse(s.created_at) - Number(s.duration_ms || 0)).toISOString(), durationMs: n(s.duration_ms),
    status: String(s.status), error: str(s.error), input: s.input_json ?? null, output: s.output_json ?? null, calls: [] }));
  const used = new Set<string>();
  const calls = callRows.map(c => {
    // Budget events have no legacy call ID. Match once by model/time/token usage;
    // unmatched billed attempts remain separate rather than being silently lost.
    const b = budget.find(b => !used.has(b.id) && b.model === c.model && Math.abs(Date.parse(b.created_at)-Date.parse(c.created_at)) < 5000 && (b.input_tokens == null || b.input_tokens === c.input_tokens));
    if (b) used.add(b.id);
    return normalizeCall({ ...b, ...c, cost_usd: b?.cost_usd, cached_tokens: c.cached_tokens ?? b?.cached_tokens, thought_tokens: c.thought_tokens ?? b?.thought_tokens, cache_write_tokens: b?.cache_write_tokens, fallback_from: b?.fallback_from, stage: c.stage_log_id });
  });
  for (const b of budget) if (!used.has(b.id)) calls.push(normalizeCall({ ...b, id: 'budget:' + b.id }));
  const result = rows.find(s => s.stage === 'assembly')?.output_json?.result || {};
  const detail = assembleDetail({ ...request, duration_ms: request.duration_ms ?? run.total_ms }, stages, calls, result, 'postgres', budget.length,
    rows.some(s => s.truncated) || callRows.some(c => c.truncated) || rows.length >= 64 || callRows.length >= 128 || budget.length >= 256);
  detail.completeness.callsLogged = callRows.length;
  return detail;
}
