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
  const [bucketError, setBucketError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch(`/api/p/${pipeline}/jobs`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (body.error === "bucket_not_found") setBucketError(body.message);
        return;
      }
      const d = await r.json();
      setJobs(d.jobs ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [pipeline]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Adaptive polling: 2s while a run is scheduled or running so the
  // countdown stays live and the row transitions are caught quickly,
  // 15s otherwise.
  useEffect(() => {
    const anyActive = jobs.some(
      (j) => j.status === "running" || j.status === "scheduled",
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
      loadJobs();
    } finally {
      triggerInFlight.current = false;
      setRunning(false);
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "failed":
        return "bg-red-100 text-red-700";
      case "running":
        return "bg-yellow-100 text-yellow-700";
      case "scheduled":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

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
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            No jobs yet. Click &quot;Run Pipeline&quot; to start one.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const expanded = expandedJobId === job.id;
              return (
                <div
                  key={job.id}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-gray-600">{job.id}</code>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(job.status)}`}
                        >
                          {job.status}
                        </span>
                        {job.trigger === "webhook" && (
                          <span
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                            title="Auto-triggered by an upload to S3"
                          >
                            auto
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {job.status === "scheduled" && job.nextRunAt ? (
                          <>
                            Queued: {new Date(job.startedAt).toLocaleString()}
                            <> · {scheduledCountdown(job.nextRunAt)}</>
                          </>
                        ) : (
                          <>
                            Started: {new Date(job.startedAt).toLocaleString()}
                            {job.completedAt && (
                              <> · Completed: {new Date(job.completedAt).toLocaleString()}</>
                            )}
                          </>
                        )}
                      </div>
                      {(job.partitions_written !== undefined || job.files_processed !== undefined) && (
                        <div className="mt-1 text-xs text-gray-500">
                          {job.files_processed !== undefined && <>{job.files_processed} file(s) · </>}
                          {job.partitions_written !== undefined && <>{job.partitions_written} partition(s) written</>}
                        </div>
                      )}
                      {job.error && (
                        <p className="mt-1 truncate text-xs text-red-500" title={job.error}>
                          {job.error}
                        </p>
                      )}
                    </div>
                    {job.status !== "running" && job.status !== "scheduled" && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedJobId(expanded ? null : job.id)
                        }
                        className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                      >
                        {expanded ? "Hide" : "Details"}
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <div className="mt-2 space-y-2 rounded bg-gray-50 p-2 text-[11px] text-gray-700">
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
      </div>
    </main>
  );
}
