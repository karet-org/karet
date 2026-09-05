import { describe, expect, it } from "vitest";
import { isSafeEntryPath } from "@/lib/services/import-validation";

describe("isSafeEntryPath", () => {
  it("accepts plain relative paths", () => {
    for (const p of [
      "pipeline.json",
      "dashboards/spending overview.json",
      "transactions/year=2026/month=01/data.parquet",
      "raw/tx-1.csv",
    ]) {
      expect(isSafeEntryPath(p), p).toBe(true);
    }
  });

  it("rejects traversal, absolute, and hidden-segment paths", () => {
    for (const p of [
      "../evil.json",
      "a/../../evil.json",
      "/etc/passwd",
      "a\\b.json",
      ".hidden/x.json",
      "a//b.json",
      "",
      "a/".padEnd(600, "x"),
    ]) {
      expect(isSafeEntryPath(p), p).toBe(false);
    }
  });
});
