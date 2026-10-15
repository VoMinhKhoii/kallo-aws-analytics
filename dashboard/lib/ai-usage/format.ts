const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("en-US");

export const compact = (v: number) => compactFmt.format(v);
export const int = (v: number) => intFmt.format(Math.round(v));

export function usd(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v === 0) return "$0";
  if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  if (Math.abs(v) >= 10_000) return `$${compactFmt.format(v)}`;
  return `$${v.toFixed(2)}`;
}

export function ms(v: number | null | undefined): string {
  if (v == null) return "—";
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(v < 10_000 ? 2 : 1)} s`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Relative change, or percentage points for a rate (40% → 44% is +4.0 pt, not +10%). */
export function delta(cur: number | null, prev: number | null, points = false): { text: string; up: boolean } | null {
  if (cur == null || prev == null) return null;
  if (points) {
    const change = cur - prev;
    return { text: `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)} pt`, up: change >= 0 };
  }
  if (prev === 0) return null;
  const change = cur / prev - 1;
  return { text: `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}%`, up: change >= 0 };
}
