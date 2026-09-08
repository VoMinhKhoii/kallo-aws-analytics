"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Database,
  Info,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type {
  AppHealthRow,
} from "@/app/lib/types";
import { cn } from "@/lib/utils";

export type ConsoleRange = "24h" | "7d" | "30d" | "90d";

export const RANGE_LABELS: Record<ConsoleRange, string> = {
  "24h": "24h",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

export function rangeWindow(range: ConsoleRange, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const days = range === "24h" ? 1 : Number(range.slice(0, -1));
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - Math.max(days - 1, 0));
  return { from: fromDate.toISOString().slice(0, 10), to, days };
}

export function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "No data" : value.toLocaleString("en-US");
}

export function formatDecimal(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "No data" : value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "No data" : `${(value * 100).toFixed(digits)}%`;
}

export function formatDuration(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "No data" : `${formatNumber(Math.round(value))} ms`;
}

export function latestByDate<T extends { date: string }>(rows: T[] | undefined): T | undefined {
  return [...(rows ?? [])].sort((left, right) => left.date.localeCompare(right.date)).at(-1);
}

export function latestByHour<T extends { hour: string }>(rows: T[] | undefined): T | undefined {
  return [...(rows ?? [])].sort((left, right) => left.hour.localeCompare(right.hour)).at(-1);
}

export function PageIntro({
  eyebrow: _eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--console-rule)] py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-[var(--console-ink)]">{title}</h1>
        <p className="sr-only">{description}</p>
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

export function RefreshButton({
  onClick,
  refreshing = false,
  label = "Refresh",
}: {
  onClick: () => void;
  refreshing?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-3 text-xs font-medium text-[var(--console-ink)] transition-colors hover:bg-[var(--console-panel)] focus-visible:outline-2 focus-visible:outline-[var(--console-blue)] disabled:cursor-wait disabled:opacity-55"
    >
      <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden="true" />
      {refreshing ? "Refreshing…" : label}
    </button>
  );
}

export function ConsolePage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1440px] pb-16">{children}</div>;
}

export function RangeControl({
  value,
  onChange,
  options = ["7d", "30d", "90d"],
  label = "Window",
}: {
  value: ConsoleRange;
  onChange: (value: ConsoleRange) => void;
  options?: ConsoleRange[];
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--console-muted)]">{label}</span>
      <div className="inline-flex overflow-hidden rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)]">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-8 border-r border-[var(--console-rule)] px-3 text-xs font-medium transition-colors last:border-r-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-blue)]",
              value === option
                ? "bg-[var(--console-ink)] text-[var(--console-surface)]"
                : "text-[var(--console-muted)] hover:bg-[var(--console-panel)] hover:text-[var(--console-ink)]",
            )}
          >
            {RANGE_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

type ScopeName = "platform" | "locale" | "mealMode";
type ScopeOption = { value: string; label: string };
const SCOPE_OPTIONS: Record<ScopeName, ScopeOption[]> = {
  platform: [
    { value: "all", label: "All platforms" },
    { value: "web", label: "Web" },
    { value: "ios", label: "iOS" },
    { value: "android", label: "Android" },
  ],
  locale: [
    { value: "all", label: "All locales" },
    { value: "en", label: "English" },
    { value: "vi", label: "Vietnamese" },
  ],
  mealMode: [
    { value: "all", label: "All meal modes" },
    { value: "precise", label: "Precise" },
    { value: "cheat", label: "Cheat" },
    { value: "manual", label: "Manual" },
    { value: "barcode", label: "Barcode" },
    { value: "nutrition_label", label: "Nutrition label" },
    { value: "relog", label: "Relog" },
  ],
};

export function ScopeControls({
  values,
  onChange,
  supported = {},
  className,
}: {
  values: Partial<Record<ScopeName, string>>;
  onChange?: (name: ScopeName, value: string) => void;
  supported?: Partial<Record<ScopeName, boolean>>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)} aria-label="Data scope controls">
      {(Object.keys(SCOPE_OPTIONS) as ScopeName[]).map((name) => {
        const isSupported = supported[name] === true;
        const value = values[name] ?? "all";
        return (
          <label key={name} className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--console-muted)]">
            {name === "mealMode" ? "Meal mode" : name}
            <select
              aria-label={name === "mealMode" ? "Meal mode" : name}
              value={isSupported ? value : "all"}
              disabled={!isSupported}
              onChange={(event) => onChange?.(name, event.target.value)}
              title={isSupported ? undefined : "This aggregate is not segmented by this dimension"}
              className={cn(
                "h-8 min-w-28 rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--console-ink)] outline-none focus-visible:border-[var(--console-blue)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--console-blue)_20%,transparent)]",
                !isSupported && "cursor-not-allowed bg-[var(--console-panel)] text-[var(--console-muted)] opacity-80",
              )}
            >
              {isSupported ? (
                SCOPE_OPTIONS[name].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)
              ) : (
                <option value="all">Not segmented</option>
              )}
            </select>
          </label>
        );
      })}
    </div>
  );
}

export function SourceTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "live" | "warn" | "error" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
      tone === "live" && "border-[color-mix(in_oklab,var(--console-green)_28%,var(--console-rule))] bg-[color-mix(in_oklab,var(--console-green)_8%,var(--console-surface))] text-[var(--console-green)]",
      tone === "warn" && "border-[color-mix(in_oklab,var(--console-amber)_28%,var(--console-rule))] bg-[color-mix(in_oklab,var(--console-amber)_8%,var(--console-surface))] text-[var(--console-amber)]",
      tone === "error" && "border-[color-mix(in_oklab,var(--console-brick)_28%,var(--console-rule))] bg-[color-mix(in_oklab,var(--console-brick)_8%,var(--console-surface))] text-[var(--console-brick)]",
      tone === "neutral" && "border-[var(--console-rule)] text-[var(--console-muted)]",
    )}>
      <span className={cn("size-1.5 rounded-full", tone === "live" ? "bg-[var(--console-green)]" : tone === "error" ? "bg-[var(--console-brick)]" : tone === "warn" ? "bg-[var(--console-amber)]" : "bg-[var(--console-muted)]")} />
      {children}
    </span>
  );
}

export function Panel({
  title,
  description,
  source,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  source?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-[var(--console-rule)] bg-[var(--console-surface)]", className)}>
      <div className="flex min-h-14 items-start justify-between gap-4 border-b border-[var(--console-rule)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-[var(--console-ink)]">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--console-muted)]">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">{source}{action}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function MetricState({
  loading,
  error,
  empty,
  insufficient = false,
  insufficientMessage = "The returned sample is too small for a stable comparison; values are shown descriptively.",
  emptyMessage = "No rows were returned for this window.",
  children,
}: {
  loading: boolean;
  error?: string | null;
  empty: boolean;
  insufficient?: boolean;
  insufficientMessage?: string;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-3 px-4 py-5 sm:px-5" aria-label="Loading data">
        <div className="h-3 w-32 animate-pulse rounded bg-[var(--console-panel)]" />
        <div className="h-3 w-full animate-pulse rounded bg-[var(--console-panel)]" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--console-panel)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex gap-3 px-4 py-5 sm:px-5" role="alert">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--console-brick)]" />
        <div>
          <p className="text-xs font-semibold text-[var(--console-brick)]">Source unavailable</p>
          <p className="mt-1 text-xs leading-5 text-[var(--console-muted)]">{error}</p>
        </div>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex gap-3 px-4 py-5 sm:px-5">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--console-muted)]" />
        <p className="max-w-2xl text-xs leading-5 text-[var(--console-muted)]">{emptyMessage}</p>
      </div>
    );
  }
  if (insufficient) {
    return (
      <div className="flex gap-3 px-4 py-5 sm:px-5">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-[var(--console-amber)]" />
        <div>
          <p className="text-xs font-semibold text-[var(--console-ink)]">Insufficient sample</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--console-muted)]">{insufficientMessage}</p>
        </div>
      </div>
    );
  }
  return children;
}

export function InlineNote({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "watch" | "error" }) {
  return (
    <div className={cn(
      "flex gap-2 border-t px-4 py-3 text-xs leading-5 sm:px-5",
      tone === "watch" && "border-[color-mix(in_oklab,var(--console-amber)_26%,var(--console-rule))] bg-[color-mix(in_oklab,var(--console-amber)_5%,var(--console-surface))] text-[var(--console-ink)]",
      tone === "error" && "border-[color-mix(in_oklab,var(--console-brick)_26%,var(--console-rule))] bg-[color-mix(in_oklab,var(--console-brick)_5%,var(--console-surface))] text-[var(--console-ink)]",
      tone === "plain" && "border-[var(--console-rule)] text-[var(--console-muted)]",
    )}>
      {tone === "watch" ? <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-[var(--console-amber)]" /> : tone === "error" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--console-brick)]" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--console-muted)]" />}
      <span>{children}</span>
    </div>
  );
}

export type RibbonItem = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "ink" | "green" | "amber" | "brick" | "blue";
  loading?: boolean;
  error?: string | null;
};

export function MetricRibbon({ items }: { items: RibbonItem[] }) {
  return (
    <div className={cn("grid overflow-hidden rounded-lg border border-[var(--console-rule)] bg-[var(--console-surface)] sm:grid-cols-2", items.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
      {items.map((item, index) => (
        <div key={item.label} className={cn("min-h-24 px-4 py-4 sm:px-5", index > 0 && "border-t border-[var(--console-rule)] sm:border-l sm:border-t-0", index > 1 && "xl:border-t-0", index === 2 && "xl:border-l", index === 3 && "xl:border-l")}>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--console-muted)]">{item.label}</p>
          <p className={cn("mt-2 text-2xl font-semibold tracking-[-0.04em]", item.error ? "text-[var(--console-brick)]" : item.tone === "green" ? "text-[var(--console-green)]" : item.tone === "amber" ? "text-[var(--console-amber)]" : item.tone === "brick" ? "text-[var(--console-brick)]" : item.tone === "blue" ? "text-[var(--console-blue)]" : "text-[var(--console-ink)]")}>{item.loading ? "Loading…" : item.error ? "Unavailable" : item.value}</p>
          {item.loading || item.error || item.detail ? <p className="mt-1 text-xs text-[var(--console-muted)]">{item.loading ? "Reading AWS snapshot" : item.error ? "Metric source unavailable" : item.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

export type BarItem = { label: string; value: number; valueLabel?: React.ReactNode; detail?: React.ReactNode; tone?: "green" | "amber" | "brick" | "blue" | "neutral" };

export function BarList({ items, emptyLabel = "No observed rows." }: { items: BarItem[]; emptyLabel?: string }) {
  if (items.length === 0) return <p className="px-4 py-5 text-xs text-[var(--console-muted)] sm:px-5">{emptyLabel}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="divide-y divide-[var(--console-rule)]">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[minmax(8rem,15rem)_minmax(4rem,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:px-5">
          <div className="min-w-0"><p className="truncate text-xs font-medium text-[var(--console-ink)]">{item.label}</p>{item.detail ? <p className="mt-0.5 truncate text-[10px] text-[var(--console-muted)]">{item.detail}</p> : null}</div>
          <div className="h-2 overflow-hidden rounded-sm bg-[var(--console-panel)]" aria-hidden="true"><div className={cn("h-full rounded-sm", item.tone === "green" ? "bg-[var(--console-green)]" : item.tone === "amber" ? "bg-[var(--console-amber)]" : item.tone === "brick" ? "bg-[var(--console-brick)]" : item.tone === "blue" ? "bg-[var(--console-blue)]" : "bg-[var(--console-muted)]")} style={{ width: `${Math.max(0, Math.min(100, (item.value / max) * 100))}%` }} /></div>
          <span className="tabular text-right text-xs font-medium text-[var(--console-ink)]">{item.valueLabel ?? formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function SimpleTable({
  columns,
  children,
  caption,
}: {
  columns: string[];
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="border-b border-[var(--console-rule)] bg-[var(--console-panel)] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--console-muted)]">
          <tr>{columns.map((column) => <th key={column} className="h-9 whitespace-nowrap px-4 font-semibold first:pl-4 last:pr-4 sm:px-5">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--console-rule)]">{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-[var(--console-panel)]", className)}>{children}</tr>;
}

export function TableCell({ children, numeric = false, muted = false, className }: { children: React.ReactNode; numeric?: boolean; muted?: boolean; className?: string }) {
  return <td className={cn("px-4 py-2.5 align-middle sm:px-5", numeric && "tabular text-right", muted ? "text-[var(--console-muted)]" : "text-[var(--console-ink)]", className)}>{children}</td>;
}

export function Delta({ current, previous, suffix = "", inverse = false }: { current: number | null | undefined; previous: number | null | undefined; suffix?: string; inverse?: boolean }) {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return <span className="text-[10px] text-[var(--console-muted)]">No comparison</span>;
  const delta = current - previous;
  if (delta === 0) return <span className="tabular text-[10px] text-[var(--console-muted)]">No change</span>;
  const positive = inverse ? delta < 0 : delta > 0;
  return <span className={cn("inline-flex items-center gap-0.5 tabular text-[10px] font-medium", positive ? "text-[var(--console-green)]" : "text-[var(--console-brick)]")}>
    {delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
    {delta > 0 ? "+" : ""}{formatNumber(delta)}{suffix}
  </span>;
}

export function StateLegend({ label, count, tone = "neutral" }: { label: string; count: React.ReactNode; tone?: "green" | "amber" | "brick" | "neutral" }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-[var(--console-muted)]"><span className={cn("size-2 rounded-sm", tone === "green" ? "bg-[var(--console-green)]" : tone === "amber" ? "bg-[var(--console-amber)]" : tone === "brick" ? "bg-[var(--console-brick)]" : "bg-[var(--console-muted)]")} />{label} <span className="tabular text-[var(--console-ink)]">{count}</span></span>;
}

export function HealthTable({ rows, platform = "all" }: { rows: AppHealthRow[]; platform?: string }) {
  const filtered = platform === "all" ? rows : rows.filter((row) => row.platform === platform);
  return <SimpleTable columns={["UTC hour", "Platform", "Event", "Dimension", "Count", "p50 / p95"]} caption="Application health buckets">
    {filtered.map((row) => <TableRow key={`${row.hour}-${row.platform}-${row.event_name}-${row.dimension_value}`}><TableCell muted><span className="font-mono text-[11px]">{row.hour.replace("T", " ").replace(":00:00Z", "Z")}</span></TableCell><TableCell><SourceTag tone="neutral">{row.platform}</SourceTag></TableCell><TableCell><span className="font-mono text-[11px]">{row.event_name}</span></TableCell><TableCell muted>{row.dimension}={row.dimension_value}</TableCell><TableCell numeric>{formatNumber(row.count)}</TableCell><TableCell numeric muted>{row.p50_ms == null && row.p95_ms == null ? "No duration" : `${formatDuration(row.p50_ms)} / ${formatDuration(row.p95_ms)}`}</TableCell></TableRow>)}
  </SimpleTable>;
}

export function LoadingLine({ label = "Loading" }: { label?: string }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-[var(--console-muted)]"><LoaderCircle className="size-3.5 animate-spin" />{label}</span>;
}

export function SourceSummary({ source, loaded, total }: { source: string; loaded: boolean; total?: number }) {
  return <div className="flex items-center gap-2 text-[11px] text-[var(--console-muted)]"><Database className="size-3.5" /><span>{source}</span>{loaded ? <Check className="size-3.5 text-[var(--console-green)]" /> : null}{total != null ? <span className="tabular">n={formatNumber(total)}</span> : null}</div>;
}
