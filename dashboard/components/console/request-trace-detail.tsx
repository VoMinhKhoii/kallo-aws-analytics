"use client";

import { MetricState, Panel, SourceTag } from "@/components/console/console";
import { useTraceDetail } from "@/lib/analytics-hooks";

const duration = (milliseconds: number) =>
  milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)} s` : `${milliseconds.toLocaleString("en-US")} ms`;

export function RequestTraceDetail({ requestId }: { requestId: string }) {
  const trace = useTraceDetail(requestId);
  const data = trace.data;

  return (
    <Panel
      className="mt-3"
      title="Selected pipeline request"
      description={`Exact operator trace for ${requestId}`}
      source={<SourceTag tone={trace.error ? "error" : "live"}>Supabase trace</SourceTag>}
    >
      <MetricState
        loading={trace.loading}
        error={trace.error}
        empty={!data}
        emptyMessage="No trace was returned for this request id."
      >
        {data ? (
          <div className="space-y-5 px-4 py-5 sm:px-5">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Status</dt><dd className="mt-1 text-sm font-medium">{data.status ?? "unknown"}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Total duration</dt><dd className="mt-1 text-sm font-medium tabular-nums">{duration(data.total)}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Ingredients</dt><dd className="mt-1 text-sm font-medium tabular-nums">{data.counts.ingredients.toLocaleString("en-US")}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--console-muted)]">Verdicts</dt><dd className="mt-1 text-sm font-medium tabular-nums">{data.counts.accepted} accepted · {data.counts.unmatched} unmatched · {data.counts.rejected} rejected</dd></div>
            </dl>

            {data.meal ? <p className="border-t border-[var(--console-rule)] pt-4 text-xs leading-5 text-[var(--console-muted)]"><b className="text-[var(--console-ink)]">Meal:</b> {data.meal}</p> : null}

            <div className="overflow-x-auto border-t border-[var(--console-rule)] pt-4">
              <h3 className="mb-2 text-xs font-semibold">Pipeline stages</h3>
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-[0.08em] text-[var(--console-muted)]"><tr><th className="py-2 pr-4">Stage</th><th className="py-2 pr-4">Start</th><th className="py-2 pr-4">Duration</th><th className="py-2">Result</th></tr></thead>
                <tbody>{data.spans.map((span) => <tr key={span.key} className="border-t border-[var(--console-rule)]"><td className="py-2 pr-4 font-medium">{span.name}</td><td className="py-2 pr-4 tabular-nums">{duration(span.start)}</td><td className="py-2 pr-4 tabular-nums">{duration(span.dur)}</td><td className="py-2">{span.ok ? "OK" : "Error"}</td></tr>)}</tbody>
              </table>
            </div>

            {data.rows.length > 0 ? (
              <div className="overflow-x-auto border-t border-[var(--console-rule)] pt-4">
                <h3 className="mb-2 text-xs font-semibold">Ingredient decisions</h3>
                <table className="w-full min-w-[38rem] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-[0.08em] text-[var(--console-muted)]"><tr><th className="py-2 pr-4">Ingredient</th><th className="py-2 pr-4">Match</th><th className="py-2 pr-4">Pool</th><th className="py-2 pr-4">Choice</th><th className="py-2">Verdict</th></tr></thead>
                  <tbody>{data.rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-[var(--console-rule)]"><td className="py-2 pr-4">{row[0]}</td><td className="py-2 pr-4">{row[1]}</td><td className="py-2 pr-4 tabular-nums">{row[2]}</td><td className="py-2 pr-4">{row[3]}</td><td className="py-2">{row[4]}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </MetricState>
    </Panel>
  );
}
