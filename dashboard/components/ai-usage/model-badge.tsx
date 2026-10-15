import type { ModelMeta } from "@/lib/ai-usage/models";
const GLYPH: Record<ModelMeta["vendor"], string> = { Google: "G", Anthropic: "A", Other: "·" };

export function ModelBadge({ meta, size = 24 }: { meta: ModelMeta; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md text-[12px] font-semibold"
      style={{
        width: size,
        height: size,
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 40%, transparent)`,
      }}
    >
      {GLYPH[meta.vendor]}
    </span>
  );
}

