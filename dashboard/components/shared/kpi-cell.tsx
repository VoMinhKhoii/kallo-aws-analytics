import type * as React from "react";
export function Cell({ label, value, delta: d, sub, spark, title }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode; spark?: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-h-[84px] min-w-0 flex-col gap-1.5 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground min-w-0 break-words text-[12px] leading-4">{label}</span>
        {d}
      </div>
      <span title={title} className="tabular text-[24px] leading-none font-medium tracking-tight">{value}</span>
      {sub ? <span className="text-muted-foreground truncate text-[11.5px]">{sub}</span> : null}
      {spark ? <div className="mt-auto">{spark}</div> : null}
    </div>
  );
}

