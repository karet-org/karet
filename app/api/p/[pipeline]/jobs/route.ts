import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { listJobs } from "@/lib/services/job-store";
import { listLiveJobs } from "@/lib/services/live-jobs";
import { startJob } from "@/lib/services/job-runner";
import type { JobRecord } from "@/lib/types/jobs";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;

/**
 * Run history, newest first.
 *
 * History is one Postgres query. Valkey still holds the in-flight runs, because a
 * job that has not finished has progress the row does not carry; its absence
 * degrades to history-only rather than failing the page.
 */
async function handleGet(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const url = new URL(request.url);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE));
  const before = url.searchParams.get("before") ?? undefined;

  const rows = await listJobs({ pipeline, limit: pageSize, before });

  let live: JobRecord[] = [];
  try {
    live = await listLiveJobs(pipeline);
  } catch (err) {
    console.error(`live-jobs read failed for ${pipeline}:`, err);
  }
  const liveById = new Map(live.map((r) => [r.id, r]));

  const jobs: JobRecord[] = rows.map((r) => {
    const inFlight = liveById.get(r.id);
    return {
      id: r.id,
      pipeline: r.pipeline,
      status: inFlight?.status ?? r.status,
      trigger: r.trigger,
      attempts: r.attempts,
      worker: r.worker ?? undefined,
      configVersion: r.configVersion ?? undefined,
      startedAt: r.startedAt ?? inFlight?.startedAt,
      completedAt: r.completedAt ?? undefined,
      files_processed: r.filesProcessed ?? undefined,
      partitions_written: r.partitionsWritten ?? undefined,
      rows_deduped: r.rowsDeduped ?? undefined,
      error: r.error ?? undefined,
      progress: inFlight?.progress,
    } as JobRecord;
  });

  // A run enqueued since the page was fetched may have no row yet; surface it so
  // the UI does not look stuck. Only in-flight ones: Valkey keeps terminal
  // hashes for a day after they finish, and those are already in history, so
  // including them would push day-old runs to the top of the list.
  for (const l of live) {
    const inFlight = l.status === "queued" || l.status === "running";
    if (inFlight && !rows.some((r) => r.id === l.id)) jobs.unshift(l);
  }

  return NextResponse.json({
    jobs,
    // Keyset cursor: pass this back as `before` for the next page.
    nextBefore: rows.length === pageSize ? rows[rows.length - 1].enqueuedAt : null,
  });
}

async function handlePost(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const job = await startJob({ pipeline, cleanRun: false });
  return NextResponse.json(job, { status: 202 });
}

export const GET = withRole(handleGet);
export const POST = withRole(handlePost);
