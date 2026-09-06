// The relations a pipeline's SQL can name: slugified display name AND
// table id both resolve, so a display rename can't strand panel SQL.

import { describe, expect, it } from "vitest";
import { relationsForConfig } from "../query-service";
import type { PipelineConfig } from "@/lib/types/config";

function cfg(name: string, id: string): PipelineConfig {
  return {
    version: 1,
    source_containers: [],
    lookup_mappings: [],
    mappings: [],
    analytic_tables: [{ id, name, schema: [] }],
    layout: {},
  };
}

describe("warehouse relations", () => {
  it("exposes both the slugified name and the id", () => {
    const rels = relationsForConfig("p", cfg("Transact", "transactions"));
    expect(rels.map((r) => r.slug).sort()).toEqual(["transact", "transactions"]);
    // both point at the same warehouse prefix (the id)
    expect(new Set(rels.map((r) => r.source)).size).toBe(1);
    expect(rels[0].source).toContain("/transactions/");
  });

  it("collapses when name and id agree", () => {
    const rels = relationsForConfig("p", cfg("Transactions", "transactions"));
    expect(rels).toHaveLength(1);
    expect(rels[0].slug).toBe("transactions");
  });
});
