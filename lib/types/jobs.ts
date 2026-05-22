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
  status: "scheduled" | "running" | "completed" | "failed";
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
  /** How the run was started -- manual button click vs. RustFS upload webhook. */
  trigger?: "manual" | "webhook";
}
