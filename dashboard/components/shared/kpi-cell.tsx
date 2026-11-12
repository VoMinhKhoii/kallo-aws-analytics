import type * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react/ssr";

/** Label, the figure, its definition, then how it moved. */
export function Cell({ label, value, delta: d, sub, spark, title }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode; spark?: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-h-[112px] min-w-0 flex-col gap-2 px-4 py-4">
      <span className="min-w-0 break-words text-sm text-muted-foreground">{label}</span>
      <div className="grid gap-1">
        <span title={title} className="tabular text-[28px] leading-8 font-medium">{value}</span>
        {sub ? <span className="min-w-0 break-words text-xs text-muted-foreground">{sub}</span> : null}
      </div>
      {d ? <div className="mt-auto">{d}</div> : null}
      {spark ? <div className="mt-auto">{spark}</div> : null}
    </div>
  );
}

/** A change in the good direction is green, in the bad one red; no change is muted. `vs` names what it compares to. */
export function Change({ change, goodUp, title, vs }: { change: { text: string; up: boolean } | null; goodUp: boolean; title?: string; vs?: string }) {
  if (!change) return null;
  const flat = /^[+−]0\.0/.test(change.text);
  const tone = flat ? "text-muted-foreground" : change.up === goodUp ? "text-[var(--console-green)]" : "text-[var(--console-brick)]";
  const Arrow = change.up ? ArrowUpRight : ArrowDownRight;
  return (
    <span title={title} className="inline-flex min-w-0 items-center gap-1 text-xs leading-4">
      <span className={`tabular inline-flex shrink-0 items-center gap-0.5 font-medium ${tone}`}>
        {!flat && <Arrow weight="bold" className="size-3" aria-hidden="true" />}
        {change.text}
      </span>
      {vs ? <span className="truncate text-muted-foreground">{vs}</span> : null}
    </span>
  );
}
