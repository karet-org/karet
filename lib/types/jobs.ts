/**
 * Job record persisted to S3 under `pipelines/<pipeline>/jobs/<id>.json`.
 *
 * Lifecycle: optionally `scheduled` (webhook-triggered runs are debounced,
 * so the record exists during the wait), then `running`, then terminal
 * (`completed` or `failed`). Same ID and same S3 key throughout, so the
 * row in the UI visibly transitions through states.
 *
 * Read by the jobs-history GET endpoint.
 */
export interface JobRecord {
  id: string;
  pipeline: string;
  status: "scheduled" | "queued" | "running" | "completed" | "failed";
  startedAt: string;
  /**
   * When `status === "scheduled"`, the wall-clock time at which the run
   * is currently planned to fire. Updated each time another upload resets
   * the debounce timer. Absent in other states.
   */
  nextRunAt?: string;
  completedAt?: string;
  error?: string;
  errors?: string[];
  partitions_written?: number;
  files_processed?: number;
  /** How the run was started, manual button click vs. RustFS upload webhook. */
  trigger?: "manual" | "webhook";
  /**
   * Live progress (Redis-backed jobs only, while queued/running): which
   * stage the worker is in and how far along. Absent on terminal records.
   */
  progress?: JobProgress;
}

/** Live progress fields mirrored from the worker's `karet:jobs:live:<id>` hash. */
export interface JobProgress {
  stage: "downloading" | "ingesting";
  files_done?: number;
  files_total?: number;
  mappings_done?: number;
  mappings_total?: number;
}
