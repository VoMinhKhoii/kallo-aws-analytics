"use client";
import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn("bg-secondary inline-flex items-center gap-0.5 rounded-lg p-0.5", className)} {...props} />;
}
function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "text-muted-foreground inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm",
        className
      )}
      {...props}
    />
  );
}
export { ToggleGroup, ToggleGroupItem };
