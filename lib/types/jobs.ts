/**
 * Job record persisted to S3 under `pipelines/<pipeline>/jobs/<id>.json`.
 * Written once when the job is triggered (`status: "running"`) and again
 * when the background worker fetch completes with either `"completed"` or
 * `"failed"`. Read by the jobs-history GET endpoint.
 */
export interface JobRecord {
  id: string;
  pipeline: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
  errors?: string[];
  partitions_written?: number;
  files_processed?: number;
}
