import { modelLabel } from '@/lib/traces-ui/graph';
import type { TraceGraphDetail } from '@/lib/traces/types';
import { ms,usd } from '@/lib/ai-usage/format';
export function ModelDetails({call:c}:{call:TraceGraphDetail['calls'][number]}) {
  const entries=[['Model',modelLabel(c.model)],['Provider',c.provider],['Attempt',c.attempt],['Tokens in',c.inputTokens],['Cached',c.cachedTokens],['Cache write',c.cacheWriteTokens],['Tokens out',c.outputTokens],['Thought',c.thoughtTokens],['Cost',usd(c.costUsd)],['Latency',ms(c.latencyMs)],['Prompt version',c.promptVersionId],['Cache status',c.cachedTokens?'cached tokens recorded':'not recorded'],['Fallback from',c.fallbackFrom?modelLabel(c.fallbackFrom):null],['Error category',c.error]];
  return <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2">{entries.map(([k,v])=><div className="contents" key={k}><dt className="text-muted-foreground">{k}</dt><dd className="tabular break-words">{v??'—'}{k==='Prompt version'&&v&&<button aria-label="Copy prompt version" onClick={()=>void navigator.clipboard.writeText(String(v))} className="ml-2 text-muted-foreground underline">Copy</button>}</dd></div>)}</dl>;
}
