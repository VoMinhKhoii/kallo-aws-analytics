import type * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react/ssr";

/** Label, the figure, how it moved, then what it counts. */
export function Cell({ label, value, delta: d, sub, spark, title }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode; spark?: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="min-w-0 break-words text-sm text-muted-foreground">{label}</span>
      <span title={title} className="tabular text-[30px] leading-9 font-medium tracking-[-0.75px]">{value}</span>
      {d ? <div>{d}</div> : null}
      {sub ? <span className="min-w-0 break-words text-xs text-[var(--console-faint)]">{sub}</span> : null}
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
      <span className={`tabular inline-flex shrink-0 items-center gap-0.5 ${tone}`}>
        {!flat && <Arrow weight="bold" className="size-3" aria-hidden="true" />}
        {change.text}
      </span>
      {vs ? <span className="truncate text-[var(--console-faint)]">{vs}</span> : null}
    </span>
  );
}
