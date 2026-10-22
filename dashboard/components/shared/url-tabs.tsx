"use client";

import * as Tabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export function UrlTabs({ value, onChange, items, children }: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  children?: ReactNode;
}) {
  return (
    <Tabs.Root value={value} onValueChange={onChange} className="grid min-w-0 gap-4">
      <Tabs.List aria-label="Sections" className="flex flex-wrap gap-4 border-b border-border">
        {items.map(item => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            className="border-b-2 border-transparent py-4 text-sm text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value={value} className="grid min-w-0 gap-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {children}
      </Tabs.Content>
    </Tabs.Root>
  );
}
