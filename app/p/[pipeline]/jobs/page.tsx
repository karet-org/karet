"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
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

  // Refs let long-lived effects (stream, poll timer) read current state
  // without re-running on every render.
  const loadJobsRef = useRef(loadJobs);
  loadJobsRef.current = loadJobs;
  const pageRef = useRef(page);
  pageRef.current = page;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  // Live updates over SSE. Events only update rows already on the page
  // (inserting would break page size and totals); unknown ids and
  // terminal transitions trigger a reload, which repaginates correctly.
  const [sseConnected, setSseConnected] = useState(false);
  useEffect(() => {
    const es = new EventSource(`/api/p/${pipeline}/jobs/events`);
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      const record = JSON.parse(e.data) as Job;
      const known = jobsRef.current.some((j) => j.id === record.id);
      if (known) {
        setJobs((prev) =>
          prev.map((j) => (j.id === record.id ? record : j)),
        );
      }
      const terminal = record.status !== "queued" && record.status !== "running";
      if (!known && pageRef.current === 1) loadJobsRef.current();
      else if (terminal) loadJobsRef.current();
    };
    return () => es.close();
  }, [pipeline]);

  // Reconciliation poll: slow while SSE is delivering, faster fallback
  // when it isn't.
  useEffect(() => {
    const id = setInterval(() => loadJobsRef.current(), sseConnected ? 30000 : 5000);
    return () => clearInterval(id);
  }, [sseConnected]);

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
        return "bg-[color:var(--color-leaf)]";
      case "failed":
        return "bg-[color:var(--color-rose-deep)]";
      case "abandoned":
        return "bg-amber-500";
      case "running":
        return "bg-yellow-500 animate-pulse";
      case "scheduled":
      case "queued":
        return "bg-[#6cb2ff] animate-pulse";
      default:
        return "bg-[color:var(--color-ink-4)]";
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
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Jobs</h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
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
            className="rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-2 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button
            type="button"
            onClick={() => triggerJob()}
            disabled={running}
            className="flex items-center gap-1.5 rounded bg-[color:var(--color-carrot)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
          >
            {running ? "Running…" : <><IconPlay size={12} /> Run Pipeline</>}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {bucketError ? (
          <div role="alert" className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]">
            <strong>Couldn&apos;t load jobs.</strong> {loadError}
          </div>
        ) : !loaded ? (
          <div className="divide-y divide-[color:var(--color-rule-soft)] overflow-hidden rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-rule)]" />
                <span className="h-3 w-24 animate-pulse rounded bg-[color:var(--color-rule)]" />
                <span className="h-3 flex-1 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-[color:var(--color-ink-3)]">
            No jobs yet. Click &quot;Run Pipeline&quot; to start one.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th>Progress</th>
                  <th className="text-right">Started</th>
                  <th className="text-right">Duration</th>
                  <th className="w-8" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const expanded = expandedJobId === job.id;
                  const terminal =
                    job.status !== "running" &&
                    job.status !== "scheduled" &&
                    job.status !== "queued";
                  const active = job.status === "queued" || job.status === "running";
                  return (
                    <Fragment key={job.id}>
                      <tr
                        onClick={() => terminal && setExpandedJobId(expanded ? null : job.id)}
                        aria-expanded={terminal ? expanded : undefined}
                        className={terminal ? "cursor-pointer" : ""}
                      >
                        <td>
                          <code className="text-[11px]">{job.id}</code>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`h-[7px] w-[7px] rounded-full ${statusDot(job.status)}`} aria-hidden />
                            {job.status}
                          </span>
                        </td>
                        <td>
                          {job.trigger === "webhook" ? "webhook" : "manual"}
                        </td>
                        <td>
                          {job.status === "scheduled" && job.nextRunAt ? (
                            scheduledCountdown(job.nextRunAt)
                          ) : active ? (
                            progressLine(job)
                          ) : job.status === "failed" && job.error ? (
                            <span className="block max-w-[260px] truncate text-[color:var(--color-rose-deep)]" title={job.error}>
                              {job.error}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right text-[11.5px]">
                          {new Date(job.startedAt).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap text-right text-[11.5px]">
                          {job.completedAt ? formatDuration(job.startedAt, job.completedAt) : "-"}
                        </td>
                        <td className="text-[color:var(--color-ink-4)]" aria-hidden>
                          {terminal && (
                            <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={7} className="bg-[color:var(--color-surface-2)]">
                            <div className="space-y-2 text-[11px] text-[color:var(--color-ink-2)]">
                              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                                <dt className="text-[color:var(--color-ink-3)]">Job ID</dt>
                                <dd className="font-mono">{job.id}</dd>
                                <dt className="text-[color:var(--color-ink-3)]">Status</dt>
                                <dd>{job.status}</dd>
                                <dt className="text-[color:var(--color-ink-3)]">Started</dt>
                                <dd>{new Date(job.startedAt).toLocaleString()}</dd>
                                {job.completedAt && (
                                  <>
                                    <dt className="text-[color:var(--color-ink-3)]">Completed</dt>
                                    <dd>{new Date(job.completedAt).toLocaleString()}</dd>
                                  </>
                                )}
                                {job.files_processed !== undefined && (
                                  <>
                                    <dt className="text-[color:var(--color-ink-3)]">Files processed</dt>
                                    <dd>{job.files_processed}</dd>
                                  </>
                                )}
                                {job.partitions_written !== undefined && (
                                  <>
                                    <dt className="text-[color:var(--color-ink-3)]">Partitions written</dt>
                                    <dd>{job.partitions_written}</dd>
                                  </>
                                )}
                                {job.errors !== undefined && (
                                  <>
                                    <dt className="text-[color:var(--color-ink-3)]">Errors</dt>
                                    <dd>{job.errors.length}</dd>
                                  </>
                                )}
                              </dl>
                              {job.error && (
                                <div className="rounded border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] p-2 text-[11px] text-[color:var(--color-rose-deep)]">
                                  <div className="mb-0.5 font-medium">Error</div>
                                  <p className="whitespace-pre-wrap break-words font-mono">{job.error}</p>
                                </div>
                              )}
                              {job.errors && job.errors.length > 0 && (
                                <ul className="max-h-60 space-y-1 overflow-auto rounded border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-2 font-mono text-[11px] text-[color:var(--color-ink-2)]">
                                  {job.errors.map((e, i) => (
                                    <li key={i} className="border-l-2 border-[color:var(--color-rose-deep)] pl-2">
                                      {e}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!bucketError && total > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[color:var(--color-ink-3)]">
            <div className="flex items-center gap-2">
              <label htmlFor="job-page-size">Per page</label>
              <select
                id="job-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-ink-2)]"
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
                className="rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-1 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
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
                className="rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-1 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
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
