"use client";

import * as React from "react";
import type { CloudMonitoringResponse } from "@/app/lib/types";

export function useCloudMonitoring(from: string, to: string) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [state, setState] = React.useState<{ data: CloudMonitoringResponse | null; loading: boolean; refreshing: boolean; error: string | null }>({ data: null, loading: true, refreshing: false, error: null });

  React.useEffect(() => {
    let active = true;
    const refresh = refreshKey > 0;
    setState((previous) => ({ ...previous, loading: !previous.data, refreshing: Boolean(previous.data), error: null }));
    fetch(`/api/cloud-monitoring?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (CloudMonitoringResponse & { error?: string }) | null;
        if (!response.ok || !body) throw new Error(body?.error ?? "Cloud Monitoring request failed");
        return body;
      })
      .then((data) => active && setState({ data, loading: false, refreshing: false, error: null }))
      .catch((reason) => active && setState((previous) => ({ ...previous, loading: false, refreshing: false, error: reason instanceof Error ? reason.message : "Cloud Monitoring request failed" })));
    return () => { active = false; };
  }, [from, refreshKey, to]);

  return { ...state, refresh: () => setRefreshKey((value) => value + 1) };
}
