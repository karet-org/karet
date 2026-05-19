// Shared "start a pipeline job" implementation, used by both the manual
// `POST /api/p/[pipeline]/jobs` route and the RustFS webhook receiver.
//
// Writes a `running` job record to S3, returns it immediately, and runs
// the worker call in the background. The Node runtime keeps the unresolved
// promise alive past the HTTP response so the terminal status write lands.

import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import type { JobRecord } from "@/lib/types/jobs";

export interface StartJobOptions {
  pipeline: string;
  cleanRun: boolean;
  /** Free-form tag stored on the job record so the UI can distinguish auto-runs. */
  trigger?: "manual" | "webhook";
}

function jobsPrefix(pipelinesPrefix: string, pipeline: string): string {
  return `${pipelinesPrefix}${pipeline}/jobs/`;
}

/**
 * Persist the initial `running` job record and kick off the worker call in
 * the background. Returns the initial record once the synchronous write
 * lands, so callers can echo it back to the client.
 */
export async function startJob(
  opts: StartJobOptions,
): Promise<JobRecord> {
  const config = loadS3Config();
  const client = createS3Client(config);

  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const key = `${jobsPrefix(config.pipelinesPrefix, opts.pipeline)}${id}.json`;

  const initialJob: JobRecord = {
    id,
    pipeline: opts.pipeline,
    status: "running",
    startedAt,
    ...(opts.trigger ? { trigger: opts.trigger } : {}),
  };

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: JSON.stringify(initialJob),
      ContentType: "application/json",
    }),
  );

  void runPipelineInBackground({
    client,
    bucket: config.bucket,
    pipelinesPrefix: config.pipelinesPrefix,
    key,
    pipeline: opts.pipeline,
    cleanRun: opts.cleanRun,
    startedAt,
    id,
    trigger: opts.trigger,
  });

  return initialJob;
}

interface BackgroundJobArgs {
  client: S3Client;
  bucket: string;
  pipelinesPrefix: string;
  key: string;
  pipeline: string;
  cleanRun: boolean;
  startedAt: string;
  id: string;
  trigger?: "manual" | "webhook";
}

async function runPipelineInBackground(args: BackgroundJobArgs): Promise<void> {
  const { client, bucket, pipelinesPrefix, key, pipeline, cleanRun, startedAt, id, trigger } = args;

  const job: JobRecord = {
    id,
    pipeline,
    status: "running",
    startedAt,
    ...(trigger ? { trigger } : {}),
  };

  try {
    const workerUrl = process.env.WORKER_URL ?? "http://worker:8080";
    const pipelinePrefix = `${pipelinesPrefix}${pipeline}/`;
    const res = await fetch(`${workerUrl}/jobs/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_prefix: pipelinePrefix, clean_run: cleanRun }),
      // 30-minute ceiling — well above any realistic pipeline. The
      // jobs-list reconciler still marks anything stuck > 10 min as
      // abandoned, so this is just a last-resort bound.
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    const result = await res.json();

    job.completedAt = new Date().toISOString();
    job.status = "completed";
    if (result.errors && result.errors.length > 0) {
      job.error = `${result.partitions_written ?? 0} partitions written, ${result.errors.length} error(s): ${result.errors[0]}`;
      (job as unknown as Record<string, unknown>).errors = result.errors;
    }
    if (result.partitions_written !== undefined) {
      (job as unknown as Record<string, unknown>).partitions_written = result.partitions_written;
    }
    if (result.files_processed !== undefined) {
      (job as unknown as Record<string, unknown>).files_processed = result.files_processed;
    }
  } catch (err) {
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.error = err instanceof Error ? err.message : String(err);
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(job),
        ContentType: "application/json",
      }),
    );
  } catch (err) {
    console.error(`Failed to write final job status for ${id}:`, err);
  }
}
