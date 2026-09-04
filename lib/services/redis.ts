// Shared Redis client (Valkey/Redis via node-redis).
//
// Presence of REDIS_URL is the feature flag for the queue-based job
// system (see karet-jobs-redis-design.html): when set, `startJob`
// enqueues onto the `karet:jobs:stream` stream that the worker fleet
// consumes, and the jobs API merges live state from Redis hashes.
// When unset, the legacy direct-HTTP path is used.
//
// One lazily-connected client is shared per process, mirroring the
// DuckDB handle in `duckdb.ts`.

import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;

/** True when the Redis-backed job queue is enabled. */
export function redisEnabled(): boolean {
  const url = process.env.REDIS_URL;
  return typeof url === "string" && url.length > 0;
}

/**
 * The shared client, connected on first use. Throws if REDIS_URL is not
 * set — call `redisEnabled()` first.
 */
export async function getRedis(): Promise<RedisClientType> {
  if (client?.isOpen) return client;
  if (connecting) return connecting;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  connecting = (async () => {
    const c: RedisClientType = createClient({ url });
    c.on("error", (err) => console.error("redis client error:", err));
    await c.connect();
    client = c;
    connecting = null;
    return c;
  })();
  return connecting;
}

// ---------------------------------------------------------------------------
// Key names — must match the worker's `queue.rs`.
// ---------------------------------------------------------------------------

export const STREAM_KEY = "karet:jobs:stream";
export const STREAM_MAXLEN = 4096;

export function liveKey(jobId: string): string {
  return `karet:jobs:live:${jobId}`;
}

export function indexKey(pipeline: string): string {
  return `karet:jobs:index:${pipeline}`;
}
