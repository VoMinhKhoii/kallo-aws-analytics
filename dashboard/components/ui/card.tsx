import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("bg-card text-card-foreground rounded-xl border", className)} {...props} />;
}
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex items-start justify-between gap-4 px-6 pt-4 pb-4", className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("text-sm font-semibold leading-none", className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-muted-foreground text-xs", className)} {...props} />;
}
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("shrink-0", className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6 pb-6", className)} {...props} />;
}
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("text-muted-foreground border-t px-6 py-4 text-xs leading-relaxed", className)} {...props} />;
}
export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
