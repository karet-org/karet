import { describe, it, expect } from "vitest";

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
