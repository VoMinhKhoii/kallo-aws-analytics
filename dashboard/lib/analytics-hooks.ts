"use client";
import { useAnalytics, usePaged } from "@/lib/use-analytics";

export type AppSummary = {
  from: string; to: string;
  newUsers: number; active: number; meals: number; items: number;
  reqs: number; ok: number; err: number; pend: number; waitlist: number;
  everLogged: number; registered: number; heavyTwo: number;
  slots: [string, number][]; modes: [string, number][]; conc: [string, number][];
};
export type AiSummary = {
  from: string; to: string;
  meals: number; verdicts: number; acc: number; unm: number; rej: number; mis: number;
  pool: number[]; choice: number; ovr: number; a2: number; o2: number; a3: number; o3: number;
  degraded: number; matchP95: number; stageOutliers: number;
  sim: { n: number; bins: number[] };
  stages: [string, number, number, number][];
  reasons: { n: number; nul: number; none: number; cat: number; other: number };
  rowsUsed: number; matches: number; corpusSize: number;
  unmN: number; unmDistinct: number; ovrPairs: number;
};
export type Summary = { anchor: string; range: string; app: AppSummary; ai: AiSummary };

export type Weeks = {
  app: [string, number | null, number | null, number | null, number | null, number | null][];
  ai: { w: string; reqs: number | null; ing?: number; acc?: number; pool0?: number; choice?: number; ovr?: number }[];
};

export const useSummary = (range: string) => useAnalytics<Summary>("summary", { range });
export const useWeeks = () => useAnalytics<Weeks>("weeks");

export type OverturnGroup = { q: string; rank: number; n: number; top1: string | null };
export const useOverturnGroups = (range: string, pageSize = 10) =>
  usePaged<OverturnGroup>("overturnGroups", { range }, pageSize);

export type PoolRow = [string, string, string, string, string, string, string, string];
export const useOverturnPool = (range: string, q?: string, rank?: number) =>
  useAnalytics<{ q: string; rank: number; pool: PoolRow[] }>(
    "overturnPool", { range, q, rank }, Boolean(q && rank)
  );

export type ReverseRow = [string, string, string, number, number, [string, number][], [string, number][]];
export const useReverseRows = (range: string, pageSize = 14) =>
  usePaged<ReverseRow>("reverseRows", { range }, pageSize);

export type CorpusRow = [string, string, string, number, number];
export const useCorpusRows = (range: string, pageSize = 12) =>
  usePaged<CorpusRow>("corpusRows", { range }, pageSize);

export const useCorpusQueries = (range: string, fcid?: string, pageSize = 10) =>
  usePaged<[string, number]>("corpusQueries", { range, fcid }, pageSize, Boolean(fcid));

export const usePoolNames = (range: string, pool: number, pageSize = 40) =>
  usePaged<string>("poolNames", { range, pool }, pageSize);

export const useUnresolved = (range: string, pageSize = 10) =>
  usePaged<[string, number]>("unresolved", { range }, pageSize);

export type RequestRow = [string, string, string, string, number | null, number, number, number, number, string];
export const useRequests = (range: string, pageSize = 12) =>
  usePaged<RequestRow>("requestsPage", { range }, pageSize);

export type TraceDetail = {
  requestId: string; total: number; meal: string | null; status: string | null;
  spans: { key: string; name: string; dur: number; start: number; ok: boolean }[];
  counts: { ingredients: number; accepted: number; unmatched: number; rejected: number };
  rows: [string, string, number, string, string][];
  ovr: { ing: string; rank: number; pool: [string, string, string, string, string, string][] } | null;
  raw: Record<string, string>;
};
export const useTraceDetail = (id?: string) =>
  useAnalytics<TraceDetail>("traceDetail", { id }, Boolean(id));
