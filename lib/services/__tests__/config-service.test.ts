// Unit tests for `config-service.ts` driven by an in-memory S3 mock.
//
// We construct an actual `S3Client` but replace its `send` method with a fake
// that services the subset of commands (`GetObject`, `PutObject`,
// `ListObjectsV2`) we exercise.

import { describe, it, expect, beforeEach } from "vitest";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
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
  getDashboard,
  getPipelineConfig,
  listDashboards,
  listDashboardsWithNames,
  listParquetKeys,
  PreconditionFailedError,
  putPipelineConfig,
  renamePipelinePrefix,
  SourceNotFoundError,
  TargetExistsError,
} from "../config-service";
import type { PipelineConfig } from "@/lib/types/config";
import type { DashboardConfig } from "@/lib/types/dashboard";

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
  bucket: "karet-data",
  region: "us-east-1",
  forcePathStyle: true,
  pipelineConfigKey: "config/pipeline.json",
  dashboardsPrefix: "dashboards/",
  cleanPrefix: "clean/",
  pipelinesPrefix: "pipelines/",
};

const SAMPLE_CONFIG: PipelineConfig = {
  version: 1,
  source_containers: [
    {
      id: "visa",
      name: "Visa",
      path_prefix: "raw/visa/",
      schema: [{ name: "date", type: "string" }],
    },
  ],
  lookup_mappings: [],
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
      output_prefix: "clean/transactions/",
      schema: [{ name: "date", type: "date" }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("config-service", () => {
  describe("getPipelineConfig", () => {
    it("returns parsed JSON plus body and etag when present", async () => {
      const body = JSON.stringify(SAMPLE_CONFIG);
      const client = buildStubClient({
        "config/pipeline.json": { body, etag: "v1" },
      });

      const result = await getPipelineConfig(client, DEFAULT_CONFIG);

      expect(result).not.toBeNull();
      expect(result!.config).toEqual(SAMPLE_CONFIG);
      expect(result!.body).toBe(body);
      expect(result!.etag).toBe("v1");
    });

    it("returns null when the config object does not exist", async () => {
      const client = buildStubClient();
      const result = await getPipelineConfig(client, DEFAULT_CONFIG);
      expect(result).toBeNull();
    });
  });

  describe("putPipelineConfig", () => {
    it("writes the body back and returns the new ETag", async () => {
      const client = buildStubClient();

      const body = JSON.stringify(SAMPLE_CONFIG);
      const { etag } = await putPipelineConfig(client, DEFAULT_CONFIG, body);
      expect(etag).toBeDefined();

      const reread = await getPipelineConfig(client, DEFAULT_CONFIG);
      expect(reread!.config).toEqual(SAMPLE_CONFIG);
    });

    it("rejects with PreconditionFailedError on ETag mismatch", async () => {
      const client = buildStubClient({
        "config/pipeline.json": {
          body: JSON.stringify(SAMPLE_CONFIG),
          etag: "current",
        },
      });

      await expect(
        putPipelineConfig(client, DEFAULT_CONFIG, "{}", "stale"),
      ).rejects.toBeInstanceOf(PreconditionFailedError);
    });

    it("accepts a matching If-Match ETag", async () => {
      const client = buildStubClient({
        "config/pipeline.json": {
          body: JSON.stringify(SAMPLE_CONFIG),
          etag: "current",
        },
      });

      await expect(
        putPipelineConfig(client, DEFAULT_CONFIG, "{}", "current"),
      ).resolves.toMatchObject({ etag: expect.any(String) });
    });

    // Regression: on RustFS the ETag returned by PutObject can differ
    // from what GetObject returns for the same object. If we returned
    // the PUT-response ETag, the next save's `If-Match` wouldn't match
    // the server's compare-and-swap read and would spuriously 412.
    it("returns the GET-canonical ETag, not the PUT-response ETag", async () => {
      const store = new Map<string, { body: string; getEtag: string }>();
      const client = new S3Client({ region: "us-east-1" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).send = async (command: unknown) => {
        if (command instanceof PutObjectCommand) {
          const key = command.input.Key!;
          const body = command.input.Body as string;
          store.set(key, { body, getEtag: "canonical" });
          return { ETag: '"putresponse"' };
        }
        if (command instanceof HeadObjectCommand) {
          // PUT runs first in this test, so the entry is always present.
          const entry = store.get(command.input.Key!)!;
          return { ETag: `"${entry.getEtag}"` };
        }
        if (command instanceof GetObjectCommand) {
          const entry = store.get(command.input.Key!)!;
          return {
            Body: Readable.from([Buffer.from(entry.body, "utf-8")]),
            ETag: `"${entry.getEtag}"`,
          };
        }
        throw new Error(
          `Unsupported command in stub: ${(command as object).constructor?.name}`,
        );
      };

      const { etag } = await putPipelineConfig(
        client,
        DEFAULT_CONFIG,
        JSON.stringify(SAMPLE_CONFIG),
      );

      expect(etag).toBe("canonical");
      expect(etag).not.toBe("putresponse");

      // Save → save round-trip with the returned ETag must not 412.
      await expect(
        putPipelineConfig(
          client,
          DEFAULT_CONFIG,
          JSON.stringify(SAMPLE_CONFIG),
          etag,
        ),
      ).resolves.toBeDefined();
    });

    // Regression: RustFS returns ETags with a `-<codec>` suffix
    // (e.g. `<md5>-zstd`) for compressed-at-rest objects, but the same
    // object can be read back as bare `<md5>` on a later GetObject. The
    // bare and codec-suffixed forms must compare equal so a save with
    // an `If-Match` value carrying either form lands cleanly.
    it("treats `<md5>-<codec>` and `<md5>` as the same ETag", async () => {
      const client = buildStubClient({
        "config/pipeline.json": {
          body: JSON.stringify(SAMPLE_CONFIG),
          etag: "abc123",
        },
      });

      // Server-stored canonical form is bare; client sends the
      // codec-suffixed form it captured at page load.
      await expect(
        putPipelineConfig(
          client,
          DEFAULT_CONFIG,
          JSON.stringify(SAMPLE_CONFIG),
          "abc123-zstd",
        ),
      ).resolves.toMatchObject({ etag: expect.any(String) });
    });

    // Multipart ETags carry a numeric `<md5>-<partcount>` suffix that
    // is part of the identity (different chunking → different ETag).
    // The codec-suffix strip must not collapse these.
    it("preserves multipart ETag numeric suffix", async () => {
      const client = buildStubClient({
        "config/pipeline.json": {
          body: JSON.stringify(SAMPLE_CONFIG),
          etag: "abc123-2",
        },
      });

      await expect(
        putPipelineConfig(
          client,
          DEFAULT_CONFIG,
          JSON.stringify(SAMPLE_CONFIG),
          "abc123",
        ),
      ).rejects.toBeInstanceOf(PreconditionFailedError);
    });
  });

  describe("listDashboards", () => {
    it("filters to .json and strips the extension", async () => {
      const client = buildStubClient({
        "dashboards/overview.json": { body: "{}", etag: "a" },
        "dashboards/spending.json": { body: "{}", etag: "b" },
        "dashboards/README.md": { body: "hi", etag: "c" },
        "dashboards/nested/hidden.json": { body: "{}", etag: "d" },
      });

      const names = await listDashboards(client, DEFAULT_CONFIG);
      expect(names.sort()).toEqual(["overview", "spending"]);
    });

    it("returns an empty list when no dashboards are present", async () => {
      const client = buildStubClient();
      const names = await listDashboards(client, DEFAULT_CONFIG);
      expect(names).toEqual([]);
    });
  });

  describe("listDashboardsWithNames", () => {
    it("pairs each id with its display name, sorted by name", async () => {
      const client = buildStubClient({
        "dashboards/net_income.json": {
          body: JSON.stringify({ id: "net_income", name: "Net Income" }),
          etag: "a",
        },
        "dashboards/cash_flow.json": {
          body: JSON.stringify({ id: "cash_flow", name: "Cash Flow" }),
          etag: "b",
        },
      });

      const listings = await listDashboardsWithNames(client, DEFAULT_CONFIG);
      expect(listings).toEqual([
        { id: "cash_flow", name: "Cash Flow" },
        { id: "net_income", name: "Net Income" },
      ]);
    });

    it("falls back to the id when name is missing or blank", async () => {
      const client = buildStubClient({
        "dashboards/no_name.json": { body: JSON.stringify({ id: "no_name" }), etag: "a" },
        "dashboards/blank.json": {
          body: JSON.stringify({ id: "blank", name: "   " }),
          etag: "b",
        },
      });

      const listings = await listDashboardsWithNames(client, DEFAULT_CONFIG);
      expect(listings).toEqual([
        { id: "blank", name: "blank" },
        { id: "no_name", name: "no_name" },
      ]);
    });
  });

  describe("getDashboard", () => {
    const dashboard: DashboardConfig = {
      id: "spending_overview",
      name: "Spending Overview",
      analytic_table_id: "transactions",
      filters: [],
      panels: [
        { kind: "summary", title: "Summary", columns: ["amount"] },
      ],
    };

    it("returns the parsed dashboard config when present", async () => {
      const client = buildStubClient({
        "dashboards/spending.json": {
          body: JSON.stringify(dashboard),
          etag: "a",
        },
      });
      const result = await getDashboard(client, DEFAULT_CONFIG, "spending");
      expect(result).toEqual(dashboard);
    });

    it("returns null for a missing dashboard", async () => {
      const client = buildStubClient();
      const result = await getDashboard(client, DEFAULT_CONFIG, "missing");
      expect(result).toBeNull();
    });
  });

  describe("listParquetKeys", () => {
    beforeEach(() => {
      // no shared state
    });

    it("lists only parquet keys under the requested table prefix", async () => {
      const client = buildStubClient({
        "clean/transactions/year=2024/month=01/a.parquet": {
          body: "",
          etag: "1",
        },
        "clean/transactions/year=2024/month=02/b.parquet": {
          body: "",
          etag: "2",
        },
        "clean/transactions/manifest.json": { body: "{}", etag: "3" },
        "clean/other/y.parquet": { body: "", etag: "4" },
      });

      const keys = await listParquetKeys(client, DEFAULT_CONFIG, "transactions");
      expect(keys.sort()).toEqual([
        "clean/transactions/year=2024/month=01/a.parquet",
        "clean/transactions/year=2024/month=02/b.parquet",
      ]);
    });
  });

  describe("renamePipelinePrefix", () => {
    const MINIMAL_CONFIG_JSON = JSON.stringify({
      version: 1,
      source_containers: [],
      lookup_mappings: [],
      mappings: [],
      analytic_tables: [],
    });

    it("copies every object under the old prefix to the new one and deletes the originals", async () => {
      const client = buildStubClient({
        "pipelines/old/pipeline.json": { body: MINIMAL_CONFIG_JSON, etag: "1" },
        "pipelines/old/dashboards/overview.json": { body: "{}", etag: "2" },
        "pipelines/old/clean/t/year=2024/month=01/data.parquet": {
          body: "PAR1",
          etag: "3",
        },
        // Unrelated pipeline -- must be left alone.
        "pipelines/other/pipeline.json": { body: MINIMAL_CONFIG_JSON, etag: "4" },
      });

      const moved = await renamePipelinePrefix(
        client,
        "karet-data",
        "pipelines/",
        "old",
        "new",
      );

      expect(moved).toBe(3);

      // The old prefix is empty after the rename.
      const oldKeys = await listParquetKeys(
        client,
        { ...DEFAULT_CONFIG, cleanPrefix: "pipelines/old/" },
        "",
      );
      expect(oldKeys).toEqual([]);

      // New keys exist with the same relative paths.
      const newCfg = { ...DEFAULT_CONFIG, cleanPrefix: "pipelines/new/clean/" };
      const newParquet = await listParquetKeys(client, newCfg, "t");
      expect(newParquet).toEqual([
        "pipelines/new/clean/t/year=2024/month=01/data.parquet",
      ]);

      // The unrelated pipeline's pipeline.json still loads.
      const otherCfg = {
        ...DEFAULT_CONFIG,
        pipelineConfigKey: "pipelines/other/pipeline.json",
      };
      const pc = await getPipelineConfig(client, otherCfg);
      expect(pc).not.toBeNull();
    });

    it("throws SourceNotFoundError when no objects exist under the old prefix", async () => {
      const client = buildStubClient({});
      await expect(
        renamePipelinePrefix(client, "karet-data", "pipelines/", "ghost", "new"),
      ).rejects.toBeInstanceOf(SourceNotFoundError);
    });

    it("throws TargetExistsError when the new slug already has a pipeline.json", async () => {
      const client = buildStubClient({
        "pipelines/old/pipeline.json": { body: MINIMAL_CONFIG_JSON, etag: "1" },
        "pipelines/new/pipeline.json": { body: MINIMAL_CONFIG_JSON, etag: "2" },
      });
      await expect(
        renamePipelinePrefix(client, "karet-data", "pipelines/", "old", "new"),
      ).rejects.toBeInstanceOf(TargetExistsError);

      // Pre-flight failed before any copy ran, so the old pipeline is intact.
      const old = await getPipelineConfig(client, {
        ...DEFAULT_CONFIG,
        pipelineConfigKey: "pipelines/old/pipeline.json",
      });
      expect(old).not.toBeNull();
    });

    it("handles keys containing characters that need URL-encoding in CopySource", async () => {
      // Spaces, plus signs, parens -- all legal in S3 keys, all require
      // encoding in the CopySource header.
      const client = buildStubClient({
        "pipelines/old/raw/weird name (1).csv": { body: "a,b\n1,2", etag: "1" },
        "pipelines/old/pipeline.json": { body: MINIMAL_CONFIG_JSON, etag: "2" },
      });
      const moved = await renamePipelinePrefix(
        client,
        "karet-data",
        "pipelines/",
        "old",
        "new",
      );
      expect(moved).toBe(2);

      // The weird-named file made it across with the same relative name.
      const cfg = {
        ...DEFAULT_CONFIG,
        pipelineConfigKey: "pipelines/new/pipeline.json",
      };
      const pc = await getPipelineConfig(client, cfg);
      expect(pc).not.toBeNull();
    });
  });
});
