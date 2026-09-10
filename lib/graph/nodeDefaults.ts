import type {
  AnalyticTable,
  AstNode,
  Dimension,
  Mapping,
  PipelineConfig,
  SourceContainer,
  Rollup,
} from "@/lib/types/config";
import { dimensionId } from "./build";

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

function defaultDimension(): Dimension {
  return {
    id: uid("dim"),
    name: "New Dimension",
    match: "keyword_substring",
    case_insensitive: true,
    rows: {
      values: ["value"],
      rows: [{ patterns: ["EXAMPLE"], values: ["DEFAULT"] }],
    },
  };
}

function defaultMapping(): Mapping {
  return {
    id: uid("mapping"),
    name: "New Mapping",
    source_container_id: "",
    analytic_table_id: "",
    // Seeded from the connected Analytic_Table's schema once wired in the graph.
    columns: [],
  };
}

function defaultRollup(): Rollup {
  return {
    id: uid("rollup"),
    name: "New Rollup",
    source_table_id: "",
    analytic_table_id: "",
    group_by: [],
    aggregates: [{ name: "rows", fn: "count" }],
  };
}

function defaultAnalyticTable(): AnalyticTable {
  const id = uid("table");
  return {
    id,
    name: "New Table",
    schema: [{ name: "id", type: "string" }],
  };
}

export type NodeKind = "source" | "dimension" | "mapping" | "table" | "rollup";

export function addNodeToConfig(cfg: PipelineConfig, kind: NodeKind): PipelineConfig {
  switch (kind) {
    case "source":
      return { ...cfg, source_containers: [...cfg.source_containers, defaultSourceContainer()] };
    case "dimension":
      return { ...cfg, dimensions: [...cfg.dimensions, defaultDimension()] };
    case "mapping":
      return { ...cfg, mappings: [...cfg.mappings, defaultMapping()] };
    case "table":
      return { ...cfg, analytic_tables: [...cfg.analytic_tables, defaultAnalyticTable()] };
    case "rollup":
      return { ...cfg, rollups: [...(cfg.rollups ?? []), defaultRollup()] };
  }
}

/**
 * Disconnect an edge by clearing the field that produced it. Dimension edges
 * derive from `dim_ref` in expressions and can't be disconnected here.
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
 * Re-shape a Mapping's columns against its table's new schema: renames keep
 * the authored expr, adds become null-expr placeholders, deletes drop.
 */
export function syncMappingColumnsToSchema(
  mapping: Mapping,
  previousSchema: AnalyticTable["schema"],
  nextSchema: AnalyticTable["schema"],
): Mapping {
  const byName = new Map(mapping.columns.map((c) => [c.name, c]));

  // Rename detection: two columns at the same index whose names differ AND
  // whose names are unique on each side; otherwise a delete-then-add at the
  // same index would be misclassified as a rename.
  const renamedTo = new Map<string, string>(); // oldName -> newName
  const minLen = Math.min(previousSchema.length, nextSchema.length);
  const oldNames = new Set(previousSchema.map((c) => c.name));
  const newNames = new Set(nextSchema.map((c) => c.name));
  for (let i = 0; i < minLen; i++) {
    const oldName = previousSchema[i].name;
    const newName = nextSchema[i].name;
    if (oldName === newName) continue;
    if (!oldNames.has(newName) && !newNames.has(oldName)) {
      renamedTo.set(oldName, newName);
    }
  }

  const columns: Mapping["columns"] = nextSchema.map((col) => {
    const direct = byName.get(col.name);
    if (direct) return direct;

    for (const [oldName, newName] of renamedTo) {
      if (newName === col.name) {
        const previous = byName.get(oldName);
        if (previous) return { ...previous, name: col.name };
      }
    }

    return { name: col.name, expr: { kind: "null" as const } };
  });

  return { ...mapping, columns };
}

/** Cascading damage that deleting `nodeId` would cause beyond the node itself. */
export interface DeleteImpact {
  /** Mappings whose `source_container_id` points at the doomed node. */
  disconnectedMappings: { id: string; name: string }[];
  /** Mappings whose `analytic_table_id` points at the doomed node. */
  disconnectedTables: { id: string; name: string }[];
  /** Columns whose `expr` references the doomed node; the user must rewrite them. */
  brokenExpressions: {
    mappingId: string;
    mappingName: string;
    columnName: string;
  }[];
}

/** Predict the cascading damage of deleting `nodeId`. Read-only on `cfg`. */
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
  const isDimension = cfg.dimensions.some((l) => l.id === nodeId);
  const isMapping = cfg.mappings.some((m) => m.id === nodeId);
  const isTable = cfg.analytic_tables.some((t) => t.id === nodeId);

  // Edge-level cascades.
  for (const m of cfg.mappings) {
    if (isSource && m.source_container_id === nodeId) {
      impact.disconnectedMappings.push({ id: m.id, name: m.name || m.id });
    }
    if (isTable && m.analytic_table_id === nodeId) {
      impact.disconnectedTables.push({ id: m.id, name: m.name || m.id });
    }
  }

  // AST-level cascades: deleting a Dimension breaks `dim_ref`s on its root id;
  // deleting a Source breaks `col` refs, but only in mappings wired to it.
  if (isDimension) {
    for (const m of cfg.mappings) {
      for (const col of m.columns) {
        if (astReferencesDimension(col.expr, nodeId)) {
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
      // A col-ref of the same name in a mapping wired to a different source
      // is unrelated.
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

  if (isMapping) {
    // No expression syntax references mappings/tables by id, so nothing
    // cascades; the mapping's own columns go with it.
  }

  return impact;
}

/**
 * Replace every `dim_ref` rooted at `dimId` with a `null` atom so the
 * surviving columns still parse against the worker schema after a delete.
 */
export function scrubDimensionReferences(
  node: AstNode,
  dimId: string,
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
    case "and":
    case "or":
      return {
        ...node,
        left: scrubDimensionReferences(node.left, dimId),
        right: scrubDimensionReferences(node.right, dimId),
      };
    case "concat":
    case "coalesce":
      return {
        ...node,
        args: node.args.map((a) => scrubDimensionReferences(a, dimId)),
      };
    case "not":
    case "from_unix":
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "year":
    case "month":
    case "day":
    case "cast":
      return { ...node, input: scrubDimensionReferences(node.input, dimId) };
    case "contains":
      return {
        ...node,
        input: scrubDimensionReferences(node.input, dimId),
        pattern: scrubDimensionReferences(node.pattern, dimId),
      };
    case "if":
      return {
        ...node,
        cond: scrubDimensionReferences(node.cond, dimId),
        then: scrubDimensionReferences(node.then, dimId),
        else: scrubDimensionReferences(node.else, dimId),
      };
    case "dim_ref":
      if (dimensionId(node.dim_id) === dimId) {
        return { kind: "null" };
      }
      return { ...node, input: scrubDimensionReferences(node.input, dimId) };
  }
}

function astReferencesDimension(node: AstNode, dimId: string): boolean {
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
    case "and":
    case "or":
      return (
        astReferencesDimension(node.left, dimId) ||
        astReferencesDimension(node.right, dimId)
      );
    case "concat":
    case "coalesce":
      return node.args.some((a) => astReferencesDimension(a, dimId));
    case "not":
    case "from_unix":
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "year":
    case "month":
    case "day":
    case "cast":
      return astReferencesDimension(node.input, dimId);
    case "contains":
      return (
        astReferencesDimension(node.input, dimId) ||
        astReferencesDimension(node.pattern, dimId)
      );
    case "if":
      return (
        astReferencesDimension(node.cond, dimId) ||
        astReferencesDimension(node.then, dimId) ||
        astReferencesDimension(node.else, dimId)
      );
    case "dim_ref":
      if (dimensionId(node.dim_id) === dimId) return true;
      return astReferencesDimension(node.input, dimId);
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
    case "and":
    case "or":
      return (
        astReferencesSourceColumn(node.left, columnNames) ||
        astReferencesSourceColumn(node.right, columnNames)
      );
    case "concat":
    case "coalesce":
      return node.args.some((a) => astReferencesSourceColumn(a, columnNames));
    case "not":
    case "from_unix":
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
    case "dim_ref":
      return astReferencesSourceColumn(node.input, columnNames);
  }
}
