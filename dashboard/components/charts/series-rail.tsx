"use client";
import type { ReactNode } from 'react';
import type { LocalFocus } from './use-local-focus';
export { useLocalFocus } from './use-local-focus';
export interface SeriesRailItem {
  key: string;
  label: string;
  color: string;
  value: string;
  sub?: string;
  glyph?: ReactNode;
}
export function SeriesRail({ items, focus, label = 'Series', inline = false }: {
  items: SeriesRailItem[];
  focus: LocalFocus;
  label?: string;
  /** A one-line legend for a chart's header, in place of the rail beside it. */
  inline?: boolean;
}) {
  if (inline) return <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
    {items.map(item => <button key={item.key} type="button" aria-pressed={focus.pinned === item.key} title={item.sub} onMouseEnter={() => focus.setHovered(item.key)} onMouseLeave={() => focus.setHovered(null)} onFocus={() => focus.setHovered(item.key)} onBlur={() => focus.setHovered(null)} onClick={() => focus.togglePin(item.key)} className="flex min-w-0 items-center gap-1.5 rounded py-0.5 text-[12px] transition-opacity duration-150" style={{ opacity: focus.active && focus.active !== item.key ? 0.4 : 1 }}>
      <span className="size-2 shrink-0 rounded-sm" style={{background: item.color}} />
      <span className="text-muted-foreground">{item.label}</span>
      <span className="tabular font-medium">{item.value}</span>
    </button>)}
  </div>;
  return <div role="group" aria-label={label} className="flex w-full flex-col justify-center gap-0.5 border-border sm:w-[240px] sm:shrink-0 sm:border-l sm:pl-3">
    {items.map(item => <button
      key={item.key}
      type="button"
      aria-pressed={focus.pinned === item.key}
      onMouseEnter={() => focus.setHovered(item.key)}
      onMouseLeave={() => focus.setHovered(null)}
      onFocus={() => focus.setHovered(item.key)}
      onBlur={() => focus.setHovered(null)}
      onClick={() => focus.togglePin(item.key)}
      className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-[opacity,background-color] duration-150 hover:bg-secondary aria-pressed:bg-secondary"
      style={{ opacity: focus.active && focus.active !== item.key ? 0.4 : 1 }}
    >
      {item.glyph ?? <span className="size-2 shrink-0 rounded-sm" style={{background: item.color}} />}
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="break-words text-[12.5px] font-medium">{item.label}</span>
        {item.sub && <span className="text-muted-foreground break-words text-[11px]">{item.sub}</span>}
      </span>
      <span className="tabular shrink-0 text-[13px] font-medium">{item.value}</span>
    </button>)}
  </div>;
}
