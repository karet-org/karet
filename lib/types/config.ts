// TypeScript mirror of the Rust `Pipeline_Config` and `AstNode` types.
// Kept in lockstep with `src/karet-worker/src/config.rs` and `ast.rs`.

// ---------------------------------------------------------------------------
// AstNode -- discriminated union on `kind`.
// ---------------------------------------------------------------------------

export type CastType = "int64" | "float64" | "string" | "date";

export type AstNode =
  | { kind: "col"; name: string }
  | { kind: "str"; value: string }
  | { kind: "num"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "add"; left: AstNode; right: AstNode }
  | { kind: "sub"; left: AstNode; right: AstNode }
  | { kind: "mul"; left: AstNode; right: AstNode }
  | { kind: "div"; left: AstNode; right: AstNode }
  | { kind: "concat"; sep: string; args: AstNode[] }
  | { kind: "upper"; input: AstNode }
  | { kind: "lower"; input: AstNode }
  | { kind: "trim"; input: AstNode }
  | { kind: "substring"; input: AstNode; start: number; length: number | null }
  | { kind: "eq"; left: AstNode; right: AstNode }
  | { kind: "ne"; left: AstNode; right: AstNode }
  | { kind: "gt"; left: AstNode; right: AstNode }
  | { kind: "lt"; left: AstNode; right: AstNode }
  | { kind: "ge"; left: AstNode; right: AstNode }
  | { kind: "le"; left: AstNode; right: AstNode }
  | { kind: "contains"; input: AstNode; pattern: AstNode }
  | { kind: "if"; cond: AstNode; then: AstNode; else: AstNode }
  | { kind: "coalesce"; args: AstNode[] }
  | { kind: "parse_date"; input: AstNode; format: string }
  | { kind: "lookup_ref"; lookup_id: string; input: AstNode }
  | { kind: "cast"; input: AstNode; to: CastType };

// ---------------------------------------------------------------------------
// Pipeline_Config
// ---------------------------------------------------------------------------

export interface ColumnSchema {
  name: string;
  type: string; // "string" | "number" | "int64" | "float64" | "date" | "bool"
  nullable?: boolean;
  assertions?: ColumnAssertions;
}

/**
 * Declarative data-quality checks on an Analytic_Table column. Mirrors
 * `ColumnAssertions` in `karet-worker/src/config.rs`. All fields are
 * optional; a missing field means "don't check".
 */
export interface ColumnAssertions {
  not_null?: boolean;
  unique?: boolean;
  accepted_values?: string[];
  min?: number;
  max?: number;
}

export interface SourceContainer {
  id: string;
  name: string;
  path_prefix: string;
  schema: ColumnSchema[];
}

export interface LookupRow {
  input_patterns: string[];
  output: string;
  parent_output?: string;
}

export interface LookupMapping {
  id: string;
  name?: string;
  match?: string; // e.g. "keyword_substring"
  case_insensitive?: boolean;
  rows: LookupRow[];
  children?: LookupMapping[];
  parent_output_column?: string;
  /**
   * Fallback hit emitted when no row's patterns match (after children
   * have also missed). Unset = miss yields `null` in the output column,
   * preserving the original behavior.
   */
  catch_all?: LookupCatchAll;
}

/** Output for a {@link LookupMapping.catch_all} fallback. */
export interface LookupCatchAll {
  output: string;
  parent_output?: string;
}

export interface PartitionBy {
  column: string;
  granularity: string; // currently "month"
}

export interface MappingColumn {
  name: string;
  expr: AstNode;
}

export interface Mapping {
  id: string;
  name: string;
  source_container_id: string;
  analytic_table_id: string;
  partition_by?: PartitionBy;
  columns: MappingColumn[];
}

export interface AnalyticTable {
  id: string;
  name: string;
  output_prefix: string;
  schema: ColumnSchema[];
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface PipelineConfig {
  version: number;
  source_containers: SourceContainer[];
  lookup_mappings: LookupMapping[];
  mappings: Mapping[];
  analytic_tables: AnalyticTable[];
  layout?: Record<string, LayoutPosition>;
}
