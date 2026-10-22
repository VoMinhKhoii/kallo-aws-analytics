"use client";

import type { ModelMeta } from "@/lib/ai-usage/models";

import { SeriesRail } from '@/components/charts/series-rail';
import { type LocalFocus } from '@/components/charts/use-local-focus';
export { useLocalFocus, type LocalFocus } from '@/components/charts/use-local-focus';

import { ModelBadge } from "./model-badge";

export interface RailItem {
  meta: ModelMeta;
  value: string;
  sub?: string;
}

/** Model metadata adapts to the same rail used by every series chart. */
export function ModelRail({ items, focus, inline = false }: { items: RailItem[]; focus: LocalFocus; inline?: boolean }) {
  return <SeriesRail label="Models" inline={inline} focus={focus} items={items.map(({meta, value, sub}) => ({...meta, value, sub: sub ?? meta.role, glyph: <ModelBadge meta={meta} />}))} />;
}
