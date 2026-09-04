// Shared Redis client (Valkey/Redis via node-redis).
//
// The queue is the only job transport (karet-jobs-redis-design.html):
// `startJob` enqueues onto `karet:jobs:stream`; the jobs API merges live
// hashes over S3 history. One lazily-connected client per process, held
// on `globalThis` so dev-mode HMR reuses the socket.

import { createClient, type RedisClientType } from "redis";

interface RedisSingleton {
  client: RedisClientType | null;
  connecting: Promise<RedisClientType> | null;
}

const globalState = globalThis as typeof globalThis & {
  __karetRedis?: RedisSingleton;
};
const state: RedisSingleton = (globalState.__karetRedis ??= {
  client: null,
  connecting: null,
});

/**
 * The shared client, connected on first use. A failed connect never
 * poisons future calls: `connecting` clears in `finally`, so the next
 * caller retries; reconnectStrategy covers drops after connect.
 */
export async function getRedis(): Promise<RedisClientType> {
  if (state.client?.isOpen) return state.client;
  if (state.connecting) return state.connecting;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  state.connecting = (async () => {
    const c: RedisClientType = createClient({
      url,
      socket: {
        connectTimeout: 5_000,
        // Backoff 200ms, 400ms, ... capped at 5s, retry forever: the
        // queue is core infrastructure, giving up is never better.
        reconnectStrategy: (retries) => Math.min(200 * (retries + 1), 5_000),
      },
    });
    c.on("error", (err) => console.error("redis client error:", err));
    await c.connect();
    state.client = c;
    return c;
  })().finally(() => {
    state.connecting = null;
  });
  return state.connecting;
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
