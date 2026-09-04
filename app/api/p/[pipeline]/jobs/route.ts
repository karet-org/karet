import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";
import { startJob } from "@/lib/services/job-runner";
import { listLiveJobs, mergeLiveOverHistory } from "@/lib/services/live-jobs";
import type { JobRecord } from "@/lib/types/jobs";

function jobsPrefix(pipeline: string): string {
  return `${loadS3Config().pipelinesPrefix}${pipeline}/jobs/`;
}

// Job keys sort lexicographically newest-first; we fetch only one page's
// records, bounding the S3 fan-out regardless of total history.
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

/** GET, list job history (paginated, newest first). */
export async function GET(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const client = createS3Client(base);
  const prefix = jobsPrefix(pipeline);

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );

  return wrapS3Error(async () => {
    const allKeys = await listAllObjectKeys(client, base.pipelinesBucket, prefix);
    // Newest first; paginate over the key list so we only fetch the page's
    // records, not the entire history.
    const sorted = allKeys
      .filter((k) => k.endsWith(".json"))
      .sort((a, b) => b.localeCompare(a));
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const pageKeys = sorted.slice(start, start + pageSize);

    const results = await Promise.all(
      pageKeys.map((key) => fetchJobRecord(client, base.pipelinesBucket, key)),
    );
    const jobs = results.filter((j): j is JobRecord => j !== null);

    // Redis holds the live truth (queued/running + progress); merge it
    // over the S3 history page. Live entries surface on page 1 only —
    // deeper pages are pure history. Staleness (crashed workers, retries)
    // is the worker cluster's job, so no reconciliation happens here.
    let merged = jobs;
    if (page === 1) {
      try {
        merged = mergeLiveOverHistory(jobs, await listLiveJobs(pipeline));
      } catch (err) {
        // Redis briefly down must not take the history listing with it.
        console.error(`live-jobs merge failed for ${pipeline}:`, err);
      }
    }
    merged.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return NextResponse.json({
      jobs: merged,
      total: Math.max(total, merged.length),
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(Math.max(total, merged.length) / pageSize)),
    });
  }, `GET /api/p/${pipeline}/jobs`);
}

/**
 * POST, trigger a new job. Returns immediately with the initial
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
