"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatRow, Note, BarRow, type Stat } from "@/components/panels/common";
import { CHART, BUCKET_META } from "@/lib/metrics";
import { Loading, Failed } from "@/components/panels/states";
import { Button } from "@/components/ui/button";
import { useRange } from "@/components/range-context";
import { useSummary, usePoolNames, useUnresolved, useCorpusRows, useCorpusQueries } from "@/lib/analytics-hooks";

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : "0.0");
const num = (n: number) => n.toLocaleString("en-US");
import { cn } from "@/lib/utils";

export default function CoveragePage() {
  const { range } = useRange();
  const [bucket, setBucket] = React.useState(0);
  const [row, setRow] = React.useState(0);
  React.useEffect(() => { setRow(0); }, [range]);

  const s = useSummary(range);
  const names = usePoolNames(range, bucket);
  const unres = useUnresolved(range);
  const corpus = useCorpusRows(range);
  const ri = Math.min(row, Math.max(corpus.rows.length - 1, 0));
  const sel = corpus.rows[ri];
  const queries = useCorpusQueries(range, sel?.[0]);

  const bm = BUCKET_META[bucket];
  const bucketColors = [CHART[3], CHART[2], CHART[1], CHART[1]];

  if (s.error) return <><PageHeader title="Coverage & corpus" sub="Composition table" /><Failed error={s.error} code={s.code} /></>;
  if (!s.data) return <><PageHeader title="Coverage & corpus" sub="Composition table" /><Loading /></>;
  const d = s.data.ai;
  const CORPUS_SIZE = d.corpusSize;

  const stats: Stat[] = [
    { label: "Rows ever selected", value: num(d.rowsUsed), denom: `of ${num(CORPUS_SIZE)} in the corpus` },
    { label: "Corpus in use", value: pct(d.rowsUsed, CORPUS_SIZE), unit: "%", denom: `carries ${num(d.matches)} matches` },
    { label: "Zero-candidate", value: num(d.pool[0]), denom: `${pct(d.pool[0], d.verdicts)}% of ${num(d.verdicts)} ingredients` },
    { label: "Unresolved", value: num(d.unmN), denom: `${d.unmDistinct} distinct names` },
    { label: "Full pool of 3", value: pct(d.pool[3], d.verdicts), unit: "%", denom: `${num(d.pool[3])} ingredients` },
    { label: "Single candidate", value: num(d.pool[1]), denom: "no choice — excluded from overturn" },
  ];

  return (
    <>
      <PageHeader
        title="Coverage & corpus"
        sub={<>What the composition table does and does not contain. {num(d.rowsUsed)} of {num(CORPUS_SIZE)} rows carry every match in this range.</>}
      />
      <StatRow stats={stats} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Candidate pool size — and which ingredients landed in each bucket</CardTitle>
              <CardDescription className="mt-1">n={num(d.verdicts)} in range</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BUCKET_META.map((b, i) => (
                <button
                  key={b.label} onClick={() => setBucket(i)}
                  className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors", i === bucket ? "border-primary ring-primary/20 ring-2" : "hover:bg-muted/40")}
                >
                  <p className="text-muted-foreground text-[10px]">{b.label}</p>
                  <p className="tabular mt-1 text-lg font-semibold" style={{ color: bucketColors[i] }}>
                    {num(d.pool[i])}
                    <span className="text-muted-foreground ml-1 text-[10px] font-normal">· {pct(d.pool[i], d.verdicts)}%</span>
                  </p>
                  <span className="bg-muted mt-1.5 block h-1 overflow-hidden rounded-full">
                    <span className="block h-full rounded-full" style={{ width: `${(d.pool[i] / Math.max(...d.pool)) * 100}%`, background: bucketColors[i] }} />
                  </span>
                </button>
              ))}
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                {num(d.pool[bucket])} ingredients {bm.t} — {names.total} distinct names in range
              </p>
              <ScrollArea className="h-36">
                <div className="flex flex-wrap gap-1 pr-3">
                  {names.rows.map((n) => (
                    <span key={n} className="bg-muted/60 rounded border px-1.5 py-0.5 text-[11px]">{n}</span>
                  ))}
                  {names.hasMore && (
                    <button onClick={names.loadMore}
                            className="text-muted-foreground hover:text-foreground rounded border border-dashed px-1.5 py-0.5 text-[11px]">
                      + {names.total - names.rows.length} more
                    </button>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
          <CardFooter>{bm.note}</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Unresolved ingredient names</CardTitle>
              <CardDescription className="mt-1">{d.unmN} unmatched · {d.unmDistinct} distinct · showing {unres.rows.length}</CardDescription>
            </div>
            <CardAction><Badge variant="bad">coverage</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {unres.rows.map(([name, n]) => (
              <BarRow key={name} label={name} n={String(n)} w={`${(n / (unres.rows[0]?.[1] || 1)) * 100}%`} color={CHART[3]} labelWidth="w-36" />
            ))}
            {unres.hasMore && (
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={unres.loadMore} disabled={unres.loading}>
                {unres.loading ? "Loading…" : `Load more (${unres.rows.length} of ${unres.total})`}
              </Button>
            )}
          </CardContent>
          <CardFooter>
            Two distinct failures share this list. <code>Tôm</code> and <code>Rau</code> have rows in the table — they fail because stage 1
            emitted a bare category term, a decomposition-specificity defect. <code>Bánh cuốn</code>, <code>Bánh canh</code> and{" "}
            <code>Cơm tấm</code> have no row at all — a corpus-coverage gap. Telling them apart automatically needs a labelled set,
            which does not exist yet.
          </CardFooter>
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader>
          <div>
            <CardTitle>Composition-table usage — which rows absorb the traffic, and what resolves into them</CardTitle>
            <CardDescription className="mt-1">
              {num(d.rowsUsed)} of {num(CORPUS_SIZE)} rows selected in range · {pct(d.rowsUsed, CORPUS_SIZE)}% of the corpus carries {num(d.matches)} matches
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid xl:grid-cols-[1fr_360px]">
            <div className="min-w-0 border-b xl:border-r xl:border-b-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Composition row</TableHead>
                    <TableHead>id</TableHead>
                    <TableHead className="w-24">hits</TableHead>
                    <TableHead className="text-right">n</TableHead>
                    <TableHead className="text-right">queries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {corpus.rows.map(([id, nm, , n, dq], i) => (
                    <TableRow
                      key={id + i} onClick={() => setRow(i)}
                      className={cn("cursor-pointer", i === ri && "bg-muted/60 shadow-[inset_2px_0_0_var(--primary)]")}
                    >
                      <TableCell className="max-w-[320px] truncate">{nm}</TableCell>
                      <TableCell className="text-muted-foreground tabular max-w-[130px] truncate text-[11px]">{id}</TableCell>
                      <TableCell>
                        <span className="bg-muted block h-1.5 w-20 overflow-hidden rounded-full">
                          <span className="block h-full rounded-full" style={{ width: `${(n / (corpus.rows[0]?.[3] || 1)) * 100}%`, background: dq >= 5 ? CHART[2] : CHART[1] }} />
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right">{n}</TableCell>
                      <TableCell className={cn("tabular text-right", dq >= 5 && "text-[var(--chart-2)]")}>{dq}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {corpus.hasMore && (
                <div className="border-t px-3 py-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={corpus.loadMore} disabled={corpus.loading}>
                    {corpus.loading ? "Loading…" : `Load more (${corpus.rows.length} of ${corpus.total})`}
                  </Button>
                </div>
              )}
              <p className="text-muted-foreground px-4 py-3 text-[11px] leading-relaxed">
                {num(corpus.total)} rows carry all {num(d.matches)} matches in this range, and{" "}
                {num((corpus.meta?.singletons as number) ?? 0)} of them were selected exactly once. The head is short and the tail is
                thin — retrieval quality is decided by a few hundred rows, so an error in any one of them is systematic rather than
                isolated.
              </p>
            </div>

            <div>
              <div className="border-b px-4 py-3">
                <p className="text-muted-foreground text-[11px]">Queries that resolved into</p>
                <p className="mt-1 text-[13px] leading-snug font-medium">{sel?.[1] ?? "—"}</p>
                <p className="text-muted-foreground tabular mt-1 text-[10px]">
                  {sel?.[0]} · {sel?.[2]} · {sel?.[3] ?? 0} hits · {sel?.[4] ?? 0} distinct queries in range
                </p>
              </div>
              {queries.rows.map(([q, n]) => (
                <div key={q} className="flex items-center gap-2 border-b px-4 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate">{q}</span>
                  <span className="tabular text-muted-foreground ml-auto text-xs">{n}</span>
                </div>
              ))}
              {queries.hasMore && (
                <div className="px-4 py-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={queries.loadMore} disabled={queries.loading}>
                    {queries.loading ? "Loading…" : `Load more (${queries.rows.length} of ${queries.total})`}
                  </Button>
                </div>
              )}
              <div className="px-4 py-3">
                <Note>
                  {(sel?.[4] ?? 0) > 1
                    ? <><b>{sel?.[4]} distinct queries</b> collapse into this one row. Anything the queries do not share — cooking state, cut, brand — is erased by the substitution.</>
                    : <>One query resolves here. A single-query row is the clean case: no distinct ingredient is being folded into it.</>}
                </Note>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
