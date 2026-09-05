import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";
import { startJob } from "@/lib/services/job-runner";
import { listLiveJobs, orderedJobIds, pickJobRecord } from "@/lib/services/live-jobs";
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
    const keyById = new Map(
      allKeys
        .filter((k) => k.endsWith(".json"))
        .map((k) => [k.slice(prefix.length, -".json".length), k] as const),
    );

    // Live queue state (bounded); Redis briefly down degrades to
    // history-only rather than failing the listing.
    let live: JobRecord[] = [];
    try {
      live = await listLiveJobs(pipeline);
    } catch (err) {
      console.error(`live-jobs read failed for ${pipeline}:`, err);
    }
    const liveById = new Map(live.map((r) => [r.id, r]));

    // Paginate the deduped union so a job appears on exactly one page
    // and totals are consistent, then fetch only the page's S3 records.
    const ids = orderedJobIds([...keyById.keys()], live);
    const total = ids.length;
    const pageIds = ids.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const jobs = (
      await Promise.all(
        pageIds.map(async (id) => {
          const key = keyById.get(id);
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
