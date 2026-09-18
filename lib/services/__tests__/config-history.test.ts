// Config history: numbering, ordering, attribution and pruning.

import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import type { S3Config } from "@/lib/config/s3-client";
import {
  RETAINED_VERSIONS,
  listVersionNumbers,
  listVersions,
  readVersion,
  recordVersion,
} from "../config-history";

const CONFIG = {
  pipelinesBucket: "karet-pipelines",
  pipelinesPrefix: "pipelines/",
} as unknown as S3Config;

function stubClient(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const client = new S3Client({ region: "us-east-1" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).send = async (command: unknown) => {
    if (command instanceof GetObjectCommand) {
      const body = store.get(command.input.Key!);
      if (body === undefined) {
        throw new NoSuchKey({ message: "missing", $metadata: { httpStatusCode: 404 } });
      }
      return { Body: Readable.from([Buffer.from(body, "utf-8")]) };
    }
    if (command instanceof PutObjectCommand) {
      const body = command.input.Body;
      store.set(
        command.input.Key!,
        typeof body === "string" ? body : Buffer.from(body as Uint8Array).toString("utf-8"),
      );
      return {};
    }
    if (command instanceof DeleteObjectCommand) {
      store.delete(command.input.Key!);
      return {};
    }
    if (command instanceof ListObjectsV2Command) {
      const prefix = command.input.Prefix ?? "";
      return {
        Contents: [...store.keys()].filter((k) => k.startsWith(prefix)).map((Key) => ({ Key })),
      };
    }
    throw new Error(`unexpected command: ${(command as object).constructor.name}`);
  };
  return { client, store };
}

const config = (name: string) =>
  JSON.stringify({
    version: 1,
    name,
    source_containers: [],
    dimensions: [],
    mappings: [],
    analytic_tables: [],
  });

describe("recordVersion", () => {
  it("numbers from one and increments", async () => {
    const { client } = stubClient();
    expect(await recordVersion(client, CONFIG, "demo", config("a"), "alice")).toBe(1);
    expect(await recordVersion(client, CONFIG, "demo", config("b"), "bob")).toBe(2);
    expect(await listVersionNumbers(client, CONFIG, "demo")).toEqual([1, 2]);
  });

  it("keeps each pipeline's history separate", async () => {
    const { client } = stubClient();
    await recordVersion(client, CONFIG, "one", config("a"), "alice");
    await recordVersion(client, CONFIG, "two", config("b"), "bob");
    expect(await listVersionNumbers(client, CONFIG, "one")).toEqual([1]);
    expect(await listVersionNumbers(client, CONFIG, "two")).toEqual([1]);
  });

  it("records the author, a timestamp and the config verbatim", async () => {
    const { client } = stubClient();
    await recordVersion(client, CONFIG, "demo", config("Spending"), "erin", "reverted to v2");
    const entry = await readVersion(client, CONFIG, "demo", 1);
    expect(entry?.author).toBe("erin");
    expect(entry?.note).toBe("reverted to v2");
    expect(Number.isNaN(Date.parse(entry!.saved_at))).toBe(false);
    expect((entry?.config as { name: string }).name).toBe("Spending");
  });

  it("lists newest first", async () => {
    const { client } = stubClient();
    await recordVersion(client, CONFIG, "demo", config("a"), "alice");
    await recordVersion(client, CONFIG, "demo", config("b"), "bob");
    await recordVersion(client, CONFIG, "demo", config("c"), "cara");
    expect((await listVersions(client, CONFIG, "demo")).map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("sorts numerically, not lexicographically", async () => {
    // "10.json" sorts before "9.json" as text, which would misorder history and
    // hand out a version number that already exists.
    const { client } = stubClient();
    for (let i = 0; i < 11; i++) {
      await recordVersion(client, CONFIG, "demo", config(`v${i}`), "alice");
    }
    expect(await listVersionNumbers(client, CONFIG, "demo")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect((await listVersions(client, CONFIG, "demo"))[0].version).toBe(11);
  });

  it("does not throw when the store rejects the write", async () => {
    // The head config is already saved by the time history is written, so a
    // failure here must not fail the user's save.
    const client = new S3Client({ region: "us-east-1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).send = async () => {
      throw new Error("bucket on fire");
    };
    expect(await recordVersion(client, CONFIG, "demo", config("a"), "alice")).toBeNull();
  });

  it("prunes the oldest past the retention window", async () => {
    const { client, store } = stubClient();
    // Seed one past the cap so a single record triggers a prune.
    for (let i = 1; i <= RETAINED_VERSIONS; i++) {
      store.set(`pipelines/demo/_history/${i}.json`, JSON.stringify({
        version: i,
        saved_at: "2026-09-16T00:00:00Z",
        author: "seed",
        config: {},
      }));
    }
    await recordVersion(client, CONFIG, "demo", config("newest"), "alice");
    const kept = await listVersionNumbers(client, CONFIG, "demo");
    expect(kept).toHaveLength(RETAINED_VERSIONS);
    expect(kept[0]).toBe(2);
    expect(kept.at(-1)).toBe(RETAINED_VERSIONS + 1);
  });
});

describe("readVersion", () => {
  it("returns null for a version that isn't there", async () => {
    const { client } = stubClient();
    expect(await readVersion(client, CONFIG, "demo", 7)).toBeNull();
  });
});
