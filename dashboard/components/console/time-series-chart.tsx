"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Point = { date: string } & Record<string, unknown>;
type Series = { key: string; label: string; color: string };

export function TimeSeriesChart({
  data,
  series,
  ariaLabel,
  format = "number",
  tooltipDetails,
  connectGaps = false,
}: {
  data: Point[];
  series: Series[];
  ariaLabel: string;
  format?: "number" | "duration" | "percent" | "currency";
  tooltipDetails?: (point: Point) => React.ReactNode;
  connectGaps?: boolean;
}) {
  const config: ChartConfig = Object.fromEntries(series.map((item) => [item.key, { label: item.label, color: item.color }]));
  const observedPoints = Object.fromEntries(series.map((item) => [
    item.key,
    data.filter((point) => typeof point[item.key] === "number" && Number.isFinite(point[item.key])).length,
  ]));
  const valueFormatter = (value: number) => {
    if (format === "duration") return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
    if (format === "percent") return `${(value * 100).toFixed(1)}%`;
    if (format === "currency") return `$${value.toFixed(4)}`;
    return value.toLocaleString("en-US");
  };
  return (
    <ChartContainer config={config} className="h-64 w-full aspect-auto" role="img" aria-label={ariaLabel}>
      <LineChart data={data} margin={{ top: 12, right: 14, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} tickMargin={10} />
        <YAxis tickLine={false} axisLine={false} width={62} tickMargin={8} tickFormatter={(value) => valueFormatter(Number(value))} />
        <ChartTooltip
          content={(props) => (
            <ChartTooltipContent
              active={props.active}
              payload={props.payload}
              label={props.label}
              formatter={(value) => valueFormatter(Number(value))}
              footer={tooltipDetails?.(props.payload?.[0]?.payload as Point)}
            />
          )}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((item) => (
          <Line key={item.key} type="monotone" dataKey={item.key} name={item.key} stroke={item.color} strokeWidth={2} dot={observedPoints[item.key] === 1 ? { r: 4, strokeWidth: 2 } : false} activeDot={{ r: 3 }} connectNulls={connectGaps} isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
