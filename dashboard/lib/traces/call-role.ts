import type { CallRole } from './types';
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
