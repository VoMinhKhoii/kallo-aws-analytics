"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader, Note } from "@/components/panels/common";
import { CHART } from "@/lib/metrics";
import { Loading, Failed } from "@/components/panels/states";
import { useRange } from "@/components/range-context";
import { useRequests, useTraceDetail } from "@/lib/analytics-hooks";
import { cn } from "@/lib/utils";

const num = (n: number) => n.toLocaleString("en-US");
const TABS = [{ key: "structured", label: "Structured" }, { key: "raw", label: "Raw JSON" }];

async function copyJson(t: unknown, done: (v: boolean) => void) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(t, null, 2));
    done(true);
    setTimeout(() => done(false), 1600);
  } catch {
    done(false);
  }
}

export default function TracePage() {
  const { range } = useRange();
  const [openId, setOpenId] = React.useState<string | undefined>();
  const [span, setSpan] = React.useState<string | undefined>();
  const [tab, setTab] = React.useState("structured");
  const [copied, setCopied] = React.useState(false);

  const reqs = useRequests(range);
  React.useEffect(() => { setOpenId(undefined); setSpan(undefined); }, [range]);

  const activeId = openId ?? reqs.rows[0]?.[9];
  const detail = useTraceDetail(activeId);
  const t = detail.data;
  const selSpan = t?.spans.find((s) => s.key === span) ?? t?.spans[1] ?? t?.spans[0];

  if (reqs.error) return <><PageHeader title="Trace viewer" sub="One meal, span by span" /><Failed error={reqs.error} code={reqs.code} /></>;

  return (
    <>
      <PageHeader title="Trace viewer" sub={<>One meal, span by span. {reqs.total} traces in the selected window.</>} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Requests in range — the entry point to this page</CardTitle>
            <CardDescription className="mt-1">showing {reqs.rows.length} of {reqs.total} · newest first</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {reqs.loading && reqs.rows.length === 0 && <Loading label="Loading requests" />}
          {!reqs.loading && reqs.rows.length === 0 && (
            <p className="text-muted-foreground px-5 py-6 text-xs">No traced requests in this range.</p>
          )}
          {reqs.rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>request</TableHead><TableHead>logged</TableHead>
                  <TableHead>meal items (stage 1)</TableHead>
                  <TableHead className="text-right">duration</TableHead>
                  <TableHead className="text-right">ing</TableHead>
                  <TableHead className="w-32">outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqs.rows.map((r) => {
                  const [id, iso, hhmm, items, ms, n, acc, unm, rej, full] = r;
                  const open = full === activeId;
                  const seg: [number, string][] = [[acc, CHART[1]], [unm, CHART[2]], [rej, CHART[3]]];
                  return (
                    <TableRow key={full} onClick={() => { setOpenId(full); setSpan(undefined); }}
                              className={cn("cursor-pointer", open && "bg-muted/60 shadow-[inset_2px_0_0_var(--primary)]")}>
                      <TableCell className={cn("tabular text-[11px]", open ? "font-medium" : "text-muted-foreground")}>
                        {id}{open && <span className="ml-1.5 text-[10px] text-[var(--chart-1)]">open</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular text-[11px]">{iso.slice(5)} {hhmm}</TableCell>
                      <TableCell className={cn("max-w-[260px] truncate", !open && "text-muted-foreground")}>{items}</TableCell>
                      <TableCell className={cn("tabular text-right", (ms ?? 0) > 13000 && "text-[var(--chart-2)]")}>
                        {ms == null ? "—" : num(ms)}
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground text-right">{n}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-0.5">
                          {seg.filter(([v]) => v > 0).map(([v, c], i) => (
                            <span key={i} className="block h-2 rounded-sm" style={{ width: `${(v / n) * 72}px`, background: c }} />
                          ))}
                          <span className="tabular text-muted-foreground ml-1.5 text-[10px]">{acc}/{n}</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {reqs.hasMore && (
            <div className="border-t px-3 py-2">
              <Button variant="outline" size="sm" className="w-full" onClick={reqs.loadMore} disabled={reqs.loading}>
                {reqs.loading ? "Loading…" : `Load more (${reqs.rows.length} of ${reqs.total})`}
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter>
          Click any row to open its trace. No row here can be reached from a user complaint: <code>meals</code> and{" "}
          <code>user_feedback</code> carry no <code>pipeline_request_id</code>.
        </CardFooter>
      </Card>

      <Card className="mt-3">
        {detail.error && <Failed error={detail.error} code={detail.code} />}
        {!detail.error && !t && <Loading label="Loading trace" />}
        {t && (
          <>
            <CardHeader className="flex-col items-stretch gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">Traces /</span>
                <span className="tabular text-muted-foreground text-[11px]">{t.requestId}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button variant="outline" size="sm" disabled
                          title="Replaying a trace needs the pipeline itself, which this dashboard does not run">
                    Replay
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => copyJson(t, setCopied)}>
                    {copied ? "Copied" : "Copy JSON"}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-xl font-semibold tracking-tight">{t.meal ?? "(no decomposition recorded)"}</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={t.status === "success" ? "good" : "bad"}>{t.status ?? "unknown"}</Badge>
                <Badge variant="outline">total <b className="tabular ml-1">{num(t.total)} ms</b></Badge>
                <Badge variant="outline">ingredients <b className="tabular ml-1">{t.counts.ingredients}</b></Badge>
                <Badge variant={t.counts.accepted === t.counts.ingredients ? "good" : "warn"}>
                  accepted {t.counts.accepted}/{t.counts.ingredients}
                </Badge>
                {t.counts.unmatched > 0 && <Badge variant="warn">unmatched {t.counts.unmatched}</Badge>}
                {t.counts.rejected > 0 && <Badge variant="bad">rejected {t.counts.rejected}</Badge>}
              </div>
            </CardHeader>

            <CardContent className="px-0 pb-0">
              <div className="grid xl:grid-cols-[320px_1fr]">
                <div className="border-b xl:border-r xl:border-b-0">
                  {t.spans.map((s) => {
                    const left = Math.min(100, t.total ? (s.start / t.total) * 100 : 0);
                    const width = Math.min(100 - left, Math.max(0.6, t.total ? (s.dur / t.total) * 100 : 0));
                    return (
                      <button key={s.key} onClick={() => setSpan(s.key)}
                              className={cn("hover:bg-muted/40 block w-full border-b px-4 py-2 text-left last:border-0",
                                            s.key === selSpan?.key && "bg-muted/60 shadow-[inset_2px_0_0_var(--primary)]")}>
                        <span className="flex items-center gap-2">
                          <span className="size-1.5 shrink-0 rounded-full" style={{ background: s.ok ? CHART[1] : CHART[3] }} />
                          <span className="truncate text-[13px]">{s.name}</span>
                          <span className="tabular text-muted-foreground ml-auto text-[11px]">{num(s.dur)} ms</span>
                        </span>
                        <span className="bg-muted mt-1.5 block h-1.5 overflow-hidden rounded-full">
                          <span className="block h-full rounded-full"
                                style={{ marginLeft: `${left}%`, width: `${width}%`, background: CHART[4] }} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 border-b px-4 py-2.5">
                    <span className="text-sm font-medium">{selSpan?.name}</span>
                    <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v)} className="ml-auto">
                      {TABS.map((x) => <ToggleGroupItem key={x.key} value={x.key}>{x.label}</ToggleGroupItem>)}
                    </ToggleGroup>
                  </div>

                  {tab === "structured" ? (
                    <div className="space-y-4 px-4 py-3">
                      {t.ovr && t.ovr.pool && (
                        <div>
                          <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
                            Candidate pool — {t.ovr.ing}
                          </p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>#</TableHead><TableHead>Composition row</TableHead><TableHead>arm</TableHead>
                                <TableHead className="text-right">sim</TableHead>
                                <TableHead className="text-right">fat</TableHead><TableHead className="text-right">kcal</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {t.ovr.pool.map((c, i) => {
                                const win = i + 1 === t.ovr!.rank;
                                return (
                                  <TableRow key={i} className={cn(win && "bg-[color-mix(in_oklab,var(--chart-1)_7%,white)] shadow-[inset_2px_0_0_var(--chart-1)]")}>
                                    <TableCell className={cn("tabular", win ? "font-medium text-[var(--chart-1)]" : "text-muted-foreground")}>c{i + 1}</TableCell>
                                    <TableCell className={cn("max-w-[280px] truncate", !win && "text-muted-foreground")}>{c[0]}</TableCell>
                                    <TableCell className={cn("text-[11px]", c[2] === "fuzzy" ? "text-[var(--chart-2)]" : "text-muted-foreground")}>{c[1]} · {c[2]}</TableCell>
                                    <TableCell className={cn("tabular text-right", Number(c[3]) >= 1 && "text-[var(--chart-2)]")}>{c[3]}</TableCell>
                                    <TableCell className="tabular text-right">{c[4] ?? "—"}</TableCell>
                                    <TableCell className="tabular text-right">{c[5] ?? "—"}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          <div className="mt-2.5">
                            <Note>
                              The retriever ranked <b>{t.ovr.pool[0][0]}</b> first; the model took <b>c{t.ovr.rank}</b> instead.
                              Where two candidates both score 1.000 the scale cannot separate them, so the pick is the model&apos;s alone.
                            </Note>
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">Ingredient outcomes</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ingredient</TableHead><TableHead>matched row</TableHead>
                              <TableHead className="text-right">pool</TableHead><TableHead className="text-right">pick</TableHead>
                              <TableHead>verdict</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {t.rows.map((r, i) => {
                              const bad = r[4] !== "accepted";
                              return (
                                <TableRow key={i}>
                                  <TableCell>{r[0]}</TableCell>
                                  <TableCell className={cn("max-w-[180px] truncate", r[2] === 0 && "text-[var(--chart-3)]")}>{r[1]}</TableCell>
                                  <TableCell className={cn("tabular text-right", r[2] === 0 && "text-[var(--chart-3)]")}>{r[2]}</TableCell>
                                  <TableCell className="tabular text-muted-foreground text-right">{r[3]}</TableCell>
                                  <TableCell className={cn(bad ? "text-[var(--chart-2)]" : "text-[var(--chart-1)]")}>{r[4]}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-muted-foreground max-h-[520px] overflow-auto px-4 py-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                      {selSpan ? t.raw[selSpan.key] ?? "(no payload recorded for this stage)" : ""}
                    </pre>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              {t.rows.some((r) => r[2] === 0)
                ? <><b>Staple resolved with no DB anchor.</b> {t.rows.filter((r) => r[2] === 0).length} ingredient(s) returned zero
                    candidates, so their nutrition came from the model&apos;s own range rather than a composition row.</>
                : <>Every ingredient in this trace reached stage 3 with at least one candidate. Raw stage payloads are truncated
                    server-side so a large trace cannot ship megabytes to the browser.</>}
            </CardFooter>
          </>
        )}
      </Card>
    </>
  );
}
