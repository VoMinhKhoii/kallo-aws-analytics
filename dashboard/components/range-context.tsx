"use client";
import * as React from "react";
export type RangeKey = "24h" | "7d" | "30d";
export const RANGE_KEYS: RangeKey[] = ["24h", "7d", "30d"];
export const RANGE_LABEL: Record<RangeKey, string> = { "24h": "24h", "7d": "7d", "30d": "30d" };

const Ctx = React.createContext<{ range: RangeKey; setRange: (r: RangeKey) => void }>({
  range: "30d",
  setRange: () => {},
});

export function RangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = React.useState<RangeKey>("30d");
  const value = React.useMemo(() => ({ range, setRange }), [range]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useRange = () => React.useContext(Ctx);
