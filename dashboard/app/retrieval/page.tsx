"use client";
import * as React from "react";
import { Bar, BarChart, Cell, LabelList, ReferenceArea, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatRow, Note, type Stat } from "@/components/panels/common";
import { CHART } from "@/lib/metrics";
import { Loading, Failed } from "@/components/panels/states";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useRange } from "@/components/range-context";
import { useSummary, useOverturnGroups, useOverturnPool, useReverseRows } from "@/lib/analytics-hooks";

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : "0.0");
const num = (n: number) => n.toLocaleString("en-US");
import { cn } from "@/lib/utils";

const SIM_LABELS = [".70", ".75", ".80", ".85", ".90", ".95", "1.000", ">1.000"];

/** Derived from whatever pool came back — never prose written about another database. */
function poolFinding(pool: string[][], rank: number) {
  if (!pool.length || !rank) return "No pool recorded for this group.";
  const top = pool[0], win = pool[rank - 1];
  if (!win) return "The selected candidate is not present in the recorded pool.";
  const kcal = (r: string[]) => Number(r[4]);
  const fat = (r: string[]) => Number(r[5]);
  const ratio = (a: number, b: number) => (b > 0 && a > 0 ? (Math.max(a, b) / Math.min(a, b)).toFixed(1) : null);
  const kr = ratio(kcal(top), kcal(win)), fr = ratio(fat(top), fat(win));
  const saturated = pool.filter((r) => Number(r[3]) >= 1).length;
  return (
    <>
      Retriever ranked <b>{top[0]}</b> first at <code>{top[3]}</code>; the model took <b>{win[0]}</b> at <code>{win[3]}</code>.
      {kr && kr !== "1.0" && <> Energy differs by <b>{kr}×</b>{fr && fr !== "1.0" && <> and fat by <b>{fr}×</b></>}.</>}
      {saturated > 1 && <> {saturated} of {pool.length} candidates score 1.000 or above, so the score cannot separate them — the choice is the model&apos;s alone.</>}
    </>
  );
}

function reverseFinding(rv: [string, string, string, number, number, [string, number][], [string, number][]]) {
  const [, , , rj, wn] = rv;
  if (rj > 0 && wn > 0)
    return <>This row sits on <b>both sides</b>: discarded at rank 1 <b>{rj}×</b> and reached from rank 2/3 <b>{wn}×</b> in this range. Whether it survives depends on the request, not on the row.</>;
  if (rj > 0)
    return <>Ranked #1 <b>{rj}×</b> here and rejected every time — a ranking defect with a deterministic fix.</>;
  return <>Never ranked #1 here, selected <b>{wn}×</b> by overturn. If the ranker emitted this row first, those overturns disappear with no change to any output.</>;
}

export default function RetrievalPage() {
  const { range } = useRange();
  const [ovrIdx, setOvrIdx] = React.useState(0);
  const [revIdx, setRevIdx] = React.useState(0);
  React.useEffect(() => { setOvrIdx(0); setRevIdx(0); }, [range]);

  const s = useSummary(range);
  const groups = useOverturnGroups(range);
  const rev = useReverseRows(range);

  const oi = Math.min(ovrIdx, Math.max(groups.rows.length - 1, 0));
  const group = groups.rows[oi];
  const poolQ = useOverturnPool(range, group?.q, group?.rank);

  const revRows = rev.rows;
  const vi = Math.min(revIdx, Math.max(revRows.length - 1, 0));
  const rv = revRows[vi];
  const revMax = Math.max(...revRows.map((r) => Math.max(r[3], r[4])), 1);
  const bothSided = (rev.meta?.bothSided as number) ?? revRows.filter((r) => r[3] > 0 && r[4] > 0).length;

  if (s.error) return <><PageHeader title="Retrieval & matching" sub="Stage 2" /><Failed error={s.error} code={s.code} /></>;
  if (!s.data) return <><PageHeader title="Retrieval & matching" sub="Stage 2" /><Loading /></>;
  const d = s.data.ai;

  const simData = d.sim.bins.map((n, i) => ({ bin: SIM_LABELS[i], n }));
  const satur = d.sim.bins[6] + d.sim.bins[7];
  const simConfig: ChartConfig = { n: { label: "matches" } };

  const stats: Stat[] = [
    { label: "Resolved matches", value: num(d.sim.n), denom: "rows the pipeline shipped" },
    { label: "Similarity ≥ 1.000", value: pct(satur, d.sim.n), unit: "%", denom: `${satur} / ${d.sim.n} matches` },
    { label: "Above maximum", value: num(d.sim.bins[7]), denom: "score > 1.000 — impossible" },
    { label: "Top-1 overturned", value: pct(d.ovr, d.choice), unit: "%", denom: `${d.ovr} / ${d.choice} with a choice` },
    { label: "Distinct pairs", value: num(d.ovrPairs), denom: "query → row overturn pairs" },
    { label: "Rows on both sides", value: String(bothSided), denom: `of ${rev.total} rows in the overturn set` },
  ];

  return (
    <>
      <PageHeader
        title="Retrieval & matching"
        sub={<>Stage 2 — how candidates are scored, ranked, and then overruled. {d.from} → {d.to}, {num(d.sim.n)} resolved matches.</>}
      />
      <StatRow stats={stats} />

      <Card className="mt-3">
        <CardHeader>
          <div>
            <CardTitle>Match similarity — distribution of the row the pipeline shipped</CardTitle>
            <CardDescription className="mt-1">n={num(d.sim.n)} in range</CardDescription>
          </div>
          <CardAction><Badge variant="bad">scale is not calibrated</Badge></CardAction>
        </CardHeader>
        <CardContent>
          <ChartContainer config={simConfig} className="aspect-auto h-60 w-full">
            <BarChart data={simData} margin={{ left: 4, right: 8, top: 18 }}>
              <ReferenceArea
                x1=".90" x2=".95" fill="var(--muted)" fillOpacity={0.6}
                label={{ value: "no mass between .85 and 1.000", position: "insideTop", fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <XAxis dataKey="bin" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={38} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v} matches`} />} />
              <Bar dataKey="n" radius={3} barSize={64} isAnimationActive={false}>
                <LabelList dataKey="n" position="top" className="tabular fill-muted-foreground" fontSize={11} />
                {simData.map((row, i) => (
                  <Cell key={row.bin} fill={i === 7 ? CHART[3] : i === 6 ? CHART[2] : i === 5 ? "var(--muted)" : CHART[1]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          <div className="mt-3">
            <Note>
              {d.sim.bins[7] > 0 ? (
                <><b className="text-[var(--chart-2)]">{satur} of {d.sim.n} matches ({pct(satur, d.sim.n)}%) score 1.000 or higher, and {d.sim.bins[7]} of
                them exceed 1.000</b> — a similarity above its own maximum. <code>word_similarity</code> returns 1.0 for any contiguous word
                extent and an exact-match bonus pushes it to <code>1.001</code>. Confidence derived from this scale (<code>high ≥ .85</code>) is
                uncalibrated and is shown nowhere in this app.</>
              ) : (
                <><b className="text-[var(--chart-2)]">{d.sim.bins[6]} of {d.sim.n} matches ({pct(d.sim.bins[6], d.sim.n)}%) score exactly 1.000</b>, and in
                this range nothing scores above 1.000 — nothing here scores above 1.000. Widen the range to see whether
                the over-maximum band returns.</>
              )}
            </Note>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader>
          <div>
            <CardTitle>Top-1 overturned — what the retriever ranked first, and what the model took instead</CardTitle>
            <CardDescription className="mt-1">
              {d.ovr} overturns in range · {groups.total} distinct query→rank groups · showing {groups.rows.length}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid xl:grid-cols-[300px_1fr]">
            <div className="border-b xl:border-r xl:border-b-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">rank</TableHead>
                    <TableHead className="text-right">n</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.rows.map((g, i) => {
                    const { q, rank, n } = g;
                    const t1 = g.top1 ?? "—";
                    return (
                      <TableRow
                        key={q + i} onClick={() => setOvrIdx(i)}
                        data-state={i === oi ? "selected" : undefined}
                        className={cn("cursor-pointer", i === oi && "shadow-[inset_2px_0_0_var(--primary)]")}
                      >
                        <TableCell className="max-w-[210px]">
                          <span className="block truncate">{q}</span>
                          <span className="text-muted-foreground block truncate text-[11px]">rejected: {t1}</span>
                        </TableCell>
                        <TableCell className="tabular text-right text-[var(--chart-2)]">#{rank}</TableCell>
                        <TableCell className="tabular text-muted-foreground text-right">{n}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {groups.hasMore && (
                <div className="border-t px-3 py-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={groups.loadMore} disabled={groups.loading}>
                    {groups.loading ? "Loading…" : `Load more (${groups.rows.length} of ${groups.total})`}
                  </Button>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3">
                <span className="tabular text-sm font-medium">{group?.q ?? "—"}</span>
                <span className="text-muted-foreground text-xs">candidate pool as emitted by stage 2 · RRF-fused · k=3</span>
                <span className="text-muted-foreground ml-auto text-xs">{group?.n ?? 0} in the selected range</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Composition row</TableHead>
                    <TableHead>source · arm</TableHead>
                    <TableHead className="text-right">sim</TableHead>
                    <TableHead className="text-right">kcal</TableHead>
                    <TableHead className="text-right">fat</TableHead>
                    <TableHead className="text-right">pro</TableHead>
                    <TableHead className="text-right">carb</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(poolQ.data?.pool ?? []).map((c, i) => {
                    const win = i + 1 === (group?.rank ?? 0), top = i === 0;
                    return (
                      <TableRow
                        key={i}
                        className={cn(
                          win && "bg-[color-mix(in_oklab,var(--chart-1)_7%,white)] shadow-[inset_2px_0_0_var(--chart-1)]",
                          top && !win && "bg-[color-mix(in_oklab,var(--chart-3)_6%,white)] shadow-[inset_2px_0_0_var(--chart-3)]"
                        )}
                      >
                        <TableCell className={cn("tabular font-medium", win ? "text-[var(--chart-1)]" : top ? "text-[var(--chart-3)]" : "text-muted-foreground")}>c{i + 1}</TableCell>
                        <TableCell className={cn("max-w-[280px] truncate", !win && "text-muted-foreground")}>{c[0]}</TableCell>
                        <TableCell className={cn("tabular text-[11px]", c[2] === "fuzzy" ? "text-[var(--chart-2)]" : "text-muted-foreground")}>{c[1]} · {c[2]}</TableCell>
                        <TableCell className={cn("tabular text-right", parseFloat(c[3]) >= 1 ? "text-[var(--chart-2)]" : "text-muted-foreground")}>{c[3]}</TableCell>
                        <TableCell className="tabular text-right">{c[4]}</TableCell>
                        <TableCell className="tabular text-right">{c[5]}</TableCell>
                        <TableCell className="tabular text-right">{c[6]}</TableCell>
                        <TableCell className="tabular text-right">{c[7]}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="space-y-2 px-4 py-3">
                <Note>{poolFinding(poolQ.data?.pool ?? [], group?.rank ?? 0)}</Note>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Per-100 g values are the composition row&apos;s own, before portioning. The pool shown is one real request from this
                  group; pool membership can differ between requests for the same query.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader>
          <div>
            <CardTitle>Reverse view — by composition row: which rows the model discards, and which it reaches for</CardTitle>
            <CardDescription className="mt-1">
              same {d.ovr} overturns, aggregated on the DB side · top {revRows.length} rows by traffic
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid xl:grid-cols-[1fr_340px]">
            <div className="min-w-0 border-b xl:border-r xl:border-b-0">
              <div className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_180px_80px] items-center gap-3 border-b px-4 py-2 text-[10px] font-semibold tracking-wide uppercase">
                <span>Composition row</span>
                <span className="grid grid-cols-2">
                  <span className="pr-2 text-right text-[var(--chart-3)]">◀ discarded</span>
                  <span className="pl-2 text-[var(--chart-1)]">reached ▶</span>
                </span>
                <span className="text-right">rej · win</span>
              </div>
              {revRows.map((r, i) => {
                const both = r[3] > 0 && r[4] > 0;
                return (
                  <button
                    key={r[0]} onClick={() => setRevIdx(i)}
                    className={cn(
                      "hover:bg-muted/40 grid w-full grid-cols-[minmax(0,1fr)_180px_80px] items-center gap-3 border-b px-4 py-1.5 text-left last:border-0",
                      i === vi && "bg-muted/60 shadow-[inset_2px_0_0_var(--primary)]"
                    )}
                  >
                    <span className={cn("truncate text-[13px]", both ? "font-medium" : "text-muted-foreground")}>
                      {both && "◆ "}{r[1]}
                    </span>
                    <span className="grid grid-cols-2 items-center">
                      <span className="flex justify-end border-r pr-px">
                        <span className="block h-3 rounded-l-sm" style={{ width: `${(r[3] / revMax) * 100}%`, background: CHART[3] }} />
                      </span>
                      <span className="flex justify-start pl-px">
                        <span className="block h-3 rounded-r-sm" style={{ width: `${(r[4] / revMax) * 100}%`, background: CHART[1] }} />
                      </span>
                    </span>
                    <span className="tabular text-right text-xs">
                      <span style={{ color: r[3] ? CHART[3] : "var(--muted-foreground)" }}>{r[3]}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span style={{ color: r[4] ? CHART[1] : "var(--muted-foreground)" }}>{r[4]}</span>
                    </span>
                  </button>
                );
              })}
              {rev.hasMore && (
                <div className="px-4 py-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={rev.loadMore} disabled={rev.loading}>
                    {rev.loading ? "Loading…" : `Load more (${revRows.length} of ${rev.total})`}
                  </Button>
                </div>
              )}
            </div>

            <div>
              <div className="border-b px-4 py-3">
                <p className="text-muted-foreground text-[11px]">AI outputs that mapped onto</p>
                <p className="mt-1 text-[13px] leading-snug font-medium">{rv?.[1] ?? "—"}</p>
                <p className="text-muted-foreground tabular mt-1 text-[10px]">{rv?.[0]} · {rv?.[2]} · discarded {rv?.[3] ?? 0} · selected {rv?.[4] ?? 0}</p>
              </div>
              <div className="grid grid-cols-2">
                {[
                  { title: "Ranked #1 here, discarded", rows: rv?.[5] ?? [], color: "text-[var(--chart-3)]" },
                  { title: "Reached from rank 2/3", rows: rv?.[6] ?? [], color: "text-[var(--chart-1)]" },
                ].map((col, ci) => (
                  <div key={col.title} className={cn(ci === 0 && "border-r")}>
                    <p className={cn("px-3 pt-2.5 pb-1 text-[10px] font-semibold tracking-wide uppercase", col.color)}>{col.title}</p>
                    {col.rows.map(([q, n]) => (
                      <div key={q} className="flex items-center gap-2 border-t px-3 py-1.5 text-[12px]">
                        <span className="min-w-0 truncate">{q}</span>
                        <span className="tabular text-muted-foreground ml-auto text-[11px]">{n}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="px-4 py-3">
                <Note>
                  {rv && reverseFinding(rv)}
                </Note>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          A bar to the LEFT means the retriever put that row at rank 1 and the model threw it away; a bar to the RIGHT means the model
          reached past rank 1 to take it. <b>{bothSided} of the {rev.total} rows in this set carry bars on both sides</b> — the same composition
          row is discarded in some requests and rescued in others, in several cases for an identical query.
        </CardFooter>
      </Card>
    </>
  );
}
