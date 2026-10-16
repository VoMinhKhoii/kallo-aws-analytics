"use client";

import { decimal, ms, pct, usd } from "@/lib/ai-usage/format";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "@/components/charts/recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

import { currencyAxis } from "@/lib/ai-usage/chart-data";

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
  const currency = currencyAxis(data.flatMap(point => series.map(item => Number(point[item.key]))));
  const valueFormatter = format === "duration" ? ms : format === "percent" ? pct : format === "currency" ? usd : decimal;
  return (
    <ChartContainer config={config} className="h-64 w-full aspect-auto" role="img" aria-label={ariaLabel}>
      <LineChart data={data} margin={{ top: 12, right: 14, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} tickMargin={10} />
        <YAxis domain={format === "currency" ? currency.domain : undefined} ticks={format === "currency" ? currency.ticks : undefined} tickLine={false} axisLine={false} width={62} tickMargin={8} tickFormatter={(value) => (format === "currency" ? currency.format : valueFormatter)(Number(value))} />
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
          <Line key={item.key} type="monotoneX" dataKey={item.key} name={item.key} stroke={item.color} strokeWidth={2} dot={observedPoints[item.key] === 1 ? { r: 4, strokeWidth: 2 } : false} activeDot={{ r: 3 }} connectNulls={connectGaps} isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
