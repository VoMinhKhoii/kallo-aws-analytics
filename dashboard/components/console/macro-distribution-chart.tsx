"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { MacroRow } from "@/app/lib/types";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const NUTRIENTS = ["calories_kcal", "protein_g", "carbohydrate_g", "fat_g"] as const;
const LABELS: Record<(typeof NUTRIENTS)[number], string> = {
  calories_kcal: "Calories",
  protein_g: "Protein",
  carbohydrate_g: "Carbohydrate",
  fat_g: "Fat",
};

export function MacroDistributionChart({ rows }: { rows: MacroRow[] }) {
  const [nutrient, setNutrient] = React.useState<(typeof NUTRIENTS)[number]>("calories_kcal");
  const unit = nutrient === "calories_kcal" ? "kcal" : "g";
  const data = rows
    .filter((row) => row.nutrient === nutrient)
    .sort((left, right) => left.bucket_min - right.bucket_min)
    .map((row) => ({
      bucket: row.bucket_max == null ? `${row.bucket_min}+` : `${row.bucket_min}–${row.bucket_max}`,
      count: row.count,
    }));
  const config: ChartConfig = { count: { label: "Meals", color: "var(--console-blue)" } };

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-[var(--console-rule)] px-4 py-3 sm:px-5" role="tablist" aria-label="Macro nutrient">
        {NUTRIENTS.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={nutrient === key} onClick={() => setNutrient(key)} className={cn("rounded-md border px-2.5 py-1.5 text-xs transition-colors", nutrient === key ? "border-[var(--console-ink)] bg-[var(--console-ink)] text-[var(--console-surface)]" : "border-[var(--console-rule)] text-[var(--console-muted)] hover:text-[var(--console-ink)]")}>
            {LABELS[key]}
          </button>
        ))}
      </div>
      <div className="px-3 py-4 sm:px-5">
        <ChartContainer config={config} className="h-72 w-full aspect-auto" role="img" aria-label={`${LABELS[nutrient]} distribution histogram`}>
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={10} minTickGap={8} label={{ value: unit, position: "insideBottomRight", offset: -4 }} />
            <YAxis tickLine={false} axisLine={false} width={48} tickMargin={8} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => Number(value).toLocaleString("en-US")} />} />
            <Bar dataKey="count" fill="var(--console-blue)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
