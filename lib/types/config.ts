// TypeScript mirror of the Rust `Pipeline_Config` / `AstNode`; kept in lockstep
// with `src/karet-worker/src/config.rs` and `ast.rs`.

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
  | { kind: "and"; left: AstNode; right: AstNode }
  | { kind: "or"; left: AstNode; right: AstNode }
  | { kind: "not"; input: AstNode }
  | { kind: "if"; cond: AstNode; then: AstNode; else: AstNode }
  | { kind: "coalesce"; args: AstNode[] }
  | { kind: "parse_date"; input: AstNode; format: string }
  | { kind: "year"; input: AstNode }
  | { kind: "month"; input: AstNode }
  | { kind: "day"; input: AstNode }
  | { kind: "lookup_ref"; lookup_id: string; input: AstNode }
  | { kind: "cast"; input: AstNode; to: CastType };

export interface ColumnSchema {
  name: string;
  type: string; // "string" | "number" | "int64" | "float64" | "date" | "bool"
  nullable?: boolean;
  assertions?: ColumnAssertions;
}

/** Data-quality checks on a column; missing field means "don't check". */
interface ColumnAssertions {
  not_null?: boolean;
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
  /**
   * Highest-priority matching row wins; ties fall back to definition order.
   * Defaults to `0`, so omitting it preserves first-match-wins.
   */
  priority?: number;
}

export interface LookupMapping {
  id: string;
  name?: string;
  match?: string; // e.g. "keyword_substring"
  case_insensitive?: boolean;
  rows: LookupRow[];
  children?: LookupMapping[];
  /** Fallback when no row (and no child) matches; unset means `null`. */
  catch_all?: LookupCatchAll;
}

export interface LookupCatchAll {
  output: string;
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
  columns: MappingColumn[];
  /** Row filter evaluated after the columns, so it references their names. */
  where?: AstNode;
}

export interface AnalyticTable {
  id: string;
  name: string;
  schema: ColumnSchema[];
  /** Ordered hive partition keys naming schema columns. Max 2, no floats. */
  partition_keys?: string[];
  /** Row-identity columns; duplicate tuples collapse at write time. */
  dedup_keys?: string[];
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface PipelineConfig {
  version: number;
  /** Display name shown in the UI. The S3 prefix / URL id never changes. */
  name: string;
  source_containers: SourceContainer[];
  lookup_mappings: LookupMapping[];
  mappings: Mapping[];
  analytic_tables: AnalyticTable[];
  layout?: Record<string, LayoutPosition>;
}
