"use client";
import * as React from "react";
import * as Recharts from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);
function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within <ChartContainer />");
  return ctx;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof Recharts.ResponsiveContainer>["children"];
}) {
  const uid = React.useId();
  const chartId = `chart-${id || uid.replace(/:/g, "")}`;
  const vars = Object.entries(config)
    .filter(([, v]) => v.color)
    .map(([k, v]) => `  --color-${k}: ${v.color};`)
    .join("\n");
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-grid_line]:stroke-border/70 [&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          className
        )}
        {...props}
      >
        <style dangerouslySetInnerHTML={{ __html: `[data-chart=${chartId}] {\n${vars}\n}` }} />
        <Recharts.ResponsiveContainer>{children}</Recharts.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = Recharts.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
  hideLabel = false,
  className,
  footer,
}: {
  active?: boolean;
  payload?: readonly any[];
  label?: any;
  labelFormatter?: (v: any) => React.ReactNode;
  formatter?: (value: any, name: string) => React.ReactNode;
  hideLabel?: boolean;
  className?: string;
  footer?: React.ReactNode;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div className={cn("bg-popover grid min-w-36 gap-1.5 rounded-lg border px-2.5 py-2 text-xs shadow-md", className)}>
      {!hideLabel && <div className="font-medium">{labelFormatter ? labelFormatter(label) : label}</div>}
      <div className="grid gap-1">
        {payload.map((item: any, i: number) => {
          const key = String(item.dataKey ?? item.name ?? i);
          const cfg = config[key];
          return (
            <div key={key + i} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-[2px]" style={{ background: item.color ?? `var(--color-${key})` }} />
                <span className="text-muted-foreground">{cfg?.label ?? key}</span>
              </span>
              <span className="tabular font-medium">{formatter ? formatter(item.value, key) : item.value}</span>
            </div>
          );
        })}
      </div>
      {footer ? <div className="mt-1 border-t pt-1.5 text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

const ChartLegend = Recharts.Legend;

function ChartLegendContent({ payload, className }: { payload?: readonly any[]; className?: string }) {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2", className)}>
      {payload.map((item: any) => {
        const key = String(item.dataKey ?? item.value);
        return (
          <span key={key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
            {config[key]?.label ?? key}
          </span>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, useChart };
