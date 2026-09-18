// The relations a pipeline's SQL can name: slugified display name AND
// table id both resolve, so a display rename can't strand panel SQL.

import { describe, expect, it, vi } from "vitest";
import { relationsForConfig } from "../query-service";
import type { PipelineConfig } from "@/lib/types/config";

// A table only becomes nameable once it has a published manifest, so the
// manifest read is stubbed here; `published` flips it off for the last case.
let published = true;
vi.mock("@/lib/services/table-manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/table-manifest")>();
  return {
    ...actual,
    readManifest: vi.fn(async () =>
      published
        ? {
            version: 1,
            created_at: "2026-09-16T00:00:00Z",
            files: [{ key: "v1/m.parquet", mapping_id: "m", bytes: 10 }],
          }
        : null,
    ),
  };
});

function cfg(name: string, id: string): PipelineConfig {
  return {
    version: 1,
    name: "Test Pipeline",
    source_containers: [],
    dimensions: [],
    mappings: [],
    analytic_tables: [{ id, name, schema: [] }],
    layout: {},
  };
}

describe("warehouse relations", () => {
  it("exposes both the slugified name and the id", async () => {
    published = true;
    const rels = await relationsForConfig("p", cfg("Transact", "transactions"));
    expect(rels.map((r) => r.slug).sort()).toEqual(["transact", "transactions"]);
    // Both aliases share one source, so the manifest is read once per table.
    expect(new Set(rels.map((r) => r.source)).size).toBe(1);
    expect(rels[0].source).toContain("/transactions/");
  });

  it("collapses when name and id agree", async () => {
    published = true;
    const rels = await relationsForConfig("p", cfg("Transactions", "transactions"));
    expect(rels).toHaveLength(1);
    expect(rels[0].slug).toBe("transactions");
  });

  it("omits a table that has never been published", async () => {
    published = false;
    const rels = await relationsForConfig("p", cfg("Transact", "transactions"));
    expect(rels).toEqual([]);
  });
});
