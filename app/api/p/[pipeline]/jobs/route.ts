import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listAllObjects, readBodyToBuffer } from "@/lib/services/s3-helpers";
import { startJob } from "@/lib/services/job-runner";
import { listLiveJobs, orderedJobIds, pickJobRecord } from "@/lib/services/live-jobs";
import type { JobRecord } from "@/lib/types/jobs";

function jobsPrefix(pipeline: string): string {
  return `${loadS3Config().pipelinesPrefix}${pipeline}/jobs/`;
}

// Job keys sort lexicographically newest-first, so fetching one page's
// records bounds the S3 fan-out regardless of total history.
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

/** Paginated job history, newest first. */
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
    const listed = await listAllObjects(client, base.pipelinesBucket, prefix);
    const historyById = new Map(
      listed
        .filter((o) => o.key.endsWith(".json"))
        .map((o) => [o.key.slice(prefix.length, -".json".length), o] as const),
    );

    // Redis briefly down degrades to history-only rather than failing.
    let live: JobRecord[] = [];
    try {
      live = await listLiveJobs(pipeline);
    } catch (err) {
      console.error(`live-jobs read failed for ${pipeline}:`, err);
    }
    const liveById = new Map(live.map((r) => [r.id, r]));

    // Paginate the deduped union so a job lands on exactly one page and
    // totals stay consistent, then fetch only that page's S3 records.
    const ids = orderedJobIds(
      [...historyById.entries()].map(([id, o]) => ({ id, lastModified: o.lastModified })),
      live,
    );
    const total = ids.length;
    const pageIds = ids.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const jobs = (
      await Promise.all(
        pageIds.map(async (id) => {
          const key = historyById.get(id)?.key;
          const history = key
            ? await fetchJobRecord(client, base.pipelinesBucket, key)
            : null;
          return pickJobRecord(liveById.get(id), history);
        }),
      )
    ).filter((j): j is JobRecord => j !== null);

    return NextResponse.json({
      jobs,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }, `GET /api/p/${pipeline}/jobs`);
}

/** Triggers a job and returns immediately; it runs in this Node process. */
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
