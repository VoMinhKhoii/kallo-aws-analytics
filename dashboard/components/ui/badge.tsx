import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground border-transparent",
        outline: "text-muted-foreground",
        good: "border-transparent bg-[color-mix(in_oklab,var(--chart-1)_12%,white)] text-[var(--chart-1)]",
        warn: "border-transparent bg-[color-mix(in_oklab,var(--chart-2)_14%,white)] text-[var(--chart-2)]",
        bad: "border-transparent bg-[color-mix(in_oklab,var(--chart-3)_12%,white)] text-[var(--chart-3)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
