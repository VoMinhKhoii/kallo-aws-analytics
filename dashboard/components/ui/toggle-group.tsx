"use client";
import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn("inline-flex flex-wrap items-center gap-x-4 gap-y-1", className)} {...props} />;
}
function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "text-muted-foreground inline-flex h-7 items-center border-b border-transparent text-xs whitespace-nowrap transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-accent)] data-[state=on]:border-[var(--console-accent)] data-[state=on]:text-foreground",
        className
      )}
      {...props}
    />
  );
}
export { ToggleGroup, ToggleGroupItem };
