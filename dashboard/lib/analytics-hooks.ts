"use client";
import { useAnalytics, usePaged } from "@/lib/use-analytics";

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
