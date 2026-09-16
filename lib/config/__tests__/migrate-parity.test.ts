// The lookup→dimension mapping exists twice: `lib/config/migrate.ts` runs when
// the app reads a config, and `scripts/migrate-lookups-to-dimensions.mjs` does
// the same job in bulk for pipelines nobody will open in the UI (the worker
// rejects a legacy config, so waiting for a save is not always an option).
//
// Two implementations of one mapping drift. This pins them to each other.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePipelineConfig } from "@/lib/config/migrate";

const LEGACY = {
  version: 1,
  name: "Legacy",
  source_containers: [
    { id: "src", name: "Src", path_prefix: "src/", schema: [{ name: "a", type: "string" }] },
  ],
  lookup_mappings: [
    {
      id: "categories",
      name: "Categories",
      match: "keyword_substring",
      case_insensitive: true,
      rows: [
        { input_patterns: ["UBER", "LYFT"], output: "TRANSPORT" },
        { input_patterns: ["PAYROLL"], output: "INCOME", priority: 10 },
      ],
      children: [],
      catch_all: { output: "OTHER" },
    },
    {
      id: "wealthsimple_codes",
      match: "exact",
      case_insensitive: true,
      rows: [{ input_patterns: ["EFT"], output: "Transfer" }],
      children: [],
    },
  ],
  mappings: [
    {
      id: "m",
      name: "M",
      source_container_id: "src",
      analytic_table_id: "t",
      where: {
        kind: "ne",
        left: { kind: "lookup_ref", lookup_id: "categories", input: { kind: "col", name: "a" } },
        right: { kind: "str", value: "TRANSFER" },
      },
      columns: [
        {
          name: "category",
          expr: { kind: "lookup_ref", lookup_id: "categories", input: { kind: "col", name: "a" } },
        },
      ],
    },
  ],
  analytic_tables: [{ id: "t", name: "T", schema: [{ name: "category", type: "string" }] }],
};

describe("migration parity", () => {
  it("the bulk script and the read-time upgrade agree", () => {
    const dir = mkdtempSync(join(tmpdir(), "karet-migrate-"));
    const file = join(dir, "pipeline.json");
    writeFileSync(file, JSON.stringify(LEGACY));

    const fromScript = JSON.parse(
      execFileSync("node", ["scripts/migrate-lookups-to-dimensions.mjs", file], {
        encoding: "utf8",
      }),
    );
    const fromApp = normalizePipelineConfig(LEGACY);

    // The script writes a whole config; the reader upgrades in place. Compare
    // the parts either of them touches.
    expect(fromScript.dimensions).toEqual(fromApp.dimensions);
    expect(fromScript.mappings).toEqual(fromApp.mappings);
    expect("lookup_mappings" in fromScript).toBe(false);
    expect("lookup_mappings" in fromApp).toBe(false);
  });
});
