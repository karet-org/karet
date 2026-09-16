#!/usr/bin/env node
// Migrate a pipeline config from Lookup_Mappings to Dimensions.
//
//   node scripts/migrate-lookups-to-dimensions.mjs in.json > out.json
//
// Mapping is 1:1 for every shape the Lookup node supported except nesting:
//   lookup_mappings[]        -> dimensions[]
//   rows[].input_patterns    -> rows.rows[].patterns
//   rows[].output            -> rows.rows[].values[0]
//   catch_all.output         -> on_miss.literal
//   lookup_ref(id, x)        -> dim_ref(id, x)
//
// Dimension ids are flat, so a config using `children` cannot be migrated
// automatically and is rejected rather than silently flattened.

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: migrate-lookups-to-dimensions.mjs <pipeline.json>");
  process.exit(2);
}

const cfg = JSON.parse(readFileSync(path, "utf8"));

if (!Array.isArray(cfg.lookup_mappings)) {
  console.error("no lookup_mappings: already migrated?");
  process.exit(1);
}

/** Name of the single value column a migrated dimension produces. */
const VALUE_COLUMN = "value";

const dimensions = cfg.lookup_mappings.map((lm) => {
  if (Array.isArray(lm.children) && lm.children.length > 0) {
    console.error(
      `lookup "${lm.id}" has ${lm.children.length} child mapping(s); dimension ids are flat. ` +
        `Promote each child to its own dimension and repoint its lookup_refs, then re-run.`,
    );
    process.exit(1);
  }
  const dim = {
    id: lm.id,
    ...(lm.name != null ? { name: lm.name } : {}),
    match: lm.match ?? "keyword_substring",
    ...(lm.case_insensitive != null ? { case_insensitive: lm.case_insensitive } : {}),
    rows: {
      values: [VALUE_COLUMN],
      rows: (lm.rows ?? []).map((r) => ({
        patterns: r.input_patterns,
        values: [r.output],
        ...(r.priority ? { priority: r.priority } : {}),
      })),
    },
  };
  if (lm.catch_all?.output != null) {
    dim.on_miss = { literal: lm.catch_all.output };
  }
  return dim;
});

/** Rewrite `lookup_ref` nodes in place, depth-first. */
function rewrite(node) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(rewrite);
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "kind" && v === "lookup_ref") {
      out.kind = "dim_ref";
    } else if (k === "lookup_id") {
      if (v.includes(".")) {
        console.error(`nested lookup_ref "${v}" cannot be migrated automatically`);
        process.exit(1);
      }
      out.dim_id = v;
    } else {
      out[k] = rewrite(v);
    }
  }
  return out;
}

const migrated = {
  ...cfg,
  dimensions,
  mappings: (cfg.mappings ?? []).map((m) => ({
    ...m,
    columns: m.columns.map((c) => ({ ...c, expr: rewrite(c.expr) })),
    ...(m.where ? { where: rewrite(m.where) } : {}),
  })),
};
delete migrated.lookup_mappings;

process.stdout.write(JSON.stringify(migrated, null, 2) + "\n");
