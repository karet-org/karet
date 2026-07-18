import { describe, it, expect } from "vitest";
import { interpretWorkerResponse } from "@/lib/services/job-runner";

/**
 * Mirror of the catch-block logic in `runPipelineInBackground`: take the
 * error message and append the errno code from `cause` when present.
 */
function jobError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { cause?: { code?: unknown } })?.cause?.code;
  return code ? `${message} (${code})` : message;
}

function fetchFailed(code: string): Error {
  const err = new TypeError("fetch failed");
  (err as { cause?: unknown }).cause = Object.assign(new Error(code), { code });
  return err;
}

describe("job error message", () => {
  it("appends the errno code to a bare fetch failure", () => {
    expect(jobError(fetchFailed("ECONNREFUSED"))).toBe("fetch failed (ECONNREFUSED)");
  });

  it("leaves the message unchanged when there is no code", () => {
    expect(jobError(new Error("boom"))).toBe("boom");
  });
});

describe("interpretWorkerResponse", () => {
  it("records a successful run with its metrics", () => {
    const fields = interpretWorkerResponse(true, 200, "OK", {
      partitions_written: 77,
      files_processed: 26,
      errors: [],
    });
    expect(fields).toEqual({
      status: "completed",
      partitions_written: 77,
      files_processed: 26,
    });
  });

  it("keeps a 2xx run completed but summarises per-file errors", () => {
    const fields = interpretWorkerResponse(true, 200, "OK", {
      partitions_written: 3,
      files_processed: 4,
      errors: ["ingest scotia_visa_9012_mapping: bad date"],
    });
    expect(fields.status).toBe("completed");
    expect(fields.partitions_written).toBe(3);
    expect(fields.errors).toEqual(["ingest scotia_visa_9012_mapping: bad date"]);
    expect(fields.error).toContain("1 error(s)");
  });

  it("marks a non-2xx worker response as failed and surfaces its error", () => {
    // The exact shape the worker returns when it cannot reach S3.
    const fields = interpretWorkerResponse(false, 400, "Bad Request", {
      error: {
        kind: "config_read_failed",
        message: "S3 GetObject failed for pipelines/spending/pipeline.json: dispatch failure",
        details: [],
      },
    });
    expect(fields.status).toBe("failed");
    expect(fields.error).toBe(
      "worker returned HTTP 400: config_read_failed: S3 GetObject failed for pipelines/spending/pipeline.json: dispatch failure",
    );
    // A failure must never masquerade as a success with zero work.
    expect(fields.partitions_written).toBeUndefined();
    expect(fields.files_processed).toBeUndefined();
  });

  it("falls back to the body text then statusText for non-JSON failures", () => {
    expect(interpretWorkerResponse(false, 502, "Bad Gateway", "upstream closed").error).toBe(
      "worker returned HTTP 502: upstream closed",
    );
    expect(interpretWorkerResponse(false, 504, "Gateway Timeout", null).error).toBe(
      "worker returned HTTP 504: Gateway Timeout",
    );
  });
});
