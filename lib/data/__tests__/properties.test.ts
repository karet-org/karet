import { describe, expect, it } from "vitest";
import { formatBytes, tableSources } from "../properties";
import type { PipelineConfig } from "@/lib/types/config";

describe("formatBytes", () => {
  it("picks a unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(4096)).toBe("4 KB");
    expect(formatBytes(7.4 * 1024 ** 2)).toBe("7.4 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 GB");
  });
});

describe("tableSources", () => {
  const config = {
    source_containers: [{ id: "logs", name: "Access logs", path_prefix: "logs/", schema: [] }],
    mappings: [
      { id: "m1", name: "All requests", source_container_id: "logs", analytic_table_id: "requests", columns: [] },
      { id: "m2", name: "Errors", source_container_id: "logs", analytic_table_id: "errors", columns: [], where: { type: "literal", value: true } },
      { id: "m3", name: "Old feed", source_container_id: "gone", analytic_table_id: "requests", columns: [] },
    ],
  } as unknown as Pick<PipelineConfig, "mappings" | "source_containers">;

  it("lists the mappings that write into the table", () => {
    expect(tableSources(config, "requests")).toEqual([
      { mapping: "All requests", source: "Access logs", filtered: false },
      { mapping: "Old feed", source: "gone", filtered: false },
    ]);
  });

  it("marks a mapping with a row filter", () => {
    expect(tableSources(config, "errors")).toEqual([{ mapping: "Errors", source: "Access logs", filtered: true }]);
  });

  it("returns nothing for a table no mapping writes", () => {
    expect(tableSources(config, "orphan")).toEqual([]);
  });
});
