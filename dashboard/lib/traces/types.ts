/** Shared API contracts. Safe for client imports; contains no server dependencies. */
export type Nutrient = number | { low: number; mid: number; high: number } | null;
export type CallId = string;
export interface TraceSummary {
  id: string; createdAt: string; status: string; durationMs: number | null;
  rawInput: string; mealName: string; profile: string | null; models: string[];
  kcal: number | null; protein: number | null; carbs: number | null; fat: number | null;
  itemCount: number | null; errorCode: string | null; calls: number; costUsd: number | null;
}
export interface TraceList { items: TraceSummary[]; nextCursor: string | null; retentionDays: number }
export interface TraceItem {
  name: string; grams: number | null; kcal: Nutrient; protein: Nutrient; carbs: Nutrient; fat: Nutrient;
  source: string | null; matched: boolean | null;
}
export interface TraceCall {
  id: CallId; stage: string | null; attempt: number; provider: string | null; model: string;
  startedAt?: string; latencyMs: number | null; inputTokens: number | null; cachedTokens: number | null;
  cacheWriteTokens: number | null; outputTokens: number | null; thoughtTokens: number | null;
  costUsd: number | null; error: string | null; fallbackFrom: string | null; promptVersionId: string | null;
  prompt?: string; response?: string;
}
export interface TraceStage {
  key: string; name: string; index: number; startedAt: string; durationMs: number | null;
  status: string; error: string | null; input: unknown; output: unknown; calls: CallId[];
}
export interface TraceDetail {
  id: string; source: 'logging' | 'postgres'; createdAt: string; status: string;
  errorCode: string | null; error: string | null; durationMs: number | null;
  rawInput: string; mealName: string; profile: string | null;
  summary: { kcal: Nutrient; protein: Nutrient; carbs: Nutrient; fat: Nutrient; items: TraceItem[] };
  stages: TraceStage[]; calls: TraceCall[]; gaps: { after: string; ms: number }[];
  completeness: { stagesExpected: number; stagesFound: number; callsLogged: number; callsBilled: number; truncated: boolean };
}
