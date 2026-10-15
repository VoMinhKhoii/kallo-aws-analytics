"use client";
import * as React from "react";
/**
 * Focus for one chart: hovering a model in its rail (or its marks) dims the
 * others; a click pins that until clicked again. Never shared across charts.
 */
export function useLocalFocus() {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const active = hovered ?? pinned;
  return {
    active,
    pinned,
    setHovered,
    togglePin: (key: string) => setPinned((p) => (p === key ? null : key)),
    opacity: (key: string) => (active && active !== key ? 0.15 : 1),
  };
}

export type LocalFocus = ReturnType<typeof useLocalFocus>;

