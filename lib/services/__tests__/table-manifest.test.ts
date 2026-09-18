// Table versions: what the manifests say is available, and what restoring does.
//
// Restore is the interesting one. It writes forward rather than backward, so the
// pointer only ever climbs and the worker's next run cannot reuse a number.

import { describe, expect, it, beforeEach, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@/lib/config/s3-client", () => ({
  loadS3Config: () => ({
    warehouseBucket: "karet-warehouse",
    pipelinesPrefix: "pipelines/",
  }),
  createS3Client: () => ({
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = command.constructor.name;
      const key = command.input.Key as string;
      if (name === "GetObjectCommand") {
        const body = store.get(key);
        if (body === undefined) throw new Error("NoSuchKey");
        return { Body: body };
      }
      if (name === "PutObjectCommand") {
        store.set(key, String(command.input.Body));
        return {};
      }
      throw new Error(`unexpected ${name}`);
    },
  }),
}));

vi.mock("@/lib/services/s3-helpers", () => ({
  readBodyToBuffer: async (body: string) => Buffer.from(body),
  listAllObjectKeys: async (_c: unknown, _b: string, prefix: string) =>
    [...store.keys()].filter((k) => k.startsWith(prefix)),
}));

const { listTableVersions, readManifest, restoreTableVersion } = await import("../table-manifest");

const PREFIX = "pipelines/demo/requests/";

function seed(version: number, files: { key: string; bytes: number }[]) {
  store.set(
    `${PREFIX}_manifests/${version}.json`,
    JSON.stringify({
      version,
      created_at: `2026-09-1${version}T00:00:00Z`,
      files: files.map((f) => ({ ...f, mapping_id: "m" })),
    }),
  );
}

describe("listTableVersions", () => {
  beforeEach(() => store.clear());

  it("is empty for a table that was never published", async () => {
    expect(await listTableVersions("demo", "requests")).toEqual([]);
  });

  it("lists newest first, with sizes, and marks the live one", async () => {
    seed(1, [{ key: "v1/a.parquet", bytes: 1024 }]);
    seed(2, [
      { key: "v2/a.parquet", bytes: 2048 },
      { key: "v2/b.parquet", bytes: 1024 },
    ]);
    store.set(`${PREFIX}_current.json`, JSON.stringify({ version: 2 }));

    const versions = await listTableVersions("demo", "requests");
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ files: 2, bytes: 3072, live: true });
    expect(versions[1]).toMatchObject({ files: 1, bytes: 1024, live: false });
  });

  it("sorts numerically, so v10 is not treated as older than v9", async () => {
    for (let v = 1; v <= 11; v++) seed(v, [{ key: `v${v}/a.parquet`, bytes: 10 }]);
    store.set(`${PREFIX}_current.json`, JSON.stringify({ version: 11 }));
    const versions = await listTableVersions("demo", "requests");
    expect(versions[0].version).toBe(11);
    expect(versions.at(-1)!.version).toBe(1);
  });
});

describe("restoreTableVersion", () => {
  beforeEach(() => store.clear());

  it("writes the old file list forward and flips the pointer", async () => {
    seed(1, [{ key: "v1/a.parquet", bytes: 1024 }]);
    seed(2, [{ key: "v2/a.parquet", bytes: 2048 }]);
    store.set(`${PREFIX}_current.json`, JSON.stringify({ version: 2 }));

    const result = await restoreTableVersion("demo", "requests", 1);
    expect(result).toEqual({ version: 3 });

    // The new version names v1's objects; nothing was copied.
    const restored = await readManifest("demo", "requests");
    expect(restored?.version).toBe(3);
    expect(restored?.files.map((f) => f.key)).toEqual(["v1/a.parquet"]);

    // v2 is still there to roll forward into.
    expect(await readManifest("demo", "requests", 2)).not.toBeNull();
  });

  it("refuses a version that isn't retained", async () => {
    seed(1, [{ key: "v1/a.parquet", bytes: 10 }]);
    store.set(`${PREFIX}_current.json`, JSON.stringify({ version: 1 }));
    expect(await restoreTableVersion("demo", "requests", 9)).toEqual({
      error: "version_not_found",
    });
  });

  it("keeps climbing when the same version is restored twice", async () => {
    seed(1, [{ key: "v1/a.parquet", bytes: 10 }]);
    seed(2, [{ key: "v2/a.parquet", bytes: 10 }]);
    store.set(`${PREFIX}_current.json`, JSON.stringify({ version: 2 }));
    expect(await restoreTableVersion("demo", "requests", 1)).toEqual({ version: 3 });
    expect(await restoreTableVersion("demo", "requests", 1)).toEqual({ version: 4 });
  });
});
