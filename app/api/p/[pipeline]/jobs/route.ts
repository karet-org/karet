import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";
import type { JobRecord } from "@/lib/types/jobs";

function jobsPrefix(pipeline: string): string {
  return `${loadS3Config().pipelinesPrefix}${pipeline}/jobs/`;
}

/**
 * A `running` job older than this is treated as abandoned (e.g. the web
 * container restarted mid-fetch). Surfaced as `failed` so the UI doesn't
 * spin forever.
 */
const ORPHAN_JOB_TIMEOUT_MS = 10 * 60 * 1000;

function reconcileOrphans(jobs: JobRecord[]): JobRecord[] {
  const cutoff = Date.now() - ORPHAN_JOB_TIMEOUT_MS;
  return jobs.map((job) => {
    if (job.status !== "running") return job;
    if (Date.parse(job.startedAt) > cutoff) return job;
    return {
      ...job,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: `job abandoned (stuck in running for > ${ORPHAN_JOB_TIMEOUT_MS / 60000} min)`,
    };
  });
}

async function fetchJobRecord(
  client: ReturnType<typeof createS3Client>,
  bucket: string,
  key: string,
): Promise<JobRecord | null> {
  try {
    const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buffer = await readBodyToBuffer(r.Body);
    return JSON.parse(buffer.toString("utf-8")) as JobRecord;
  } catch {
    return null;
  }
}

/** GET — list job history. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const client = createS3Client(base);
  const prefix = jobsPrefix(pipeline);

  return wrapS3Error(async () => {
    const allKeys = await listAllObjectKeys(client, base.bucket, prefix);
    const keys = allKeys.filter((k) => k.endsWith(".json"));
    const results = await Promise.all(
      keys.map((key) => fetchJobRecord(client, base.bucket, key)),
    );
    const jobs = results.filter((j): j is JobRecord => j !== null);
    const reconciled = reconcileOrphans(jobs);
    reconciled.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return NextResponse.json({ jobs: reconciled });
  }, `GET /api/p/${pipeline}/jobs`);
}

/**
 * POST — trigger a new job. Returns immediately with the initial
 * `running` record; the pipeline runs in the background of this Node
 * process. Poll GET `/jobs` to watch the status transition to
 * `completed` | `failed`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const client = createS3Client(base);

  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const key = `${jobsPrefix(pipeline)}${id}.json`;
  const url = new URL(request.url);
  const cleanRun = url.searchParams.get("clean") === "true";

  const initialJob: JobRecord = { id, pipeline, status: "running", startedAt };

  // Persist the "running" record synchronously so GET sees it immediately
  // after this handler returns.
  await client.send(
    new PutObjectCommand({
      Bucket: base.bucket,
      Key: key,
      Body: JSON.stringify(initialJob),
      ContentType: "application/json",
    }),
  );

  // Fire-and-forget. The Node runtime keeps the promise alive past the
  // HTTP response, so the final status write still lands. Errors are
  // caught inside so nothing escapes as an unhandled rejection.
  void runPipelineInBackground({
    client,
    bucket: base.bucket,
    pipelinesPrefix: base.pipelinesPrefix,
    key,
    pipeline,
    cleanRun,
    startedAt,
    id,
  });

  return NextResponse.json({ job: initialJob });
}

interface BackgroundJobArgs {
  client: ReturnType<typeof createS3Client>;
  bucket: string;
  pipelinesPrefix: string;
  key: string;
  pipeline: string;
  cleanRun: boolean;
  startedAt: string;
  id: string;
}

async function runPipelineInBackground(args: BackgroundJobArgs): Promise<void> {
  const { client, bucket, pipelinesPrefix, key, pipeline, cleanRun, startedAt, id } = args;

  const job: JobRecord = { id, pipeline, status: "running", startedAt };

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
