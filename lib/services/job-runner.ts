// Shared "start a pipeline job" implementation, used by both the manual
// `POST /api/p/[pipeline]/jobs` route and the RustFS webhook receiver.
//
// Lifecycle:
//   - Webhook flow: `scheduleJob()` writes a `scheduled` record while the
//     debouncer waits for more uploads. Each subsequent event extends the
//     wait via `updateScheduledAt()`. When the timer fires, `startJob()`
//     adopts the same ID and overwrites the record with `running`.
//   - Manual flow: `startJob()` is called directly with a fresh ID.
//
// Either way the worker call runs in the background. The Node runtime
// keeps the unresolved promise alive past the HTTP response so the
// terminal status write lands.

import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import type { JobRecord } from "@/lib/types/jobs";

export interface StartJobOptions {
  pipeline: string;
  cleanRun: boolean;
  /** Free-form tag stored on the job record so the UI can distinguish auto-runs. */
  trigger?: "manual" | "webhook";
  /**
   * If set, the new `running` record reuses this ID (and S3 key), so a
   * `scheduled` record written earlier transitions in place rather than
   * leaving a stale row behind. The debouncer uses this for promotion.
   */
  existingJobId?: string;
}

function jobsPrefix(pipelinesPrefix: string, pipeline: string): string {
  return `${pipelinesPrefix}${pipeline}/jobs/`;
}

function newJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Write a `scheduled` job record. Used by the webhook debouncer to give
 * the UI a placeholder row for the duration of the quiet wait. Returns
 * the new ID so the caller can promote it later via `startJob`.
 */
export async function scheduleJob(args: {
  pipeline: string;
  trigger: "webhook";
  fireAt: Date;
}): Promise<string> {
  const config = loadS3Config();
  const client = createS3Client(config);

  const id = newJobId();
  const key = `${jobsPrefix(config.pipelinesPrefix, args.pipeline)}${id}.json`;
  const record: JobRecord = {
    id,
    pipeline: args.pipeline,
    status: "scheduled",
    startedAt: new Date().toISOString(),
    nextRunAt: args.fireAt.toISOString(),
    trigger: args.trigger,
  };

  await client.send(
    new PutObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: key,
      Body: JSON.stringify(record),
      ContentType: "application/json",
    }),
  );

  return id;
}

/**
 * Update the `nextRunAt` timestamp on an existing `scheduled` record.
 * The debouncer calls this every time an additional upload event resets
 * the quiet timer so the UI countdown stays accurate.
 */
export async function updateScheduledAt(args: {
  pipeline: string;
  jobId: string;
  fireAt: Date;
  trigger: "webhook";
}): Promise<void> {
  const config = loadS3Config();
  const client = createS3Client(config);
  const key = `${jobsPrefix(config.pipelinesPrefix, args.pipeline)}${args.jobId}.json`;

  // Re-write the entire record. We don't read first because the
  // debouncer is the only writer of the `scheduled` row, we know its
  // shape exactly, and a blind PUT is one fewer S3 round trip.
  const record: JobRecord = {
    id: args.jobId,
    pipeline: args.pipeline,
    status: "scheduled",
    startedAt: new Date().toISOString(),
    nextRunAt: args.fireAt.toISOString(),
    trigger: args.trigger,
  };

  await client.send(
    new PutObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: key,
      Body: JSON.stringify(record),
      ContentType: "application/json",
    }),
  );
}

/**
 * Persist the initial `running` job record and kick off the worker call in
 * the background. Returns the initial record once the synchronous write
 * lands, so callers can echo it back to the client.
 *
 * Pass `existingJobId` to promote a previously-written `scheduled` record
 * to `running` in place; otherwise a fresh ID is generated.
 */
export async function startJob(opts: StartJobOptions): Promise<JobRecord> {
  const config = loadS3Config();
  const client = createS3Client(config);

  const id = opts.existingJobId ?? newJobId();
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
      Bucket: config.pipelinesBucket,
      Key: key,
      Body: JSON.stringify(initialJob),
      ContentType: "application/json",
    }),
  );

  void runPipelineInBackground({
    client,
    bucket: config.pipelinesBucket,
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

/** Body the worker returns on a successful `POST /jobs/run`. */
interface WorkerSuccessBody {
  partitions_written?: number;
  files_processed?: number;
  errors?: string[];
}

/** Envelope the worker returns on a 4xx/5xx `POST /jobs/run`. */
interface WorkerErrorBody {
  error?: { kind?: string; message?: string; details?: string[] };
}

/** The subset of a {@link JobRecord} produced once a run reaches a terminal state. */
export type TerminalJobFields = Pick<
  JobRecord,
  "status" | "error" | "errors" | "partitions_written" | "files_processed"
>;

/**
 * Translate a worker `/jobs/run` HTTP response into the terminal fields of a
 * job record.
 *
 * A non-2xx response is treated as a genuine failure and the worker's error
 * (`{ error: { kind, message } }`) is surfaced. This is the fix for jobs that
 * used to be marked "completed" regardless of status: a worker that could not,
 * say, reach S3 returns HTTP 400, which was previously swallowed and stored as
 * a success with no `files_processed`/`partitions_written`.
 *
 * On a 2xx response, per-file `errors` reported by the worker are still summarised
 * onto the (completed) record, matching the worker's partial-failure semantics.
 */
export function interpretWorkerResponse(
  ok: boolean,
  status: number,
  statusText: string,
  body: unknown,
): TerminalJobFields {
  if (!ok) {
    const workerError = (body as WorkerErrorBody | null)?.error;
    const kind = workerError?.kind ? `${workerError.kind}: ` : "";
    const detail =
      workerError?.message ?? (typeof body === "string" && body.length > 0 ? body : "");
    const suffix = detail || statusText || "no response body";
    return { status: "failed", error: `worker returned HTTP ${status}: ${kind}${suffix}` };
  }

  const result = (body ?? {}) as WorkerSuccessBody;
  const fields: TerminalJobFields = { status: "completed" };
  if (result.errors && result.errors.length > 0) {
    fields.error = `${result.partitions_written ?? 0} partitions written, ${result.errors.length} error(s): ${result.errors[0]}`;
    fields.errors = result.errors;
  }
  if (result.partitions_written !== undefined) {
    fields.partitions_written = result.partitions_written;
  }
  if (result.files_processed !== undefined) {
    fields.files_processed = result.files_processed;
  }
  return fields;
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
      headers: {
        "Content-Type": "application/json",
        // The worker requires this shared token on every mutating route.
        Authorization: `Bearer ${process.env.KARET_WORKER_TOKEN ?? ""}`,
      },
      body: JSON.stringify({ pipeline_prefix: pipelinePrefix, clean_run: cleanRun }),
      // 30-minute ceiling, well above any realistic pipeline. The
      // jobs-list reconciler still marks anything stuck > 10 min as
      // abandoned, so this is just a last-resort bound.
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    // Parse defensively: the worker returns a JSON body for both success and
    // error, but a proxy/timeout could yield an empty or non-JSON body.
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    job.completedAt = new Date().toISOString();
    // Trust the HTTP status: a non-2xx response is a real failure, not a
    // silent success. Previously `status` was set to "completed"
    // unconditionally, so a worker error (e.g. it could not reach S3) was
    // recorded as a job that "succeeded" but wrote nothing.
    Object.assign(job, interpretWorkerResponse(res.ok, res.status, res.statusText, body));
  } catch (err) {
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    // Surface the errno code (ECONNREFUSED, ENOTFOUND, ...) that Node tucks
    // away on the error's `cause`, so a bare "fetch failed" becomes
    // actionable.
    const code = (err as { cause?: { code?: unknown } })?.cause?.code;
    job.error = code ? `${message} (${code})` : message;
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
