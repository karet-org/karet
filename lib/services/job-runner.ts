// Enqueue-only job start: the web app writes onto the Redis stream and returns;
// the worker fleet owns claiming, locking, progress, retries and the S3 record.

import { loadS3Config } from "@/lib/config/s3-client";
import { newId } from "@/lib/config/id";
import { enqueueJob } from "@/lib/services/live-jobs";
import type { JobRecord } from "@/lib/types/jobs";

export interface StartJobOptions {
  pipeline: string;
  cleanRun: boolean;
  /** Free-form tag stored on the job record so the UI can distinguish auto-runs. */
  trigger?: "manual" | "webhook";
}

/** Enqueue a job for the worker fleet and return its initial (queued) record. */
export async function startJob(opts: StartJobOptions): Promise<JobRecord> {
  const config = loadS3Config();
  return enqueueJob({
    job_id: newId("job"),
    pipeline: opts.pipeline,
    prefix: `${config.pipelinesPrefix}${opts.pipeline}/`,
    clean_run: opts.cleanRun,
    trigger: opts.trigger ?? "manual",
    enqueued_at: Date.now(),
  });
}
