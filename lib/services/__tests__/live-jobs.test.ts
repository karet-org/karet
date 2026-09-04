// Tests for the Redis-backed live-jobs module.
//
// The pure parts (hash → record mapping, live-over-history merge) always
// run. The enqueue transaction runs against a real server when
// REDIS_TEST_URL is set (CI provides a valkey service container), pinning
// wire-level compatibility with the worker's queue.rs.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  enqueueJob,
  liveHashToRecord,
  mergeLiveOverHistory,
} from "@/lib/services/live-jobs";
import type { JobRecord } from "@/lib/types/jobs";

function record(partial: Partial<JobRecord> & { id: string }): JobRecord {
  return {
    pipeline: "demo",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("liveHashToRecord", () => {
  it("maps a running hash with progress", () => {
    const rec = liveHashToRecord("j1", "demo", {
      status: "running",
      trigger: "webhook",
      enqueued_at: "1760000000000",
      started_at: "2026-01-01T00:00:01.000Z",
      stage: "ingesting",
      mappings_done: "2",
      mappings_total: "5",
      partitions_written: "7",
    });
    expect(rec).toEqual({
      id: "j1",
      pipeline: "demo",
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
      trigger: "webhook",
      partitions_written: 7,
      progress: { stage: "ingesting", mappings_done: 2, mappings_total: 5 },
    });
  });

  it("falls back to enqueued_at for queued jobs and returns null for empty hashes", () => {
    const rec = liveHashToRecord("j2", "demo", {
      status: "queued",
      enqueued_at: "1760000000000",
    });
    expect(rec?.startedAt).toBe(new Date(1760000000000).toISOString());
    expect(liveHashToRecord("gone", "demo", {})).toBeNull();
  });

  it("omits progress on terminal hashes", () => {
    const rec = liveHashToRecord("j3", "demo", {
      status: "failed",
      enqueued_at: "1760000000000",
      finished_at: "2026-01-01T00:01:00.000Z",
      error: "boom",
      stage: "ingesting",
    });
    expect(rec?.progress).toBeUndefined();
    expect(rec?.error).toBe("boom");
    expect(rec?.completedAt).toBe("2026-01-01T00:01:00.000Z");
  });
});

describe("mergeLiveOverHistory", () => {
  it("live non-terminal wins over any history record with the same id", () => {
    const history = [record({ id: "a", status: "failed" })];
    const live = [record({ id: "a", status: "running", startedAt: "2026-01-02T00:00:00.000Z" })];
    const merged = mergeLiveOverHistory(history, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("running");
  });

  it("terminal collision prefers the richer S3 record", () => {
    const history = [record({ id: "a", errors: ["e1", "e2"], files_processed: 3 })];
    const live = [record({ id: "a" })]; // live terminal, no errors detail
    const merged = mergeLiveOverHistory(history, live);
    expect(merged[0].errors).toEqual(["e1", "e2"]);
  });

  it("live terminal entries without a record still appear (S3-down window)", () => {
    const history: JobRecord[] = [];
    const live = [record({ id: "only-live", status: "failed" })];
    expect(mergeLiveOverHistory(history, live)).toHaveLength(1);
  });

  it("sorts newest first across both sources", () => {
    const history = [
      record({ id: "old", startedAt: "2026-01-01T00:00:00.000Z" }),
      record({ id: "mid", startedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const live = [record({ id: "new", status: "queued", startedAt: "2026-01-03T00:00:00.000Z" })];
    expect(mergeLiveOverHistory(history, live).map((j) => j.id)).toEqual(["new", "mid", "old"]);
  });
});

// ---------------------------------------------------------------------------
// Wire-level test against a real Redis/Valkey (skipped without a server).
// ---------------------------------------------------------------------------

const TEST_URL = process.env.REDIS_TEST_URL;

describe.skipIf(!TEST_URL)("enqueueJob (integration)", () => {
  let priorRedisUrl: string | undefined;

  beforeAll(() => {
    // Point the module at the test server — and restore afterwards so
    // files sharing this worker process see their original environment.
    priorRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = TEST_URL;
  });
  afterAll(async () => {
    const { getRedis } = await import("@/lib/services/redis");
    const redis = await getRedis();
    await redis.del("karet:jobs:stream");
    await redis.del("karet:jobs:index:web-int");
    await redis.del("karet:jobs:live:job-web-int-1");
    await redis.destroy();
    if (priorRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = priorRedisUrl;
  });

  it("writes the stream entry, live hash, and index exactly as the worker expects", async () => {
    const { getRedis } = await import("@/lib/services/redis");
    const jobRecord = await enqueueJob({
      job_id: "job-web-int-1",
      pipeline: "web-int",
      prefix: "pipelines/web-int/",
      clean_run: true,
      trigger: "manual",
      enqueued_at: 1760000000000,
    });
    expect(jobRecord.status).toBe("queued");

    const redis = await getRedis();
    // Stream entry carries a single `payload` field of JobMessage JSON.
    const entries = await redis.xRange("karet:jobs:stream", "-", "+");
    expect(entries).toHaveLength(1);
    const payload = JSON.parse(entries[0].message.payload);
    expect(payload).toEqual({
      job_id: "job-web-int-1",
      pipeline: "web-int",
      prefix: "pipelines/web-int/",
      clean_run: true,
      trigger: "manual",
      enqueued_at: 1760000000000,
    });
    // Live hash matches the worker's field names.
    const hash = await redis.hGetAll("karet:jobs:live:job-web-int-1");
    expect(hash.status).toBe("queued");
    expect(hash.pipeline).toBe("web-int");
    expect(hash.clean_run).toBe("true");
    expect(hash.enqueued_at).toBe("1760000000000");
    // Index entry scored by enqueued_at.
    const ids = await redis.zRange("karet:jobs:index:web-int", 0, -1);
    expect(ids).toEqual(["job-web-int-1"]);
  });
});
