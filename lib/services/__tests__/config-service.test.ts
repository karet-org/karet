// Unit tests for `config-service.ts` driven by an in-memory S3 mock.
//
// We construct an actual `S3Client` but replace its `send` method with a fake
// that services the subset of commands (`GetObject`, `PutObject`,
// `ListObjectsV2`) we exercise.

import { describe, it, expect, beforeEach } from "vitest";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3Config } from "@/lib/config/s3-client";
import {
  deleteQuery,
  getDashboardV2,
  getQuery,
  listDashboardsV2,
  listDashboardsWithNamesV2,
  listQueries,
  PreconditionFailedError,
  putQuery,
  TargetExistsError,
} from "../config-service";
import type { PipelineConfig } from "@/lib/types/config";

// ---------------------------------------------------------------------------
// In-memory S3 stub
// ---------------------------------------------------------------------------

interface Stored {
  body: string;
  etag: string;
}

function buildStubClient(initial: Record<string, Stored> = {}): S3Client {
  const store = new Map<string, Stored>(Object.entries(initial));
  const client = new S3Client({ region: "us-east-1" });
  let nextEtag = 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).send = async (command: unknown) => {
    if (command instanceof GetObjectCommand) {
      const key = command.input.Key!;
      const entry = store.get(key);
      if (!entry) {
        throw new NoSuchKey({
          message: `key ${key} not found`,
          $metadata: { httpStatusCode: 404 },
        });
      }
      return {
        Body: Readable.from([Buffer.from(entry.body, "utf-8")]),
        ETag: `"${entry.etag}"`,
      };
    }

    if (command instanceof PutObjectCommand) {
      const key = command.input.Key!;
      const body = command.input.Body;
      const text =
        typeof body === "string" ? body : Buffer.from(body as Uint8Array).toString("utf-8");
      const etag = `etag-${nextEtag++}`;
      store.set(key, { body: text, etag });
      return { ETag: `"${etag}"` };
    }

    if (command instanceof ListObjectsV2Command) {
      const prefix = command.input.Prefix ?? "";
      const contents = Array.from(store.entries())
        .filter(([k]) => k.startsWith(prefix))
        .map(([Key, v]) => ({ Key, ETag: `"${v.etag}"` }));
      return { Contents: contents };
    }

    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key!;
      const entry = store.get(key);
      if (!entry) {
        throw new NotFound({
          message: `key ${key} not found`,
          $metadata: { httpStatusCode: 404 },
        });
      }
      return { ETag: `"${entry.etag}"`, ContentLength: entry.body.length };
    }

    if (command instanceof CopyObjectCommand) {
      // `CopySource` is `/<bucket>/<key>` (URL-encoded). Strip the bucket
      // and decode to find the source key in the in-memory store.
      const copySource = command.input.CopySource!;
      const stripped = copySource.replace(/^\/[^/]+\//, "");
      const srcKey = decodeURIComponent(stripped);
      const destKey = command.input.Key!;
      const entry = store.get(srcKey);
      if (!entry) {
        throw new NoSuchKey({
          message: `key ${srcKey} not found`,
          $metadata: { httpStatusCode: 404 },
        });
      }
      const etag = `etag-${nextEtag++}`;
      store.set(destKey, { body: entry.body, etag });
      return { CopyObjectResult: { ETag: `"${etag}"` } };
    }

    if (command instanceof DeleteObjectCommand) {
      const key = command.input.Key!;
      store.delete(key);
      return {};
    }

    if (command instanceof DeleteObjectsCommand) {
      const objects = command.input.Delete?.Objects ?? [];
      for (const o of objects) {
        if (o.Key) store.delete(o.Key);
      }
      return { Deleted: objects };
    }

    throw new Error(`Unsupported command in stub: ${(command as object).constructor?.name}`);
  };

  return client;
}

const DEFAULT_CONFIG: S3Config = {
  pipelinesBucket: "karet-pipelines",
  lakeBucket: "karet-lake",
  warehouseBucket: "karet-warehouse",
  region: "us-east-1",
  forcePathStyle: true,
  pipelineConfigKey: "config/pipeline.json",
  dashboardsPrefix: "dashboards/",
  queriesPrefix: "queries/",
  warehousePrefix: "",
  pipelinesPrefix: "pipelines/",
};

const SAMPLE_CONFIG: PipelineConfig = {
  version: 1,
  name: "Sample Pipeline",
  source_containers: [
    {
      id: "visa",
      name: "Visa",
      path_prefix: "raw/visa/",
      schema: [{ name: "date", type: "string" }],
    },
  ],
  dimensions: [],
  mappings: [
    {
      id: "visa_to_tx",
      name: "Visa to TX",
      source_container_id: "visa",
      analytic_table_id: "transactions",
      columns: [{ name: "date", expr: { kind: "col", name: "date" } }],
    },
  ],
  analytic_tables: [
    {
      id: "transactions",
      name: "Transactions",
      schema: [{ name: "date", type: "date" }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("config-service", () => {
  describe("listDashboardsV2", () => {
    it("lists yaml stems, skipping nested keys and other extensions", async () => {
      const client = buildStubClient({
        "dashboards/overview.yaml": { body: "version: 2", etag: "a" },
        "dashboards/spending.yaml": { body: "version: 2", etag: "b" },
        "dashboards/old.json": { body: "{}", etag: "c" },
        "dashboards/drafts/wip.yaml": { body: "version: 2", etag: "d" },
      });
      const names = await listDashboardsV2(client, DEFAULT_CONFIG);
      expect(names.sort()).toEqual(["overview", "spending"]);
    });

    it("returns [] when none exist", async () => {
      const client = buildStubClient();
      const names = await listDashboardsV2(client, DEFAULT_CONFIG);
      expect(names).toEqual([]);
    });
  });

  describe("getDashboardV2 / listDashboardsWithNamesV2", () => {
    const VALID = [
      "version: 2",
      "id: spending",
      "name: Spending",
      "panels:",
      "  - kind: summary",
      "    title: S",
      "    query: SELECT 1",
    ].join("\n");

    it("parses a valid config and surfaces its name", async () => {
      const client = buildStubClient({
        "dashboards/spending.yaml": { body: VALID, etag: "a" },
      });
      const result = await getDashboardV2(client, DEFAULT_CONFIG, "spending");
      expect(result?.config?.name).toBe("Spending");
      const listings = await listDashboardsWithNamesV2(client, DEFAULT_CONFIG);
      expect(listings).toEqual([{ id: "spending", name: "Spending" }]);
    });

    it("returns null config for an invalid body, id as display name", async () => {
      const client = buildStubClient({
        "dashboards/broken.yaml": { body: "version: 1", etag: "a" },
      });
      const result = await getDashboardV2(client, DEFAULT_CONFIG, "broken");
      expect(result?.config).toBeNull();
      const listings = await listDashboardsWithNamesV2(client, DEFAULT_CONFIG);
      expect(listings).toEqual([{ id: "broken", name: "broken" }]);
    });

    it("returns null when missing", async () => {
      const client = buildStubClient();
      expect(await getDashboardV2(client, DEFAULT_CONFIG, "missing")).toBeNull();
    });
  });

  describe("saved queries", () => {
    it("putQuery then getQuery round-trips", async () => {
      const client = buildStubClient();
      await putQuery(client, DEFAULT_CONFIG, {
        id: "monthly_spend",
        name: "Monthly spend",
        sql: "SELECT * FROM transactions",
      });
      const got = await getQuery(client, DEFAULT_CONFIG, "monthly_spend");
      expect(got).toEqual({
        id: "monthly_spend",
        name: "Monthly spend",
        sql: "SELECT * FROM transactions",
      });
    });

    it("getQuery returns null for a missing query", async () => {
      const client = buildStubClient();
      expect(await getQuery(client, DEFAULT_CONFIG, "nope")).toBeNull();
    });

    it("putQuery rejects a duplicate id unless overwrite is set", async () => {
      const client = buildStubClient();
      const q = { id: "dup", name: "Dup", sql: "SELECT 1" };
      await putQuery(client, DEFAULT_CONFIG, q);
      await expect(putQuery(client, DEFAULT_CONFIG, q)).rejects.toBeInstanceOf(
        TargetExistsError,
      );
      // overwrite bypasses the guard.
      await expect(
        putQuery(client, DEFAULT_CONFIG, { ...q, sql: "SELECT 2" }, true),
      ).resolves.toBeUndefined();
      expect((await getQuery(client, DEFAULT_CONFIG, "dup"))?.sql).toBe("SELECT 2");
    });

    it("listQueries returns saved queries sorted by name", async () => {
      const client = buildStubClient();
      await putQuery(client, DEFAULT_CONFIG, { id: "b", name: "Beta", sql: "SELECT 1" });
      await putQuery(client, DEFAULT_CONFIG, { id: "a", name: "Alpha", sql: "SELECT 2" });
      const list = await listQueries(client, DEFAULT_CONFIG);
      expect(list.map((q) => q.name)).toEqual(["Alpha", "Beta"]);
    });

    it("deleteQuery removes a saved query", async () => {
      const client = buildStubClient();
      await putQuery(client, DEFAULT_CONFIG, { id: "x", name: "X", sql: "SELECT 1" });
      await deleteQuery(client, DEFAULT_CONFIG, "x");
      expect(await getQuery(client, DEFAULT_CONFIG, "x")).toBeNull();
    });
  });
});
