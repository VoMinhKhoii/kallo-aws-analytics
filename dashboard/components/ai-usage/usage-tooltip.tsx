"use client";

import { longDate } from "@/lib/ai-usage/format";
import type { ModelMeta } from "@/lib/ai-usage/models";

interface Entry {
  dataKey?: string | number;
  value?: number | null;
  payload?: Record<string, unknown>;
}

/** One tooltip for every per-model time chart: models sorted by value, share, total. */
export function UsageTooltip({
  active,
  payload,
  label,
  models,
  format,
  showTotal = false,
  note,
}: {
  active?: boolean;
  payload?: readonly Entry[];
  label?: string;
  models: ReadonlyMap<string, ModelMeta>;
  format: (v: number) => string;
  showTotal?: boolean;
  note?: (row: Record<string, unknown>) => string | null;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => p.value != null && models.has(String(p.dataKey)))
    .map((p) => ({ meta: models.get(String(p.dataKey)) as ModelMeta, value: Number(p.value) }))
    .sort((a, b) => b.value - a.value);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);
  const extra = note?.(payload[0]?.payload ?? {});
  return (
    <div className="min-w-60 rounded-lg border border-border bg-popover/95 px-3 py-2.5 text-xs shadow-2xl shadow-black/50 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="font-medium text-foreground">{label ? longDate(label) : ""}</span>
        {extra ? <span className="text-[10.5px] uppercase tracking-wider text-[var(--console-amber)]">{extra}</span> : null}
      </div>
      <div className="grid gap-1.5">
        {rows.map((r) => (
          <div key={r.meta.key} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
            <span className="size-2 rounded-[2px]" style={{ background: r.meta.color }} />
            <span className="text-muted-foreground">{r.meta.label}</span>
            <span className="tabular text-foreground">{format(r.value)}</span>
            {showTotal ? <span className="tabular w-9 text-right text-muted-foreground">{total ? Math.round((r.value / total) * 100) : 0}%</span> : null}
          </div>
        ))}
      </div>
      {showTotal ? (
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium">
          <span>Total</span>
          <span className="tabular">{format(total)}</span>
        </div>
      ) : null}
    </div>
  );
}
