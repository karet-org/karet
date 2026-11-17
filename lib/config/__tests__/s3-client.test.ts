import { afterEach, describe, expect, it, vi } from "vitest";
import { S3ServiceException } from "@aws-sdk/client-s3";
import { withPipelineS3 } from "../s3-client";

afterEach(() => vi.restoreAllMocks());

describe("withPipelineS3", () => {
  it("scopes the dashboard and query prefixes to the pipeline", async () => {
    const out = await withPipelineS3("p-1", "test", async (_client, config) => ({
      dashboards: config.dashboardsPrefix,
      queries: config.queriesPrefix,
    }));
    expect(out).toEqual({ dashboards: "pipelines/p-1/dashboards/", queries: "pipelines/p-1/queries/" });
  });

  it("answers 502 for a missing bucket and 503 for other S3 errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = new S3ServiceException({ name: "NoSuchBucket", $fault: "client", $metadata: {} });
    const res1 = (await withPipelineS3("p-1", "test", async () => {
      throw missing;
    })) as Response;
    expect(res1.status).toBe(502);
    const res2 = (await withPipelineS3("p-1", "test", async () => {
      throw new Error("timeout");
    })) as Response;
    expect(res2.status).toBe(503);
  });
});
