// Save round-trip preserves config content.
//
// Writing a `Pipeline_Config` through the `PUT /api/config` path and
// reading it back through `GET /api/config` yields a value equal to the
// original. We exercise the save/load layer the API route delegates to
// (`putPipelineConfig` + `getPipelineConfig`) against an in-memory S3
// stub so the round-trip is end-to-end within the server boundary.

import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import fc from "fast-check";
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3Config } from "@/lib/config/s3-client";
import {
  getPipelineConfig,
  putPipelineConfig,
} from "../config-service";
import { arbPipelineConfig } from "@/lib/testgen";
import type { PipelineConfig } from "@/lib/types/config";

// ---------------------------------------------------------------------------
// In-memory S3 stub (mirrors the shape used by `config-service.test.ts`).
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
        typeof body === "string"
          ? body
          : Buffer.from(body as Uint8Array).toString("utf-8");
      const etag = `etag-${nextEtag++}`;
      store.set(key, { body: text, etag });
      return { ETag: `"${etag}"` };
    }
    throw new Error(
      `Unsupported command in stub: ${(command as object).constructor?.name}`,
    );
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

describe("Save round-trip preserves config content", () => {
  it("PUT then GET yields a deeply-equal Pipeline_Config", async () => {
    await fc.assert(
      fc.asyncProperty(arbPipelineConfig, async (cfg: PipelineConfig) => {
        const client = buildStubClient();

        // PUT: write the config body as the web route would.
        const body = JSON.stringify(cfg);
        const { etag } = await putPipelineConfig(
          client,
          DEFAULT_CONFIG,
          body,
        );
        expect(etag).toBeDefined();

        // GET: read the config back and assert deep equality.
        const roundTripped = await getPipelineConfig(client, DEFAULT_CONFIG);
        expect(roundTripped).not.toBeNull();

        // The parsed config must equal the original modulo JSON's
        // lossy-ish canonicalization (explicit `undefined` fields are
        // dropped; `-0` collapses to `0`). Comparing the parsed roundtrip
        // to `JSON.parse(JSON.stringify(cfg))` asserts the stored body
        // reflects the canonical JSON serialization of the config.
        const canonical: PipelineConfig = JSON.parse(JSON.stringify(cfg));
        expect(roundTripped!.config).toEqual(canonical);
        expect(JSON.parse(roundTripped!.body)).toEqual(canonical);
      }),
      { numRuns: 100 },
    );
  });
});
