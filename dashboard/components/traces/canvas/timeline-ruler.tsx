import { timelineEnd, type Step } from '@/lib/traces-ui/graph';
import { ms } from '@/lib/ai-usage/format';
export function TimelineRuler({steps,step,duration}:{steps:Step[];step:Step|null;duration:number}) {
  const spans=steps.filter(s=>s.kind==='stage'&&s.timingKnown!==false&&s.duration!=null);
  const end=timelineEnd(steps,duration);
  return <div className="shrink-0 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
    <div aria-label="Stage spans" className="relative" style={{height:Math.max(12,spans.length*6)}}>{spans.map((s,i)=><span key={s.id} title={`${s.name} · +${ms(s.start)} → +${ms(s.start+(s.duration??0))}`} className="absolute h-1 rounded-sm" style={{top:i*6,left:`${100*Math.max(0,s.start)/end}%`,width:`${Math.min(100,100*(s.duration??0)/end)}%`,minWidth:2,background:'var(--console-blue)',opacity:step&&step.id!==s.id ? .35 : 1}}/>)}</div>
    <div className="mt-1 flex justify-between gap-2"><span>+0 s</span><span aria-live="polite">{step?.timingKnown===false?`${step.name} · start not recorded`:step?`${step.name} · +${ms(step.start)} → +${ms(step.start+(step.duration??0))}`:'Stage spans · hover a step to inspect'}</span><span>+{ms(end)}</span></div>
  </div>;
}
