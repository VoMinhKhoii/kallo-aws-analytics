"use client";
import * as React from "react";
export type RangeKey = "7d" | "30d" | "90d" | "all";
export const RANGE_KEYS: RangeKey[] = ["7d", "30d", "90d", "all"];
export const RANGE_LABEL: Record<RangeKey, string> = { "7d": "7d", "30d": "30d", "90d": "90d", all: "All" };

const Ctx = React.createContext<{ range: RangeKey; setRange: (r: RangeKey) => void }>({
  range: "all",
  setRange: () => {},
});

export function RangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = React.useState<RangeKey>("all");
  const value = React.useMemo(() => ({ range, setRange }), [range]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useRange = () => React.useContext(Ctx);
