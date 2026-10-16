/** Bounded scalar metadata shared by both trace adapters. */
export const stageStatKeys = ['ingredientCount','matchedCount','unmatchedCount','mealItemCount','chunkCount','failedChunkCount','itemCount','isFood','mealSlot'] as const;
export function stageStats(...payloads: unknown[]): Record<string, number | string | null> {
  const stats: Record<string, number | string | null> = {};
  for (const payload of payloads) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    const data = payload as Record<string, unknown>;
    const items = data.mealItems ?? data.items;
    if (Array.isArray(items)) {
      stats.mealItemCount = items.length;
      if (items.every(item => item && typeof item === 'object' && Array.isArray(item.ingredients))) {
        stats.ingredientCount = items.reduce((sum, item) => sum + item.ingredients.length, 0);
      }
    }
    for (const key of stageStatKeys) {
      const value = data[key];
      if (value === null || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= 128) stats[key] = value as number | string | null;
      else if (typeof value === 'boolean') stats[key] = String(value);
    }
  }
  return stats;
}
