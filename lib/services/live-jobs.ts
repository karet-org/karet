// Redis-backed job enqueue + live-state reads.
//
// The write path mirrors the worker's `queue.rs` exactly: one MULTI with
// the stream XADD (single `payload` JSON field), the live hash, and the
// per-pipeline index ZADD. The worker owns every subsequent state change;
// after enqueue the web app only reads.

import type { JobProgress, JobRecord } from "@/lib/types/jobs";
import { getRedis, indexKey, liveKey, STREAM_KEY, STREAM_MAXLEN } from "./redis";

/** Message shape consumed by the worker (see worker `queue.rs::JobMessage`). */
export interface JobMessage {
  job_id: string;
  pipeline: string;
  prefix: string;
  clean_run: boolean;
  trigger: "manual" | "webhook";
  enqueued_at: number;
}

/**
 * Enqueue a job onto the stream and create its live hash + index entry,
 * atomically. Returns the initial record for the API response.
 */
export async function enqueueJob(msg: JobMessage): Promise<JobRecord> {
  const redis = await getRedis();
  await redis
    .multi()
    .xAdd(STREAM_KEY, "*", { payload: JSON.stringify(msg) }, {
      TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: STREAM_MAXLEN },
    })
    .hSet(liveKey(msg.job_id), {
      status: "queued",
      pipeline: msg.pipeline,
      trigger: msg.trigger,
      enqueued_at: msg.enqueued_at,
      clean_run: String(msg.clean_run),
    })
    .zAdd(indexKey(msg.pipeline), { score: msg.enqueued_at, value: msg.job_id })
    .exec();

  return {
    id: msg.job_id,
    pipeline: msg.pipeline,
    status: "queued",
    startedAt: new Date(msg.enqueued_at).toISOString(),
    trigger: msg.trigger,
  };
}

/** Map one live hash to a JobRecord. Returns null for empty hashes. */
export function liveHashToRecord(
  jobId: string,
  pipeline: string,
  hash: Record<string, string>,
): JobRecord | null {
  if (!hash || Object.keys(hash).length === 0) return null;
  const status = hash.status as JobRecord["status"] | undefined;
  if (!status) return null;
  const enqueuedAtMs = Number(hash.enqueued_at);
  const startedAt =
    hash.started_at ??
    (Number.isFinite(enqueuedAtMs) ? new Date(enqueuedAtMs).toISOString() : new Date(0).toISOString());
  const record: JobRecord = {
    id: jobId,
    pipeline,
    status,
    startedAt,
  };
  if (hash.trigger === "manual" || hash.trigger === "webhook") record.trigger = hash.trigger;
  if (hash.finished_at) record.completedAt = hash.finished_at;
  if (hash.error) record.error = hash.error;
  if (hash.partitions_written !== undefined) {
    record.partitions_written = Number(hash.partitions_written);
  }
  if ((status === "queued" || status === "running") && hash.stage) {
    const progress: JobProgress = { stage: hash.stage as JobProgress["stage"] };
    if (hash.files_done !== undefined) progress.files_done = Number(hash.files_done);
    if (hash.files_total !== undefined) progress.files_total = Number(hash.files_total);
    if (hash.mappings_done !== undefined) progress.mappings_done = Number(hash.mappings_done);
    if (hash.mappings_total !== undefined) progress.mappings_total = Number(hash.mappings_total);
    record.progress = progress;
  }
  return record;
}

/** Newest-first live entries for a pipeline (bounded). */
export async function listLiveJobs(pipeline: string, limit = 100): Promise<JobRecord[]> {
  const redis = await getRedis();
  // Newest first: highest enqueued_at score first.
  const ids = await redis.zRange(indexKey(pipeline), 0, limit - 1, { REV: true });
  if (ids.length === 0) return [];
  const hashes = await Promise.all(ids.map((id) => redis.hGetAll(liveKey(id))));
  const records: JobRecord[] = [];
  const expired: string[] = [];
  ids.forEach((id, i) => {
    const record = liveHashToRecord(id, pipeline, hashes[i] as Record<string, string>);
    if (record) records.push(record);
    else expired.push(id); // live hash TTL'd out; S3 history owns it now
  });
  if (expired.length > 0) {
    // Best-effort index cleanup; ignore failures.
    redis.zRem(indexKey(pipeline), expired).catch(() => {});
  }
  return records;
}

/**
 * Merge live entries over S3 history records.
 *
 * Rules: a live non-terminal entry always wins (S3 may hold a stale
 * `scheduled` shape or nothing yet). For terminal jobs the S3 record is
 * richer (full `errors`, `files_processed`), so it wins when present;
 * the live entry covers the window before the record lands — or forever,
 * if the record write failed while S3 was down.
 */
export function mergeLiveOverHistory(
  history: JobRecord[],
  live: JobRecord[],
): JobRecord[] {
  const byId = new Map<string, JobRecord>();
  for (const job of history) byId.set(job.id, job);
  for (const entry of live) {
    const terminal = entry.status === "completed" || entry.status === "failed";
    if (!terminal || !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return Array.from(byId.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
