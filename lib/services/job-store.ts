// Job history, in Postgres.
//
// The worker writes these rows; the web reads them. Before this, each run was a
// JSON object under `pipelines/<slug>/jobs/`, listed lexicographically and
// fetched one GET at a time — prod had 1,594 of them, so a page of history cost
// 25 round trips and "how often did runs fail last month" meant reading all of
// them. Now it is a query.
//
// Node runtime only.

import { query, queryOne } from "@/lib/db";

export interface JobRow {
  id: string;
  pipeline: string;
  configVersion: number | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  trigger: string;
  attempts: number;
  worker: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  filesProcessed: number | null;
  partitionsWritten: number | null;
  rowsDeduped: number | null;
  error: string | null;
}

interface RawJobRow {
  id: string;
  pipeline: string;
  config_version: number | null;
  status: JobRow["status"];
  trigger: string;
  attempts: number;
  worker: string | null;
  enqueued_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  files_processed: number | null;
  partitions_written: number | null;
  rows_deduped: number | null;
  error: string | null;
}

const SELECT = `
  SELECT j.id, j.pipeline, v.version AS config_version, j.status, j.trigger, j.attempts,
         j.worker, j.enqueued_at, j.started_at, j.completed_at,
         j.files_processed, j.partitions_written, j.rows_deduped, j.error
    FROM jobs j
    LEFT JOIN config_versions v ON v.id = j.config_version_id`;

function toJob(r: RawJobRow): JobRow {
  return {
    id: r.id,
    pipeline: r.pipeline,
    configVersion: r.config_version,
    status: r.status,
    trigger: r.trigger,
    attempts: r.attempts,
    worker: r.worker,
    enqueuedAt: r.enqueued_at.toISOString(),
    startedAt: r.started_at?.toISOString() ?? null,
    completedAt: r.completed_at?.toISOString() ?? null,
    filesProcessed: r.files_processed,
    partitionsWritten: r.partitions_written,
    rowsDeduped: r.rows_deduped,
    error: r.error,
  };
}

export interface ListJobsOptions {
  pipeline: string;
  limit?: number;
  /** Keyset pagination: rows enqueued strictly before this timestamp. */
  before?: string;
  status?: JobRow["status"];
}

/**
 * A pipeline's runs, newest first.
 *
 * Paged by `enqueued_at` rather than an offset, so page two stays correct while
 * new runs arrive — which they do, every ten minutes on the traffic pipeline.
 */
export async function listJobs(options: ListJobsOptions): Promise<JobRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const conditions = ["j.pipeline = $1"];
  const values: unknown[] = [options.pipeline];

  if (options.before) {
    values.push(options.before);
    conditions.push(`j.enqueued_at < $${values.length}`);
  }
  if (options.status) {
    values.push(options.status);
    conditions.push(`j.status = $${values.length}`);
  }
  values.push(limit);

  const rows = await query<RawJobRow>(
    `${SELECT} WHERE ${conditions.join(" AND ")}
      ORDER BY j.enqueued_at DESC
      LIMIT $${values.length}`,
    values,
  );
  return rows.map(toJob);
}

/**
 * The newest finished run, for the pipeline cards.
 *
 * Only terminal runs count: a queued or running job would make a card flicker
 * mid-debounce, so the previous outcome stands until a new one lands.
 */
export async function latestTerminalJob(pipeline: string): Promise<JobRow | null> {
  const row = await queryOne<RawJobRow>(
    `${SELECT} WHERE j.pipeline = $1 AND j.status IN ('completed', 'failed', 'cancelled')
      ORDER BY j.enqueued_at DESC LIMIT 1`,
    [pipeline],
  );
  return row ? toJob(row) : null;
}

/**
 * Record a run as queued, before it reaches the queue.
 *
 * The worker also does this for runs it enqueues itself; both are idempotent on
 * job id, so whichever gets there first wins and the other is a no-op.
 */
export async function insertQueued(job: {
  id: string;
  pipeline: string;
  configVersionId: number | null;
  trigger: string;
  enqueuedAt: number;
}): Promise<void> {
  await query(
    `INSERT INTO jobs (id, pipeline, config_version_id, status, trigger, enqueued_at)
     VALUES ($1, $2, $3, 'queued', $4, to_timestamp($5::double precision / 1000))
     ON CONFLICT (id) DO NOTHING`,
    [job.id, job.pipeline, job.configVersionId, job.trigger, job.enqueuedAt],
  );
}
