// Regression: a failed Redis connect must not poison future getRedis()
// calls (previously the rejected promise was cached forever, breaking
// enqueue until restart).

import { afterEach, describe, expect, it, vi } from "vitest";

const connectAttempts: Array<"fail" | "ok"> = [];
let behavior: Array<"fail" | "ok"> = [];

vi.mock("redis", () => ({
  createClient: () => {
    const outcome = behavior[connectAttempts.length] ?? "ok";
    connectAttempts.push(outcome);
    return {
      isOpen: false,
      on() {
        return this;
      },
      async connect() {
        if (outcome === "fail") throw new Error("connection refused");
        (this as { isOpen: boolean }).isOpen = true;
      },
    };
  },
}));

async function freshGetRedis() {
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).__karetRedis;
  const mod = await import("@/lib/services/redis");
  return mod.getRedis;
}

describe("getRedis", () => {
  afterEach(() => {
    connectAttempts.length = 0;
    behavior = [];
    delete (globalThis as Record<string, unknown>).__karetRedis;
    delete process.env.REDIS_URL;
  });

  it("retries after a failed connect instead of caching the rejection", async () => {
    process.env.REDIS_URL = "redis://mocked:6379";
    behavior = ["fail", "ok"];
    const getRedis = await freshGetRedis();

    await expect(getRedis()).rejects.toThrow("connection refused");
    // Second call must start a fresh attempt — and succeed.
    const client = await getRedis();
    expect(client.isOpen).toBe(true);
    expect(connectAttempts).toEqual(["fail", "ok"]);
  });

  it("reuses one open client across calls", async () => {
    process.env.REDIS_URL = "redis://mocked:6379";
    behavior = ["ok"];
    const getRedis = await freshGetRedis();
    const a = await getRedis();
    const b = await getRedis();
    expect(a).toBe(b);
    expect(connectAttempts).toEqual(["ok"]);
  });

  it("throws when REDIS_URL is unset", async () => {
    const getRedis = await freshGetRedis();
    await expect(getRedis()).rejects.toThrow("REDIS_URL is not set");
  });
});
