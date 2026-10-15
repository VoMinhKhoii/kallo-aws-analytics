"use client";

import * as React from "react";
import type { ModelMeta } from "@/lib/ai-usage/models";
import { cn } from "@/lib/utils";

/**
 * Focus for one chart: hovering a model in its rail (or its marks) dims the
 * others; a click pins that until clicked again. Never shared across charts.
 */
export function useLocalFocus() {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const active = hovered ?? pinned;
  return {
    active,
    pinned,
    setHovered,
    togglePin: (key: string) => setPinned((p) => (p === key ? null : key)),
    opacity: (key: string) => (active && active !== key ? 0.15 : 1),
  };
}

export type LocalFocus = ReturnType<typeof useLocalFocus>;

const GLYPH: Record<ModelMeta["vendor"], string> = { Google: "G", Anthropic: "A", Other: "·" };

export function ModelBadge({ meta, size = 24 }: { meta: ModelMeta; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md text-[12px] font-semibold"
      style={{
        width: size,
        height: size,
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 40%, transparent)`,
      }}
    >
      {GLYPH[meta.vendor]}
    </span>
  );
}

export interface RailItem {
  meta: ModelMeta;
  value: string;
  sub?: string;
}

/** The model list on a chart's right edge: hover to focus, click to pin. */
export function ModelRail({ items, focus }: { items: RailItem[]; focus: LocalFocus }) {
  return (
    <div className="flex w-full flex-col justify-center gap-0.5 border-border sm:w-[272px] sm:shrink-0 sm:border-l sm:pl-3" role="group" aria-label="Models">
      {items.map(({ meta, value, sub }) => {
        const pinned = focus.pinned === meta.key;
        return (
          <button
            key={meta.key}
            type="button"
            aria-pressed={pinned}
            onMouseEnter={() => focus.setHovered(meta.key)}
            onMouseLeave={() => focus.setHovered(null)}
            onFocus={() => focus.setHovered(meta.key)}
            onBlur={() => focus.setHovered(null)}
            onClick={() => focus.togglePin(meta.key)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-[opacity,background-color] duration-150",
              pinned ? "bg-[var(--console-surface)] shadow-[inset_0_0_0_1px_var(--console-rule)]" : "hover:bg-[var(--console-surface)]",
            )}
            style={{ opacity: focus.active && focus.active !== meta.key ? 0.4 : 1 }}
          >
            <ModelBadge meta={meta} />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[12.5px] font-medium">{meta.label}</span>
              <span className="text-muted-foreground truncate text-[11px]">{sub ?? meta.role}</span>
            </span>
            <span className="tabular text-[13px] font-medium">{value}</span>
          </button>
        );
      })}
    </div>
  );
}
