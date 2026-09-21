// Enqueue-only job start: the web app writes onto the Redis stream and returns;
// the worker fleet owns claiming, locking, progress, retries and the S3 record.

import { loadS3Config } from "@/lib/config/s3-client";
import { newId } from "@/lib/config/id";
import { enqueueJob } from "@/lib/services/live-jobs";
import type { JobRecord } from "@/lib/types/jobs";
import { getLiveConfig } from "@/lib/services/pipeline-store";
import { insertQueued } from "@/lib/services/job-store";

export interface StartJobOptions {
  pipeline: string;
  cleanRun: boolean;
  /** Free-form tag stored on the job record so the UI can distinguish auto-runs. */
  trigger?: "manual" | "webhook";
}

/** Enqueue a job for the worker fleet and return its initial (queued) record. */
export async function startJob(opts: StartJobOptions): Promise<JobRecord> {
  const config = loadS3Config();
  const jobId = newId("job");
  const enqueuedAt = Date.now();

  // Pin the run to the config that is live right now. If someone saves while it
  // is queued, this run still uses what the operator saw when they started it,
  // and the job row records which version that was.
  const live = await getLiveConfig(opts.pipeline);

  await insertQueued({
    id: jobId,
    pipeline: opts.pipeline,
    configVersionId: live?.id ?? null,
    trigger: opts.trigger ?? "manual",
    enqueuedAt,
  });

  return enqueueJob({
    job_id: jobId,
    pipeline: opts.pipeline,
    prefix: `${config.pipelinesPrefix}${opts.pipeline}/`,
    config_version_id: live?.id ?? null,
    clean_run: opts.cleanRun,
    trigger: opts.trigger ?? "manual",
    enqueued_at: enqueuedAt,
  });
}
