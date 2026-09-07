/**
 * Job record at `pipelines/<pipeline>/jobs/<id>.json`. One record keeps its id
 * and key across `scheduled` (debounced webhook runs) → `running` → terminal.
 */
export interface JobRecord {
  id: string;
  pipeline: string;
  status: "scheduled" | "queued" | "running" | "completed" | "failed" | "abandoned";
  startedAt: string;
  /** When `scheduled`, the planned fire time; reset by each new upload. */
  nextRunAt?: string;
  completedAt?: string;
  error?: string;
  errors?: string[];
  partitions_written?: number;
  files_processed?: number;
  /** How the run started: manual button click vs. RustFS upload webhook. */
  trigger?: "manual" | "webhook";
  /** Live progress; Redis-backed jobs only, absent on terminal records. */
  progress?: JobProgress;
}

/** Progress fields mirrored from the worker's `karet:jobs:live:<id>` hash. */
export interface JobProgress {
  stage: "downloading" | "ingesting";
  files_done?: number;
  files_total?: number;
  mappings_done?: number;
  mappings_total?: number;
}
