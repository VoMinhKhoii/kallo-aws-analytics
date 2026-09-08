"use client";
import * as React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--console-rule)] py-3">
      <h1 className="text-lg font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="sr-only">{sub}</p>
    </div>
  );
}

export type Stat = {
  label: string;
  value: string;
  unit?: string;
  denom: string;
  delta?: { value: string; dir: "up" | "down"; good: boolean };
};

export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="-mx-1 grid grid-cols-2 gap-3 px-1 md:grid-cols-3 xl:grid-cols-6">
      {stats.map((s) => (
        <Card key={s.label} className="relative overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-muted-foreground text-xs">{s.label}</p>
              {s.delta && (
                <span
                  className={cn(
                    "tabular flex items-center gap-0.5 text-[11px] font-medium",
                    s.delta.good ? "text-[var(--chart-1)]" : "text-[var(--chart-3)]"
                  )}
                >
                  {s.delta.dir === "up" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {s.delta.value}
                </span>
              )}
            </div>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight">
              {s.value}
              {s.unit && <span className="text-muted-foreground ml-0.5 text-sm font-normal">{s.unit}</span>}
            </p>
            <p className="text-muted-foreground tabular mt-1.5 text-[11px]">{s.denom}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function Note({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "plain" }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-l-2 px-3 py-2.5 text-xs leading-relaxed",
        tone === "warn"
          ? "border-[color-mix(in_oklab,var(--chart-2)_35%,white)] border-l-[var(--chart-2)] bg-[color-mix(in_oklab,var(--chart-2)_6%,white)]"
          : "bg-muted/40"
      )}
    >
      {children}
    </div>
  );
}

/** Horizontal bar with the value printed beside it — never colour alone. */
export function BarRow({
  label, n, sub, w, color, labelWidth = "w-40",
}: { label: React.ReactNode; n: string; sub?: string; w: string; color: string; labelWidth?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className={cn("shrink-0 truncate text-[13px]", labelWidth)}>{label}</span>
      <span className="bg-muted h-2.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <span className="block h-full rounded-full" style={{ width: w, background: color }} />
      </span>
      <span className="tabular w-24 shrink-0 text-right text-xs">
        {n} {sub && <span className="text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

export const CHART = {
  1: "var(--chart-1)", 2: "var(--chart-2)", 3: "var(--chart-3)", 4: "var(--chart-4)", 5: "var(--chart-5)",
} as const;
