// Debounces "kick off a pipeline run" requests for a given slug so a batch
// upload (e.g. 12 monthly CSVs in a row) coalesces into a single job.
//
// Trailing debounce + max wait:
//   - Each event resets a 5s "quiet timer". When it fires, we run the job.
//   - If events keep arriving past 30s from the first one in the batch,
//     fire anyway so a slow drip doesn't defer the run forever.
//
// State lives in module scope. Single-replica deployment only — if you
// scale `web` horizontally, two replicas could each schedule a run for the
// same slug. Move this to a shared lock (Redis, Postgres advisory lock,
// etc.) only if/when that happens.

import { startJob } from "./job-runner";

const QUIET_MS = 5_000;
const MAX_WAIT_MS = 30_000;

interface PendingRun {
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
  // Auto-runs are not "clean" by default — only fresh partitions for
  // CSVs we've seen. The user can still manually trigger a clean run.
  startJob({ pipeline: slug, cleanRun: false, trigger: "webhook" }).catch((err) => {
    console.error(`startJob (debounced) failed for ${slug}:`, err);
  });
}

/**
 * Record an upload event for `slug`. Schedules a pipeline run after
 * `QUIET_MS` of inactivity, or `MAX_WAIT_MS` since the first event in this
 * batch — whichever is sooner. Returns the time (ms) until the run will
 * fire, useful for logging.
 */
export function scheduleRun(slug: string): number {
  const existing = pending.get(slug);
  if (existing) {
    clearTimeout(existing.quietTimer);
    existing.quietTimer = setTimeout(() => fireNow(slug), QUIET_MS);
    return QUIET_MS;
  }
  const quietTimer = setTimeout(() => fireNow(slug), QUIET_MS);
  const maxTimer = setTimeout(() => fireNow(slug), MAX_WAIT_MS);
  pending.set(slug, { quietTimer, maxTimer });
  return QUIET_MS;
}

/** Test/admin helper — drop any in-flight debounce state. */
export function clearAllPending(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.quietTimer);
    clearTimeout(entry.maxTimer);
  }
  pending.clear();
}
