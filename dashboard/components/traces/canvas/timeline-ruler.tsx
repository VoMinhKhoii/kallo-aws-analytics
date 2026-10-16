import type { Step } from '@/lib/traces-ui/graph';
import { ms } from '@/lib/ai-usage/format';
export function TimelineRuler({step,duration}:{step:Step|null;duration:number}) {
  const end=Math.max(duration,step?(step.start+(step.duration??0)):0,1);
  return <div className="h-10 border-t border-border px-4 pt-1 text-[11px] text-muted-foreground"><div className="relative h-1 bg-secondary">{step&&step.timingKnown!==false&&<span className="absolute h-1 bg-[var(--console-blue)]" style={{left:`${100*Math.max(0,step.start)/end}%`,width:`${Math.min(100,100*(step.duration??0)/end)}%`}}/>}</div><div className="mt-1 flex justify-between"><span>+0 s</span><span aria-live="polite">{step?.timingKnown===false?`${step.name} · start not recorded`:step?`${step.name} · +${ms(step.start)} → +${ms(step.start+(step.duration??0))}`:'Hover a step to inspect its span'}</span><span>+{ms(end)}</span></div></div>;
}
