/**
 * How each model is named and colored on the AI usage page. Known models are
 * pinned to a palette slot so a model keeps its color on every chart and
 * every window; a model not listed here takes the next free slot.
 */
export interface ModelMeta {
  /** Recharts dataKey: the id with punctuation replaced (dots read as paths). */
  key: string;
  id: string;
  label: string;
  vendor: "Google" | "Anthropic" | "Other";
  role: string;
  color: string;
}

const KNOWN: Record<string, { label: string; slot: number }> = {
  "gemini-3.1-flash-lite": { label: "Gemini 3.1 Flash-Lite", slot: 1 },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", slot: 2 },
  "gemini-3.5-flash-lite": { label: "Gemini 3.5 Flash-Lite", slot: 3 },
  "gemini-3.6-flash": { label: "Gemini 3.6 Flash", slot: 4 },
  "gemini-3-flash-preview": { label: "Gemini 3 Flash Preview", slot: 5 },
  "gemini-2.5-flash": { label: "Gemini 2.5 Flash", slot: 6 },
  "gemini-2.5-flash-lite": { label: "Gemini 2.5 Flash-Lite", slot: 7 },
};
const SLOTS = 7;

// Recharts reads dots as paths, so punctuation is escaped; the escape and the
// prefix keep keys one-to-one and clear of row fields like `date` or `total`.
export const modelKey = (id: string) => `m_${id.replace(/[^a-zA-Z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`)}`;

function vendorOf(id: string): ModelMeta["vendor"] {
  if (id.startsWith("claude-")) return "Anthropic";
  if (id.startsWith("gemini-")) return "Google";
  return "Other";
}

/** Metadata for every model seen, in a stable order (palette slot, then id). */
export function describeModels(ids: Iterable<string>, shadow: ReadonlySet<string>): ModelMeta[] {
  const unique = [...new Set(ids)];
  const taken = new Set(unique.map((id) => KNOWN[id]?.slot).filter((s): s is number => s != null));
  let next = 1;
  const freeSlot = () => {
    while (taken.has(next) && next < SLOTS) next++;
    taken.add(next);
    return next;
  };
  return unique
    .map((id) => {
      const known = KNOWN[id];
      const slot = known?.slot ?? freeSlot();
      return {
        meta: {
          key: modelKey(id),
          id,
          label: known?.label ?? id,
          vendor: vendorOf(id),
          role: shadow.has(id) ? "Shadow test" : "Live",
          color: `var(--model-${slot})`,
        },
        slot,
      };
    })
    .sort((a, b) => a.slot - b.slot || a.meta.id.localeCompare(b.meta.id))
    .map((m) => m.meta);
}
