"use client";
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MetricTab { key: string; label: string; value: string; change?: ReactNode; title?: string }

/**
 * The page's headline: every figure is a tab, and the chosen one gets the big
 * panel below. `aside` fills the space to the right of the tabs and panel.
 */
export function MetricTabs({ tabs, value, onChange, aside, children }: { tabs: MetricTab[]; value: string; onChange: (key: string) => void; aside?: ReactNode; children: ReactNode }) {
  const dense = tabs.length > 5 || (aside != null && tabs.length > 3);
  return <section className={cn('grid gap-x-10 gap-y-8', aside != null && 'xl:grid-cols-[minmax(0,1fr)_360px]')}>
    <div className="min-w-0">
      <div role="tablist" aria-label="Metric" className={cn('flex flex-wrap gap-y-4 border-b border-border', dense ? 'gap-x-9' : 'gap-x-12')}>
        {tabs.map(t => {
          const on = t.key === value;
          return <button key={t.key} type="button" role="tab" aria-selected={on} title={t.title} onClick={() => onChange(t.key)} className={cn('-mb-px grid gap-1 border-b-2 pb-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--console-accent)]', dense ? 'min-w-24' : 'min-w-36', on ? 'border-[var(--console-accent)]' : 'border-transparent hover:border-[var(--console-rule-strong)]')}>
            <span className={cn('text-sm whitespace-nowrap', on ? 'text-foreground' : 'text-muted-foreground')}>{t.label}</span>
            <span className={cn('tabular font-medium whitespace-nowrap', dense ? 'text-[32px] leading-10 tracking-[-0.75px]' : 'text-[38px] leading-[44px] tracking-[-1px]')}>{t.value}</span>
            <span className="flex min-h-5 items-center">{t.change}</span>
          </button>;
        })}
      </div>
      <div role="tabpanel" className="pt-6">{children}</div>
    </div>
    {aside != null && <div className="min-w-0 [&>section]:border-t-0 [&>section]:pt-0">{aside}</div>}
  </section>;
}
