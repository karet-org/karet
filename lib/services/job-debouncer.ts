// Debounces "kick off a pipeline run" requests for a given slug so a batch
// upload (e.g. 12 monthly CSVs in a row) coalesces into a single job.
//
// Trailing debounce + max wait:
//   - Each event resets a 5s "quiet timer". When it fires, we run the job.
//   - If events keep arriving past 30s from the first one in the batch,
//     fire anyway so a slow drip doesn't defer the run forever.
//
// On the first event we write a `scheduled` job record to S3 so the UI
// has a row to render through the wait. Each subsequent event refreshes
// `nextRunAt` on that record. When the quiet/max timer fires, we promote
// the record to `running` (same ID, same key) by passing `existingJobId`
// to `startJob`.
//
// State lives in module scope. Single-replica deployment only, if you
// scale `web` horizontally, two replicas could each schedule a run for the
// same slug. Move this to a shared lock (Redis, Postgres advisory lock,
// etc.) only if/when that happens.

import { scheduleJob, startJob, updateScheduledAt } from "./job-runner";

const QUIET_MS = 5_000;
const MAX_WAIT_MS = 30_000;

interface PendingRun {
  /** ID of the `scheduled` job record in S3, reused on promotion. */
  jobId: string;
  /** Trailing-debounce timer. Cleared and re-set on every event. */
  quietTimer: NodeJS.Timeout;
  /** Hard deadline. Set once when the batch starts, never extended. */
  maxTimer: NodeJS.Timeout;
}

const pending = new Map<string, PendingRun>();

function fireNow(slug: string): void {
  const entry = pending.get(slug);
  if (!entry) return;
  clearTimeout(entry.quietTimer);
  clearTimeout(entry.maxTimer);
  pending.delete(slug);
  // Auto-runs are not "clean" by default, only fresh partitions for
  // CSVs we've seen. The user can still manually trigger a clean run.
  // Reuse the existing job ID so the `scheduled` row in S3 transitions
  // to `running` in place rather than leaving a stale entry behind.
  startJob({
    pipeline: slug,
    cleanRun: false,
    trigger: "webhook",
    existingJobId: entry.jobId,
  }).catch((err) => {
    console.error(`startJob (debounced) failed for ${slug}:`, err);
  });
}

/**
 * Record an upload event for `slug`. Schedules a pipeline run after
 * `QUIET_MS` of inactivity, or `MAX_WAIT_MS` since the first event in this
 * batch, whichever is sooner. Returns the time (ms) until the run will
 * fire, useful for logging.
 */
export function scheduleRun(slug: string): number {
  const existing = pending.get(slug);
  const fireAt = new Date(Date.now() + QUIET_MS);

  if (existing) {
    clearTimeout(existing.quietTimer);
    existing.quietTimer = setTimeout(() => fireNow(slug), QUIET_MS);
    // Refresh the record so the UI countdown stays accurate. Fire and
    // forget, the in-memory timer is the source of truth for *when*
    // the job runs; the S3 write is purely for visibility.
    updateScheduledAt({
      pipeline: slug,
      jobId: existing.jobId,
      fireAt,
      trigger: "webhook",
    }).catch((err) => {
      console.error(`updateScheduledAt failed for ${slug}:`, err);
    });
    return QUIET_MS;
  }

  const quietTimer = setTimeout(() => fireNow(slug), QUIET_MS);
  const maxTimer = setTimeout(() => fireNow(slug), MAX_WAIT_MS);
  // Reserve the slot synchronously with a placeholder ID so a flurry of
  // events arriving before `scheduleJob` resolves all go to the same
  // entry. The ID is overwritten once the S3 write completes.
  const placeholderId = `pending-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  pending.set(slug, { jobId: placeholderId, quietTimer, maxTimer });

  scheduleJob({ pipeline: slug, trigger: "webhook", fireAt })
    .then((id) => {
      const entry = pending.get(slug);
      if (entry && entry.jobId === placeholderId) entry.jobId = id;
    })
    .catch((err) => {
      console.error(`scheduleJob failed for ${slug}:`, err);
    });

  return QUIET_MS;
}
