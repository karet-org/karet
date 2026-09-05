"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { TOP_NAV_HEIGHT_PX } from "@/components/layout/TopNav";
import { IconPlay } from "@/components/icons";
import type { JobRecord } from "@/lib/types/jobs";

type Job = JobRecord;

export default function JobsPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [bucketError, setBucketError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadJobs = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch(
        `/api/p/${pipeline}/jobs?page=${page}&pageSize=${pageSize}`,
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (body.error === "bucket_not_found") setBucketError(body.message);
        else setLoadError(body.message ?? "Could not load jobs.");
        return;
      }
      const d = await r.json();
      setJobs(d.jobs ?? []);
      setTotalPages(d.totalPages ?? 1);
      setTotal(d.total ?? 0);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, [pipeline, page, pageSize]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Keep the page within range if the total shrinks (e.g. records change).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Adaptive polling: 2s while a run is scheduled or running so the
  // countdown stays live and the row transitions are caught quickly,
  // 15s otherwise.
  useEffect(() => {
    const anyActive = jobs.some(
      (j) => j.status === "running" || j.status === "scheduled" || j.status === "queued",
    );
    const intervalMs = anyActive ? 2000 : 15000;
    const id = setInterval(loadJobs, intervalMs);
    return () => clearInterval(id);
  }, [loadJobs, jobs]);

  // Synchronous lock so a rapid double-click doesn't fire two POSTs
  // before React rerenders the disabled state of the button. Without
  // this, two parallel jobs land for the same pipeline and race over
  // the same S3 prefix.
  const triggerInFlight = useRef(false);
  async function triggerJob() {
    if (triggerInFlight.current) return;
    triggerInFlight.current = true;
    setRunning(true);
    try {
      await fetch(`/api/p/${pipeline}/jobs?clean=true`, { method: "POST" });
      if (page !== 1) setPage(1);
      else loadJobs();
    } finally {
      triggerInFlight.current = false;
      setRunning(false);
    }
  }

  const statusDot = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "abandoned":
        return "bg-amber-500";
      case "running":
        return "bg-yellow-500 animate-pulse";
      case "scheduled":
      case "queued":
        return "bg-blue-500 animate-pulse";
      default:
        return "bg-gray-400";
    }
  };

  /** One-line live progress, e.g. `ingesting · 3/7 mappings · 12 partitions`. */
  function progressLine(job: Job): string {
    const p = job.progress;
    if (!p) return job.status === "queued" ? "waiting for a worker" : "running…";
    if (p.stage === "downloading") {
      return p.files_total
        ? `downloading · ${p.files_done ?? 0}/${p.files_total} files`
        : "downloading…";
    }
    const parts = [`ingesting · ${p.mappings_done ?? 0}/${p.mappings_total ?? "?"} mappings`];
    if (job.partitions_written !== undefined) {
      parts.push(`${job.partitions_written} partition(s)`);
    }
    return parts.join(" · ");
  }

  function scheduledCountdown(nextRunAt: string): string {
    const ms = Date.parse(nextRunAt) - Date.now();
    if (!Number.isFinite(ms)) return "soon";
    if (ms <= 0) return "any moment now";
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `runs in ${s}s`;
    const m = Math.ceil(s / 60);
    return `runs in ${m}m`;
  }

  function formatDuration(startedAt: string, completedAt: string): string {
    const ms = Date.parse(completedAt) - Date.parse(startedAt);
    if (!Number.isFinite(ms) || ms < 0) return "-";
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  }

  return (
    <main
      className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6 lg:px-6 lg:py-8"
      style={{ minHeight: `calc(100vh - ${TOP_NAV_HEIGHT_PX}px)` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Jobs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Run the pipeline and watch its progress. Each run reads raw CSVs, applies the configured mappings, and writes Parquet output.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => loadJobs()}
            disabled={refreshing}
            title="Refresh job list"
            aria-label="Refresh"
            className="rounded border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button
            type="button"
            onClick={() => triggerJob()}
            disabled={running}
            className="flex items-center gap-1.5 rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {running ? "Running…" : <><IconPlay size={12} /> Run Pipeline</>}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {bucketError ? (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Couldn&apos;t load jobs.</strong> {loadError}
          </div>
        ) : !loaded ? (
          <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-gray-200" />
                <span className="h-3 w-24 animate-pulse rounded bg-gray-200" />
                <span className="h-3 flex-1 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            No jobs yet. Click &quot;Run Pipeline&quot; to start one.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {jobs.map((job) => {
              const expanded = expandedJobId === job.id;
              const terminal =
                job.status !== "running" &&
                job.status !== "scheduled" &&
                job.status !== "queued";
              const stats = [
                job.files_processed !== undefined ? `${job.files_processed} file(s)` : null,
                job.partitions_written !== undefined ? `${job.partitions_written} partition(s)` : null,
                job.completedAt ? formatDuration(job.startedAt, job.completedAt) : null,
              ].filter(Boolean);
              return (
                <div key={job.id}>
                  <button
                    type="button"
                    onClick={() => terminal && setExpandedJobId(expanded ? null : job.id)}
                    aria-expanded={terminal ? expanded : undefined}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                      terminal ? "hover:bg-gray-50" : "cursor-default"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${statusDot(job.status)}`}
                      aria-hidden
                    />
                    <span className="sr-only">{job.status}</span>
                    <code className="shrink-0 text-[11px] text-gray-500">{job.id}</code>
                    {job.trigger === "webhook" && (
                      <span
                        className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700"
                        title="Auto-triggered by an upload to S3"
                      >
                        auto
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                      {job.status === "scheduled" && job.nextRunAt
                        ? scheduledCountdown(job.nextRunAt)
                        : job.status === "queued" || job.status === "running"
                          ? progressLine(job)
                          : job.status === "failed"
                            ? <span className="text-red-500">Failed{stats.length > 0 ? ` · ${stats.join(" · ")}` : ""}</span>
                            : stats.join(" · ")}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {new Date(job.startedAt).toLocaleString()}
                    </span>
                    {terminal && (
                      <span
                        className={`shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ›
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <div className="space-y-2 bg-gray-50 px-3 py-2 text-[11px] text-gray-700">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <dt className="text-gray-500">Job ID</dt>
                        <dd className="font-mono">{job.id}</dd>
                        <dt className="text-gray-500">Status</dt>
                        <dd>{job.status}</dd>
                        <dt className="text-gray-500">Started</dt>
                        <dd>{new Date(job.startedAt).toLocaleString()}</dd>
                        {job.completedAt && (
                          <>
                            <dt className="text-gray-500">Completed</dt>
                            <dd>{new Date(job.completedAt).toLocaleString()}</dd>
                            <dt className="text-gray-500">Duration</dt>
                            <dd>{formatDuration(job.startedAt, job.completedAt)}</dd>
                          </>
                        )}
                        {job.files_processed !== undefined && (
                          <>
                            <dt className="text-gray-500">Files processed</dt>
                            <dd>{job.files_processed}</dd>
                          </>
                        )}
                        {job.partitions_written !== undefined && (
                          <>
                            <dt className="text-gray-500">Partitions written</dt>
                            <dd>{job.partitions_written}</dd>
                          </>
                        )}
                        {job.errors !== undefined && (
                          <>
                            <dt className="text-gray-500">Errors</dt>
                            <dd>{job.errors.length}</dd>
                          </>
                        )}
                      </dl>
                      {job.error && (
                        <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                          <div className="mb-0.5 font-medium">Error</div>
                          <p className="whitespace-pre-wrap break-words font-mono">{job.error}</p>
                        </div>
                      )}
                      {job.errors && job.errors.length > 0 && (
                        <ul className="max-h-60 space-y-1 overflow-auto rounded border border-gray-200 bg-white p-2 font-mono text-[11px] text-gray-700">
                          {job.errors.map((e, i) => (
                            <li key={i} className="border-l-2 border-red-300 pl-2">
                              {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!bucketError && total > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <label htmlFor="job-page-size">Per page</label>
              <select
                id="job-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span>{total} job{total !== 1 ? "s" : ""} total</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
