/** Shared API contracts. Safe for client imports; contains no server dependencies. */
export type Nutrient = number | { low: number; mid: number; high: number } | null;
export type CallId = string;
export interface TraceSummary {
  modelCall1: string | null; modelCall2: string | null; ingredients: number; unmatched: number;
  attempts: number; chunkCount: number; rescueCount: number; fallbacks: number; retries: number; kcalMid: number | null; items: number | null; error: string | null;
  id: string; createdAt: string; status: string; durationMs: number | null;
  rawInput: string; mealName: string; profile: string | null; models: string[];
  kcal: number | null; protein: number | null; carbs: number | null; fat: number | null;
  itemCount: number | null; errorCode: string | null; calls: number; costUsd: number | null;
}
export interface TraceList { rows: TraceSummary[]; next: string | null; items: TraceSummary[]; nextCursor: string | null; retentionDays: number }
export interface TraceItem {
  name: string; grams: number | null; kcal: Nutrient; protein: Nutrient; carbs: Nutrient; fat: Nutrient;
  source: string | null; matched: boolean | null;
}
export type CallRole = 'call1' | 'selector' | 'call2_chunk' | 'rescue_call1' | 'rescue_selector' | 'rescue_call2' | 'unknown';
export interface TraceCall {
  dishName?: string; rescueGroup?: string;
  roleEvidence?: 'response'; role: CallRole; createdAt?: string; stageLogId?: string | null; workKind?: string | null; hasPrompt?: boolean; hasResponse?: boolean; afterResponse?: boolean; promptIsTemplate?: boolean;
  id: CallId; stage: string | null; attempt: number; provider: string | null; model: string;
  startedAt?: string; latencyMs: number | null; inputTokens: number | null; cachedTokens: number | null;
  cacheWriteTokens: number | null; outputTokens: number | null; thoughtTokens: number | null;
  costUsd: number | null; error: string | null; fallbackFrom: string | null; promptVersionId: string | null;
  prompt?: string; response?: string;
}
export interface TraceStage {
  key: string; name: string; index: number; startedAt: string; durationMs: number | null;
  stats: Record<string, number | string | null>;
  status: string; error: string | null; inputBytes?: number; outputBytes?: number; input: unknown; output: unknown; calls: CallId[];
}
export interface TraceDetail {
  id: string; source: 'd1' | 'logging' | 'postgres'; createdAt: string; status: string;
  errorCode: string | null; error: string | null; durationMs: number | null;
  rawInput: string; mealName: string; profile: string | null;
  summary: { kcal: Nutrient; protein: Nutrient; carbs: Nutrient; fat: Nutrient; items: TraceItem[] };
  stages: TraceStage[]; calls: TraceCall[]; gaps: { after: string; ms: number }[];
  completeness: { stagesExpected: number; stagesFound: number; callsLogged: number; callsBilled: number; truncated: boolean };
}

export type TraceGraphDetail = Omit<TraceDetail, 'stages' | 'calls'> & {
  stages: (Omit<TraceStage, 'input' | 'output'> & { inputBytes: number; outputBytes: number })[];
  calls: (Omit<TraceCall, 'prompt' | 'response'> & { hasPrompt: boolean; hasResponse: boolean })[];
};
export type TracePayload = { input: unknown; output: unknown } | { prompt: string | null; response: string | null; promptIsTemplate?: boolean };
