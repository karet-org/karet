// Default config generators for new pipeline entities.

import type {
  AnalyticTable,
  AstNode,
  LookupMapping,
  Mapping,
  PipelineConfig,
  SourceContainer,
} from "@/lib/types/config";
import { rootLookupId } from "./build";

let counter = 0;
function uid(prefix: string): string {
  return `${prefix}_${++counter}_${Date.now().toString(36)}`;
}

function defaultSourceContainer(): SourceContainer {
  const id = uid("source");
  return {
    id,
    name: "New Source",
    path_prefix: `${id}/`,
    schema: [{ name: "id", type: "string" }],
  };
}

function defaultLookupMapping(): LookupMapping {
  return {
    id: uid("lookup"),
    name: "New Lookup",
    match: "keyword_substring",
    case_insensitive: true,
    rows: [{ input_patterns: ["EXAMPLE"], output: "DEFAULT" }],
    children: [],
  };
}

function defaultMapping(): Mapping {
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

function defaultAnalyticTable(): AnalyticTable {
  const id = uid("table");
  return {
    id,
    name: "New Table",
    output_prefix: `${id}/`,
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

/**
 * Re-shape a Mapping's `columns` array against the new schema of its
 * target Analytic_Table. Used after the user edits the table schema in
 * the detail panel: every connected Mapping's columns must continue to
 * mirror the table.
 *
 * The mapping is matched against the **previous** schema column-by-column
 * to detect renames at the same index, so the user's authored `expr` is
 * preserved when they only edit a column name.
 *
 * Behavior:
 *
 *   - **Add** (new name appears in `nextSchema`, not in `previousSchema`):
 *     append `{ name, expr: { kind: "null" } }` so the user has a slot
 *     to fill in.
 *   - **Rename** (same index, name changed): keep the existing `expr`,
 *     update the `name`.
 *   - **Delete** (name in `previousSchema` not in `nextSchema`): drop the
 *     mapping column entirely.
 *
 * The result preserves the order of `nextSchema` so downstream Parquet
 * output keeps a stable column order.
 */
export function syncMappingColumnsToSchema(
  mapping: Mapping,
  previousSchema: AnalyticTable["schema"],
  nextSchema: AnalyticTable["schema"],
): Mapping {
  // Map old column name -> existing mapping entry. Used for both rename
  // detection (paired with the index alignment below) and for preserving
  // expr when the column simply moves position.
  const byName = new Map(mapping.columns.map((c) => [c.name, c]));

  // Build a same-length-as-nextSchema rename map. Two columns at the
  // same index whose names differ AND whose names are unique on each
  // side count as a rename.
  const renamedTo = new Map<string, string>(); // oldName -> newName
  const minLen = Math.min(previousSchema.length, nextSchema.length);
  const oldNames = new Set(previousSchema.map((c) => c.name));
  const newNames = new Set(nextSchema.map((c) => c.name));
  for (let i = 0; i < minLen; i++) {
    const oldName = previousSchema[i].name;
    const newName = nextSchema[i].name;
    if (oldName === newName) continue;
    // Only treat as a rename if the new name didn't exist before and
    // the old name doesn't exist now, otherwise we'd misclassify a
    // delete-then-add at the same index as a rename.
    if (!oldNames.has(newName) && !newNames.has(oldName)) {
      renamedTo.set(oldName, newName);
    }
  }

  const columns: Mapping["columns"] = nextSchema.map((col) => {
    // Direct match keeps the user's authored expr.
    const direct = byName.get(col.name);
    if (direct) return direct;

    // Rename: find the old entry whose name renamed *to* this column,
    // keep its expr, update its name.
    for (const [oldName, newName] of renamedTo) {
      if (newName === col.name) {
        const previous = byName.get(oldName);
        if (previous) return { ...previous, name: col.name };
      }
    }

    // Otherwise this is a fresh add, seed with `null`.
    return { name: col.name, expr: { kind: "null" as const } };
  });

  return { ...mapping, columns };
}

/**
 * Cascading damage that deleting `nodeId` would cause beyond the node
 * itself. Used by the graph-page delete-confirm modal so users see the
 * downstream impact before they commit. Empty arrays mean "no
 * cascading damage", the node can be deleted cleanly.
 */
export interface DeleteImpact {
  /** Mappings whose `source_container_id` points at the doomed node. */
  disconnectedMappings: { id: string; name: string }[];
  /** Mappings whose `analytic_table_id` points at the doomed node. */
  disconnectedTables: { id: string; name: string }[];
  /**
   * Mapping columns whose `expr` references the doomed node by name
   * (source column references via `{ kind: "col" }` or lookup
   * references via `{ kind: "lookup_ref", lookup_id }`). These
   * expressions become invalid on delete and the user MUST rewrite
   * them.
   */
  brokenExpressions: {
    mappingId: string;
    mappingName: string;
    columnName: string;
  }[];
}

/**
 * Predict the cascading damage of deleting `nodeId`. Pure function,
 * read-only on `cfg`. The graph page renders the result in the
 * confirm modal so the user sees the blast radius before clicking
 * Delete.
 */
export function analyzeNodeDeleteImpact(
  cfg: PipelineConfig,
  nodeId: string,
): DeleteImpact {
  const impact: DeleteImpact = {
    disconnectedMappings: [],
    disconnectedTables: [],
    brokenExpressions: [],
  };

  const isSource = cfg.source_containers.some((s) => s.id === nodeId);
  const isLookup = cfg.lookup_mappings.some((l) => l.id === nodeId);
  const isMapping = cfg.mappings.some((m) => m.id === nodeId);
  const isTable = cfg.analytic_tables.some((t) => t.id === nodeId);

  // Edge-level cascades: which mappings will lose a connection.
  for (const m of cfg.mappings) {
    if (isSource && m.source_container_id === nodeId) {
      impact.disconnectedMappings.push({ id: m.id, name: m.name || m.id });
    }
    if (isTable && m.analytic_table_id === nodeId) {
      impact.disconnectedTables.push({ id: m.id, name: m.name || m.id });
    }
  }

  // AST-level cascades: which mapping columns reference the doomed
  // node. Two kinds of expression-level reference matter:
  //   - Deleting a Source breaks any `{ kind: "col" }` whose `name`
  //     resolves to a column in *that* source's schema (only when
  //     the column also belongs to a mapping connected to that
  //     source, otherwise the col-ref points at some other source).
  //   - Deleting a Lookup breaks any `{ kind: "lookup_ref" }` whose
  //     `lookup_id` (after dotted-root extraction) matches the
  //     doomed lookup's id.
  if (isLookup) {
    for (const m of cfg.mappings) {
      for (const col of m.columns) {
        if (astReferencesLookup(col.expr, nodeId)) {
          impact.brokenExpressions.push({
            mappingId: m.id,
            mappingName: m.name || m.id,
            columnName: col.name,
          });
        }
      }
    }
  }
  if (isSource) {
    const source = cfg.source_containers.find((s) => s.id === nodeId);
    const sourceColumnNames = new Set(source?.schema.map((c) => c.name) ?? []);
    for (const m of cfg.mappings) {
      // Only mappings that *were* connected to this source could have
      // valid col-refs into its schema. A col-ref by the same name in
      // a mapping connected to a different source is unrelated.
      if (m.source_container_id !== nodeId) continue;
      for (const col of m.columns) {
        if (astReferencesSourceColumn(col.expr, sourceColumnNames)) {
          impact.brokenExpressions.push({
            mappingId: m.id,
            mappingName: m.name || m.id,
            columnName: col.name,
          });
        }
      }
    }
  }

  // Deleting a Mapping or Table doesn't break expressions inside
  // *other* mappings, no expression syntax references those by id.
  // The mapping/table delete is captured by node removal alone.
  if (isMapping) {
    // No expression-level cascades; the mapping's own columns are
    // discarded with the mapping itself.
  }

  return impact;
}

/**
 * Replace every `lookup_ref` whose root id matches `lookupId` with a
 * `null` AST atom. Used when a Lookup is deleted so the surviving
 * mapping columns at least parse against the worker schema, the
 * user still has to rewrite the affected columns, but they won't get
 * a cryptic worker error on next save.
 */
export function scrubLookupReferences(
  node: AstNode,
  lookupId: string,
): AstNode {
  switch (node.kind) {
    case "col":
    case "str":
    case "num":
    case "bool":
    case "null":
      return node;
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "ne":
    case "gt":
    case "lt":
    case "ge":
    case "le":
      return {
        ...node,
        left: scrubLookupReferences(node.left, lookupId),
        right: scrubLookupReferences(node.right, lookupId),
      };
    case "concat":
    case "coalesce":
      return {
        ...node,
        args: node.args.map((a) => scrubLookupReferences(a, lookupId)),
      };
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "year":
    case "month":
    case "day":
    case "cast":
      return { ...node, input: scrubLookupReferences(node.input, lookupId) };
    case "contains":
      return {
        ...node,
        input: scrubLookupReferences(node.input, lookupId),
        pattern: scrubLookupReferences(node.pattern, lookupId),
      };
    case "if":
      return {
        ...node,
        cond: scrubLookupReferences(node.cond, lookupId),
        then: scrubLookupReferences(node.then, lookupId),
        else: scrubLookupReferences(node.else, lookupId),
      };
    case "lookup_ref":
      if (rootLookupId(node.lookup_id) === lookupId) {
        return { kind: "null" };
      }
      return { ...node, input: scrubLookupReferences(node.input, lookupId) };
  }
}

function astReferencesLookup(node: AstNode, lookupId: string): boolean {
  switch (node.kind) {
    case "col":
    case "str":
    case "num":
    case "bool":
    case "null":
      return false;
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "ne":
    case "gt":
    case "lt":
    case "ge":
    case "le":
      return (
        astReferencesLookup(node.left, lookupId) ||
        astReferencesLookup(node.right, lookupId)
      );
    case "concat":
    case "coalesce":
      return node.args.some((a) => astReferencesLookup(a, lookupId));
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "year":
    case "month":
    case "day":
    case "cast":
      return astReferencesLookup(node.input, lookupId);
    case "contains":
      return (
        astReferencesLookup(node.input, lookupId) ||
        astReferencesLookup(node.pattern, lookupId)
      );
    case "if":
      return (
        astReferencesLookup(node.cond, lookupId) ||
        astReferencesLookup(node.then, lookupId) ||
        astReferencesLookup(node.else, lookupId)
      );
    case "lookup_ref":
      if (rootLookupId(node.lookup_id) === lookupId) return true;
      return astReferencesLookup(node.input, lookupId);
  }
}

function astReferencesSourceColumn(
  node: AstNode,
  columnNames: Set<string>,
): boolean {
  switch (node.kind) {
    case "col":
      return columnNames.has(node.name);
    case "str":
    case "num":
    case "bool":
    case "null":
      return false;
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "ne":
    case "gt":
    case "lt":
    case "ge":
    case "le":
      return (
        astReferencesSourceColumn(node.left, columnNames) ||
        astReferencesSourceColumn(node.right, columnNames)
      );
    case "concat":
    case "coalesce":
      return node.args.some((a) => astReferencesSourceColumn(a, columnNames));
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "year":
    case "month":
    case "day":
    case "cast":
      return astReferencesSourceColumn(node.input, columnNames);
    case "contains":
      return (
        astReferencesSourceColumn(node.input, columnNames) ||
        astReferencesSourceColumn(node.pattern, columnNames)
      );
    case "if":
      return (
        astReferencesSourceColumn(node.cond, columnNames) ||
        astReferencesSourceColumn(node.then, columnNames) ||
        astReferencesSourceColumn(node.else, columnNames)
      );
    case "lookup_ref":
      return astReferencesSourceColumn(node.input, columnNames);
  }
}
