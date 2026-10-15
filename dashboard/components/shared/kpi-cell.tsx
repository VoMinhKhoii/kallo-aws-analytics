import type * as React from "react";
export function Cell({ label, value, delta: d, sub, spark }: { label: string; value: string; delta?: React.ReactNode; sub?: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="flex min-h-[84px] min-w-0 flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground truncate text-[12px]">{label}</span>
        {d}
      </div>
      <span className="tabular text-[24px] leading-none font-medium tracking-tight">{value}</span>
      {sub ? <span className="text-muted-foreground truncate text-[11.5px]">{sub}</span> : null}
      {spark ? <div className="mt-auto">{spark}</div> : null}
    </div>
  );
}

