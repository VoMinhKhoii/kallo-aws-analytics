"use client";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";
import { CalendarDays } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { axisFor, type MetricMeta } from "@/lib/metrics";

export type TrendPoint = { week: string; value: number | null };

export function TrendCard({
  title, description, metrics, metric, onMetric, data, firstWeek, footer,
}: {
  title: string;
  description: string;
  metrics: Record<string, MetricMeta>;
  metric: string;
  onMetric: (k: string) => void;
  data: TrendPoint[];
  firstWeek: number;
  footer?: React.ReactNode;
}) {
  const meta = metrics[metric];
  const rate = Boolean(meta.rate);
  const suffix = rate ? "%" : "";
  const { max, ticks } = axisFor(data.map((d) => d.value), rate);
  const gaps = data.filter((d) => d.value === null).length;
  const config: ChartConfig = { value: { label: meta.label, color: meta.color } };
  const bandStart = data[Math.min(Math.max(firstWeek, 0), Math.max(data.length - 1, 0))]?.week ?? data[0]?.week;
  const bandEnd = data[data.length - 1]?.week;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <CardAction className="flex items-center gap-2">
          <ToggleGroup type="single" value={metric} onValueChange={(v) => v && onMetric(v)} aria-label="Metric">
            {Object.entries(metrics).map(([k, m]) => (
              <ToggleGroupItem key={k} value={k}>{m.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button variant="outline" size="icon" aria-label="Pick dates"><CalendarDays /></Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={meta.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={meta.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            {bandStart && bandEnd && (
              <ReferenceArea x1={bandStart} x2={bandEnd} fill="var(--muted)" fillOpacity={0.55} ifOverflow="extendDomain" />
            )}
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={10} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={48} tickMargin={6}
                   domain={[0, max]} ticks={ticks} tickFormatter={(v) => `${v}${suffix}`} />
            <ChartTooltip cursor={{ stroke: "var(--border)" }}
                          content={<ChartTooltipContent formatter={(v) => `${v}${suffix}`} />} />
            <Area
              isAnimationActive={false}
              dataKey="value" type="monotone" connectNulls={false}
              stroke={meta.color} strokeWidth={2} fill={`url(#fill-${metric})`}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: TrendPoint }) => {
                const { cx, cy, payload, index } = props;
                if (cx == null || cy == null || payload?.value == null) return <g key={`d-${index}`} />;
                const zero = payload.value === 0;
                return <circle key={`d-${index}`} cx={cx} cy={cy} r={zero ? 2.5 : 3}
                               fill={zero ? meta.color : "var(--card)"} stroke={meta.color} strokeWidth={2} />;
              }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        {meta.note}
        {rate && gaps > 0 && <> <b>The line breaks at {gaps} week{gaps === 1 ? "" : "s"} with no traffic.</b></>}
        {footer && <> {footer}</>}
      </CardFooter>
    </Card>
  );
}
