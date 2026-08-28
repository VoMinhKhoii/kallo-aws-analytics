"use client";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function Loading({ label = "Querying", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 px-5 py-6 text-xs">
      <Loader2 className="size-3.5 animate-spin" />
      {label}…
      <span className="sr-only">{rows}</span>
    </div>
  );
}

export function Failed({ error, code }: { error: string; code?: string }) {
  const unconfigured = code === "NOT_CONFIGURED" || error.includes("not set") || error.includes("not configured");
  return (
    <div className="px-5 py-5">
      <div className="rounded-lg border border-l-2 border-l-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_5%,white)] px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--chart-3)]">
          <AlertTriangle className="size-3.5" />
          {unconfigured ? "No data source configured" : "Query failed"}
        </p>
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          {unconfigured ? (
            <>
              {error}. Copy <code>.env.local.example</code> to <code>.env.local</code>, fill it in, and restart the
              server. Nothing is rendered from cached or sample numbers.
            </>
          ) : (
            error
          )}
          {code && !unconfigured && (
            <>
              {" "}
              <span className="tabular opacity-70">[{code}]</span> — the full database response is in the server log.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function PageState({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <Card className="mt-3"><Failed error={error} /></Card>;
  if (loading) return <Card className="mt-3"><Loading /></Card>;
  return null;
}
