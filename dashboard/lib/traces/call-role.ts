import type { CallRole, TraceCall, TraceStage } from './types';
/** One role classifier for both telemetry adapters. JSON shape outranks legacy token heuristics. */
export function responseCallRole(response: unknown): CallRole | null {
  if (typeof response === 'string') {
    try { response = JSON.parse(response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return null; }
  }
  const key = response && typeof response === 'object' && !Array.isArray(response) ? Object.keys(response)[0] : null;
  return key === 'ranking' ? 'selector' : key === 'mealItems' ? 'call2_chunk' : null;
}
export function inferCallRole(call: {role?: unknown; stage?: unknown; response?: unknown; inputTokens?: number|null; outputTokens?: number|null; legacyTokenShape?: boolean}): CallRole {
  const roles: CallRole[] = ['call1','selector','call2_chunk','rescue_call1','rescue_selector','rescue_call2'];
  const inSelection = call.stage === 'matching' || call.stage === 'nutrition';
  const responseRole = responseCallRole(call.response);
  if (String(call.role).startsWith('rescue') && roles.includes(call.role as CallRole) && !call.legacyTokenShape) return call.role as CallRole;
  if (inSelection && responseRole) return responseRole;
  const selectorShape = inSelection && call.outputTokens != null && call.outputTokens <= 64 && call.inputTokens != null && call.inputTokens < 4000;
  if (call.legacyTokenShape && selectorShape) return 'selector';
  if (roles.includes(call.role as CallRole)) return call.role as CallRole;
  if (roles.includes(call.stage as CallRole)) return call.stage as CallRole;
  if (call.stage === 'decomposition') return 'call1';
  if (selectorShape) return 'selector';
  if (call.stage === 'nutrition' && call.outputTokens != null && call.outputTokens > 64) return 'call2_chunk';
  return 'unknown';
}

/** Timing distinguishes a dish mini-meal from a decomposition re-ask.
 * Run at the adapter boundary, before graph responses are stripped. */
export function classifyRescues(calls: TraceCall[], stages: TraceStage[]): void {
  const decomposition = stages.find(s => s.name === 'decomposition');
  const decompositionEnd = decomposition?.durationMs == null ? null : Date.parse(decomposition.startedAt) + decomposition.durationMs;
  const start = (c: TraceCall) => c.startedAt ? Date.parse(c.startedAt) : NaN;
  const ordered = [...calls].sort((a,b) => start(a)-start(b));
  const waiting: TraceCall[] = [];
  for (const c of ordered) {
    const stage = stages.find(s => s.key === c.stage || s.name === c.stage)?.name ?? c.stage;
    if (c.role === 'rescue_call1' || (stage === 'decomposition' && decompositionEnd !== null && start(c) >= decompositionEnd)) {
      c.role = 'rescue_call1';
      waiting.push(c);
    } else if (c.role === 'rescue_call2' || c.role === 'call2_chunk') {
      const index = waiting.findLastIndex(r => r.latencyMs !== null && start(c) >= start(r) + r.latencyMs);
      if (index >= 0) {
        const rescue = waiting.splice(index, 1)[0];
        c.role = 'rescue_call2';
        c.rescueGroup = rescue.id;
      }
    }
    if (c.role.startsWith('rescue')) {
      try {
        const response = typeof c.response === 'string' ? JSON.parse(c.response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) : c.response;
        const item = response?.mealItems?.[0];
        const name = item?.name ?? item?.mealItemName;
        if (typeof name === 'string') c.dishName = name;
      } catch { /* Missing or malformed response is honest unnamed rescue metadata. */ }
    }
  }
}
