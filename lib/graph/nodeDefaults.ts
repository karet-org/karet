// Default config generators for new pipeline entities.

import type {
  AnalyticTable,
  LookupMapping,
  Mapping,
  PipelineConfig,
  SourceContainer,
} from "@/lib/types/config";

let counter = 0;
function uid(prefix: string): string {
  return `${prefix}_${++counter}_${Date.now().toString(36)}`;
}

export function defaultSourceContainer(): SourceContainer {
  const id = uid("source");
  return {
    id,
    name: "New Source",
    path_prefix: `raw/${id}/`,
    schema: [{ name: "id", type: "string" }],
  };
}

export function defaultLookupMapping(): LookupMapping {
  return {
    id: uid("lookup"),
    name: "New Lookup",
    match: "keyword_substring",
    case_insensitive: true,
    rows: [{ input_patterns: ["EXAMPLE"], output: "DEFAULT" }],
    children: [],
  };
}

export function defaultMapping(): Mapping {
  return {
    id: uid("mapping"),
    name: "New Mapping",
    source_container_id: "",
    analytic_table_id: "",
    // Columns are driven by the connected Analytic_Table's schema and
    // seeded when the user wires the mapping to a table in the graph.
    columns: [],
  };
}

export function defaultAnalyticTable(): AnalyticTable {
  const id = uid("table");
  return {
    id,
    name: "New Table",
    output_prefix: `clean/${id}/`,
    schema: [{ name: "id", type: "string" }],
  };
}

export type NodeKind = "source" | "lookup" | "mapping" | "table";

export function addNodeToConfig(cfg: PipelineConfig, kind: NodeKind): PipelineConfig {
  switch (kind) {
    case "source":
      return { ...cfg, source_containers: [...cfg.source_containers, defaultSourceContainer()] };
    case "lookup":
      return { ...cfg, lookup_mappings: [...cfg.lookup_mappings, defaultLookupMapping()] };
    case "mapping":
      return { ...cfg, mappings: [...cfg.mappings, defaultMapping()] };
    case "table":
      return { ...cfg, analytic_tables: [...cfg.analytic_tables, defaultAnalyticTable()] };
  }
}

/**
 * Disconnect an edge in the pipeline config by clearing the field that
 * produced it:
 *
 *   - source_container → mapping : clears `mapping.source_container_id`
 *   - mapping → analytic_table   : clears `mapping.analytic_table_id` and
 *     empties `mapping.columns` (columns mirror the table schema and are
 *     re-seeded when a new table is connected; keeping them stale on the
 *     disconnected mapping would leave references to columns that no
 *     longer belong to any table).
 *
 * Lookup → mapping edges are derived from `lookup_ref` AST nodes embedded in
 * `mapping.columns[*].expr`. They cannot be disconnected here because doing
 * so would require rewriting user-authored expressions; callers must remove
 * the reference via the mapping editor instead. Returns `cfg` unchanged for
 * any unrecognized edge (including lookup→mapping).
 */
export function disconnectEdgeInConfig(
  cfg: PipelineConfig,
  source: string,
  target: string,
): PipelineConfig {
  const isSource = cfg.source_containers.some((s) => s.id === source);
  const isMapping = cfg.mappings.some((m) => m.id === source);
  const targetIsMapping = cfg.mappings.some((m) => m.id === target);
  const targetIsTable = cfg.analytic_tables.some((t) => t.id === target);

  if (isSource && targetIsMapping) {
    return {
      ...cfg,
      mappings: cfg.mappings.map((m) =>
        m.id === target && m.source_container_id === source
          ? { ...m, source_container_id: "" }
          : m,
      ),
    };
  }
  if (isMapping && targetIsTable) {
    return {
      ...cfg,
      mappings: cfg.mappings.map((m) =>
        m.id === source && m.analytic_table_id === target
          ? { ...m, analytic_table_id: "", columns: [] }
          : m,
      ),
    };
  }
  return cfg;
}
