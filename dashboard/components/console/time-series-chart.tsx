"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Point = { date: string } & Record<string, number | string | null | undefined>;
type Series = { key: string; label: string; color: string };

export function TimeSeriesChart({
  data,
  series,
  ariaLabel,
  format = "number",
}: {
  data: Point[];
  series: Series[];
  ariaLabel: string;
  format?: "number" | "duration" | "percent" | "currency";
}) {
  const config: ChartConfig = Object.fromEntries(series.map((item) => [item.key, { label: item.label, color: item.color }]));
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
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => valueFormatter(Number(value))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((item) => (
          <Line key={item.key} type="monotone" dataKey={item.key} name={item.key} stroke={item.color} strokeWidth={2} dot={data.length === 1 ? { r: 3 } : false} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
