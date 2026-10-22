import type * as React from "react";
export function Cell({ label, value, delta: d, sub, spark, title }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode; spark?: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-h-[84px] min-w-0 flex-col gap-2 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground min-w-0 break-words text-xs leading-4">{label}</span>
        {d}
      </div>
      <span title={title} className="tabular text-2xl leading-none font-medium tracking-tight">{value}</span>
      {sub ? <span className="text-muted-foreground whitespace-normal break-words text-xs">{sub}</span> : null}
      {spark ? <div className="mt-auto">{spark}</div> : null}
    </div>
  );
}


/** A change in the good direction gets a green mark, in the bad one red; no change has none. */
export function Change({ change, goodUp, title }: { change: { text: string; up: boolean } | null; goodUp: boolean; title?: string }) {
  if (!change) return null;
  const mark = /^[+−]0\.0/.test(change.text) ? "" : change.up === goodUp ? "mark-good" : "mark-bad";
  return <span title={title} className={`tabular shrink-0 text-xs leading-4 text-muted-foreground ${mark}`}>{change.text}</span>;
}
