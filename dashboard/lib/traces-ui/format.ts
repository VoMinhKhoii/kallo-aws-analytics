import { ms } from '../ai-usage/format';
export const callLatency = (value:number|null) => ms(value !== null && value > 0 ? value : null);
export function tokenText(call:{inputTokens:number|null;cachedTokens:number|null;outputTokens:number|null}) {
  const fmt=(value:number|null)=>value===null?'—':value.toLocaleString('en-US');
  return `in ${fmt(call.inputTokens)}${call.cachedTokens?` · cached ${fmt(call.cachedTokens)}`:''} · out ${fmt(call.outputTokens)}`;
}
