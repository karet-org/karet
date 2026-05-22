import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";
import { startJob } from "@/lib/services/job-runner";
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

/**
 * A `scheduled` job whose `nextRunAt` is this far past the wall clock is
 * treated as orphaned. Happens when the web container restarts during
 * the debounce window: the in-memory timer is gone but the S3 record
 * remains. Generous compared to the 30s max debounce so we don't race
 * a real promotion.
 */
const ORPHAN_SCHEDULED_TIMEOUT_MS = 2 * 60 * 1000;

function reconcileOrphans(jobs: JobRecord[]): JobRecord[] {
  const now = Date.now();
  const runningCutoff = now - ORPHAN_JOB_TIMEOUT_MS;
  const scheduledCutoff = now - ORPHAN_SCHEDULED_TIMEOUT_MS;
  return jobs.map((job) => {
    if (job.status === "running") {
      if (Date.parse(job.startedAt) > runningCutoff) return job;
      return {
        ...job,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: `job abandoned (stuck in running for > ${ORPHAN_JOB_TIMEOUT_MS / 60000} min)`,
      };
    }
    if (job.status === "scheduled") {
      const target = job.nextRunAt ? Date.parse(job.nextRunAt) : Date.parse(job.startedAt);
      if (target > scheduledCutoff) return job;
      return {
        ...job,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: "scheduled run never fired (web container likely restarted during debounce)",
      };
    }
    return job;
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

/** GET -- list job history. */
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
 * POST -- trigger a new job. Returns immediately with the initial
 * `running` record; the pipeline runs in the background of this Node
 * process. Poll GET `/jobs` to watch the status transition to
 * `completed` | `failed`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const url = new URL(request.url);
  const cleanRun = url.searchParams.get("clean") === "true";
  const job = await startJob({ pipeline, cleanRun, trigger: "manual" });
  return NextResponse.json({ job });
}
