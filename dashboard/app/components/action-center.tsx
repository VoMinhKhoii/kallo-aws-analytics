"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunStatus } from "@/app/lib/types";

type RequestState = "idle" | "loading" | "success" | "error";

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error || `Request failed with status ${response.status}`);
  if (!body) throw new Error("The server returned an invalid response");
  return body;
}

function formatPhase(phase: string): string {
  return phase.replaceAll("_", " ");
}

export function PipelineControl() {
  const [run, setRun] = useState<RunStatus | null>(null);
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState("");

  const poll = useCallback(async (runId: string) => {
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const nextRun = await readJson<RunStatus>(response);
      setRun(nextRun);
      if (nextRun.phase === "completed") setState("success");
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Pipeline status could not be loaded");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!run?.run_id || run.phase === "completed" || state === "error") return;
    const intervalId = window.setInterval(() => void poll(run.run_id), 5_000);
    return () => window.clearInterval(intervalId);
  }, [poll, run, state]);

  async function start() {
    setState("loading");
    setError("");
    setRun(null);
    try {
      const response = await fetch("/api/runs", { method: "POST" });
      const started = await readJson<{ run_id: string }>(response);
      const nextRun = { run_id: started.run_id, phase: "extracting" };
      setRun(nextRun);
      await poll(started.run_id);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Pipeline run could not be started");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={start}
        disabled={state === "loading" && run?.phase !== "completed"}
        className="min-h-11 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-4 py-2.5 text-sm font-semibold text-[oklch(0.98_0.004_165)] shadow-sm transition duration-200 ease-out hover:bg-[var(--accent)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
      >
        {state === "loading" && !run ? "Starting pipeline..." : "Run pipeline now"}
      </button>
      {run ? (
        <p className="max-w-64 text-right text-xs text-[var(--ink-muted)]" aria-live="polite">
          <span className="mr-1.5 inline-block size-2 rounded-full bg-[var(--accent)]" />
          Phase: <span className="font-semibold capitalize text-[var(--ink)]">{formatPhase(run.phase)}</span>
          <span className="block truncate font-mono text-[10px]">{run.run_id}</span>
        </p>
      ) : null}
      {error ? <p className="max-w-72 text-right text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function WeeklyInsight() {
  const [summary, setSummary] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState("");

  async function generate() {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/insight", { method: "POST" });
      const body = await readJson<{ summary: string }>(response);
      setSummary(body.summary);
      setState("success");
    } catch (insightError) {
      setError(insightError instanceof Error ? insightError.message : "Weekly summary is unavailable");
      setState("error");
    }
  }

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6 lg:p-7" aria-labelledby="weekly-summary-title">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div>
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-dark)]">Operations brief</p>
          <h2 id="weekly-summary-title" className="text-xl font-semibold tracking-[-0.025em]">Weekly summary</h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--ink-muted)]">
            Gemini summarizes the last seven days of aggregate activity, cost, quality, and coverage signals.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={state === "loading"}
          className="min-h-10 whitespace-nowrap rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition duration-200 ease-out hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
        >
          {state === "loading" ? "Generating..." : summary ? "Refresh summary" : "Generate summary"}
        </button>
      </div>
      <div className="mt-6 min-h-24 rounded-xl bg-[var(--surface-muted)] p-4 sm:p-5" aria-live="polite">
        {state === "loading" ? (
          <div className="space-y-3">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-[92%]" />
            <div className="skeleton h-3 w-[72%]" />
          </div>
        ) : error ? (
          <p className="text-sm leading-6 text-[var(--danger)]">{error}</p>
        ) : summary ? (
          <p className="max-w-[90ch] text-sm leading-6 text-[var(--ink)]">{summary}</p>
        ) : (
          <p className="text-sm leading-6 text-[var(--ink-muted)]">Generate a concise, data-grounded view of the current operating week.</p>
        )}
      </div>
    </section>
  );
}
