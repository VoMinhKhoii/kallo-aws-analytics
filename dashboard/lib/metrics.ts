/** Presentation config for the trend charts. Notes here describe how to READ
 *  the series; anything about what the numbers say is derived from the data. */
export type MetricMeta = { label: string; color: string; max?: number; axis?: number[]; note: string; rate?: boolean };

export const CHART = {
  1: "var(--chart-1)", 2: "var(--chart-2)", 3: "var(--chart-3)", 4: "var(--chart-4)", 5: "var(--chart-5)",
} as const;

const COUNT_NOTE =
  "Weeks with no activity are drawn at zero, not skipped — the product was live throughout, so an empty week is a measured zero rather than missing data. Filled dots mark those zeros.";
const RATE_NOTE =
  "A rate needs a denominator, so a week where nothing ran is left empty rather than drawn at 0%. The line breaks there.";

export const APP_METRICS: Record<string, MetricMeta> = {
  meals:   { label: "Meals",         color: "#1f6feb", note: COUNT_NOTE },
  users:   { label: "Active users",  color: "#16794a", note: COUNT_NOTE },
  signups: { label: "Signups",       color: "#b8860b", note: COUNT_NOTE },
  reqs:    { label: "Requests",      color: "#8a857a", note: COUNT_NOTE },
  errpct:  { label: "Error %",       color: "#b3402f", note: RATE_NOTE, rate: true },
};

export const AI_METRICS: Record<string, MetricMeta> = {
  vol: { label: "Meals",             color: "#1f6feb", note: COUNT_NOTE },
  acc: { label: "Accepted %",        color: "#16794a", note: RATE_NOTE + " Acceptance is a workflow disposition, not accuracy: it means the model selected a candidate and passed the contract, nothing about whether the row is right.", rate: true },
  ovr: { label: "Overturn %",        color: "#b3402f", note: RATE_NOTE + " Overturn counts only ingredients where the model actually had a choice; a single-candidate pool cannot be overturned.", rate: true },
  gap: { label: "Zero-candidate %",  color: "#b8860b", note: RATE_NOTE + " A zero-candidate ingredient reached stage 3 with an empty pool, so its nutrition came from the model's own priors.", rate: true },
};

export const isRate = (k: string) => Boolean(APP_METRICS[k]?.rate || AI_METRICS[k]?.rate);

/** Nice axis for a series whose ceiling is only known at runtime. */
export function axisFor(values: (number | null)[], rate: boolean) {
  const max = Math.max(...values.filter((v): v is number => v != null), rate ? 10 : 1);
  if (rate) {
    const top = Math.min(100, Math.ceil(max / 20) * 20 || 20);
    return { max: top, ticks: [0, top / 2, top] };
  }
  const step = max <= 10 ? 5 : max <= 50 ? 10 : max <= 200 ? 50 : 100;
  const top = Math.ceil(max / step) * step;
  return { max: top, ticks: [0, top / 2, top] };
}

export const BUCKET_META = [
  { label: "0 candidates", t: "reached stage 3 with an empty pool",
    note: "Nothing was retrieved, so the model estimated nutrition from its own priors with no composition row behind it. This is corpus coverage, not ranking." },
  { label: "1 candidate", t: "had exactly one candidate",
    note: "The model had no choice, so these are excluded from the overturn denominator. A single-candidate pool is not evidence the row is right, only that nothing else cleared the acceptance floor." },
  { label: "2 candidates", t: "had two candidates",
    note: "The rarest outcome. Names here can also appear in other buckets — pool size is a property of the request, not of the query." },
  { label: "3 candidates", t: "received a full pool",
    note: "The normal path, and where nearly every overturn happens. This is where the ranker and the adjudicator disagree." },
];
