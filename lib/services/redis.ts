// Shared Redis client (Valkey/Redis via node-redis).
//
// The Redis-backed job queue is the only job transport (see
// karet-jobs-redis-design.html): `startJob` enqueues onto
// `karet:jobs:stream` for the worker fleet, and the jobs API merges live
// state from Redis hashes over S3 history.
//
// One lazily-connected client is shared per process. State lives on
// `globalThis` so Next.js dev-mode HMR (which re-evaluates modules)
// reuses the socket instead of accumulating clients and error listeners.

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
 * The shared client, connected on first use. Throws if REDIS_URL is not
 * set (startup asserts it, so this is belt-and-braces).
 *
 * A failed connect must never poison future calls: `connecting` is
 * cleared in `finally`, so the next caller starts a fresh attempt, and
 * the client's own reconnectStrategy handles drops after a successful
 * connect.
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
