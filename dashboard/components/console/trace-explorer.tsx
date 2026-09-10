"use client";

import * as React from "react";
import Link from "next/link";
import {
  ConsolePage,
  formatDuration,
  formatNumber,
  MetricState,
  PageIntro,
  Panel,
  RangeControl,
  RefreshButton,
  SimpleTable,
  SourceTag,
  TableCell,
  TableRow,
  type ConsoleRange,
} from "@/components/console/console";
import { useRequests } from "@/lib/analytics-hooks";

export function TraceExplorer() {
  const [range, setRange] = React.useState<ConsoleRange>("7d");
  const requests = useRequests(range, 20);

  return (
    <ConsolePage>
      <PageIntro eyebrow="Diagnose" title="Meal analysis traces" description="Inspect one AI meal-analysis request from decomposition through retrieval, model calls, and final nutrition.">
        <div className="flex flex-wrap items-center gap-2">
          <RangeControl value={range} onChange={setRange} label="Trace window" />
          <RefreshButton refreshing={requests.refreshing} onClick={requests.refresh} />
        </div>
      </PageIntro>

      <div className="mt-3 grid gap-3">
        <Panel
          title="Recent AI meal requests"
          description="Choose a request to inspect its exact bounded pipeline trace."
          source={<SourceTag tone={requests.error ? "error" : requests.total ? "live" : "neutral"}>{requests.error ? "Supabase unavailable" : `${formatNumber(requests.total)} traces`}</SourceTag>}
        >
          <MetricState loading={requests.loading} error={requests.error} empty={requests.rows.length === 0} emptyMessage="No AI meal traces were recorded in this window.">
            <SimpleTable columns={["Request", "UTC", "Typed meal", { label: "Duration", align: "right" }, { label: "Ingredients", align: "right" }, "Verdicts"]} caption="Recent AI meal-analysis requests">
              {requests.rows.map((row) => {
                return (
                  <TableRow key={row[9]}>
                    <TableCell>
                      <Link href={`/trace/${encodeURIComponent(row[9])}`} className="font-mono text-[11px] text-[var(--console-blue)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--console-blue)]">
                        {row[0]}
                      </Link>
                    </TableCell>
                    <TableCell muted><span className="whitespace-nowrap font-mono text-[11px]">{row[1]} {row[2]}</span></TableCell>
                    <TableCell className="max-w-96"><Link href={`/trace/${encodeURIComponent(row[9])}`} className="line-clamp-2 font-medium leading-5 text-[var(--console-ink)] hover:text-[var(--console-blue)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--console-blue)]">{row[3]}</Link></TableCell>
                    <TableCell numeric>{formatDuration(row[4])}</TableCell>
                    <TableCell numeric>{formatNumber(row[5])}</TableCell>
                    <TableCell muted><span className="whitespace-nowrap tabular-nums">{row[6]} accepted · {row[7]} unmatched · {row[8]} rejected</span></TableCell>
                  </TableRow>
                );
              })}
            </SimpleTable>
            {requests.hasMore ? (
              <div className="border-t border-[var(--console-rule)] px-4 py-3 sm:px-5">
                <button type="button" onClick={requests.loadMore} disabled={requests.loading} className="min-h-8 rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-3 text-xs font-medium hover:bg-[var(--console-panel)] focus-visible:outline-2 focus-visible:outline-[var(--console-blue)] disabled:opacity-50">Load more traces</button>
              </div>
            ) : null}
          </MetricState>
        </Panel>
      </div>
    </ConsolePage>
  );
}
