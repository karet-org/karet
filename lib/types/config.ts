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
  | { kind: "from_unix"; input: AstNode; unit?: "s" | "ms" }
  | { kind: "if"; cond: AstNode; then: AstNode; else: AstNode }
  | { kind: "coalesce"; args: AstNode[] }
  | { kind: "parse_date"; input: AstNode; format: string }
  | { kind: "year"; input: AstNode }
  | { kind: "month"; input: AstNode }
  | { kind: "day"; input: AstNode }
  | { kind: "dim_ref"; dim_id: string; value?: string; input: AstNode }
  | { kind: "cast"; input: AstNode; to: CastType };

export interface ColumnSchema {
  name: string;
  /** JSON sources: dotted path with optional `[n]`, defaults to `name`. */
  path?: string;
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

/** Wire format of a source container's files. */
export type SourceFormat = "csv" | "ndjson" | "json_array";

export interface SourceContainer {
  id: string;
  name: string;
  path_prefix: string;
  /** Defaults to "csv" when absent. */
  format?: SourceFormat;
  schema: ColumnSchema[];
  /** JSON only: records failing this predicate are skipped. */
  record_filter?: AstNode;
}

/** How a dimension matches an input against its row patterns. */
export type MatchMode = "exact" | "keyword_substring";

/** Value produced for an input that matches no row. */
export type OnMiss = "null" | "passthrough" | { literal: string };

export interface InlineDimensionRow {
  /** Exact keys or substring patterns. */
  patterns: string[];
  /** One value per the dimension's `values` column list. */
  values: string[];
  /** Highest priority wins among matching rows; ties keep definition order. */
  priority?: number;
}

/** Rows written in the config: small, hand-edited tables. */
export interface InlineDimensionRows {
  values: string[];
  rows: InlineDimensionRow[];
}

/** Rows read from CSV files in the lake: large or externally maintained. */
export interface FileDimensionRows {
  path_prefix: string;
  key: string;
  values: string[];
  priority_column?: string;
}

export type DimensionRows = InlineDimensionRows | FileDimensionRows;

export function isFileRows(rows: DimensionRows): rows is FileDimensionRows {
  return "path_prefix" in rows;
}

/** Inline rows, or none for a file-backed dimension. */
export function inlineDimensionRows(rows: DimensionRows): InlineDimensionRow[] {
  return isFileRows(rows) ? [] : rows.rows;
}

/**
 * Key-to-value table referenced from mapping expressions via `dim_ref`.
 * Replaces the former Lookup_Mapping node: same matching behaviour, but rows
 * may come from a file and a match may return several value columns.
 */
export interface Dimension {
  id: string;
  name?: string;
  match?: MatchMode;
  case_insensitive?: boolean;
  on_miss?: OnMiss;
  rows: DimensionRows;
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
  dimensions: Dimension[];
  mappings: Mapping[];
  analytic_tables: AnalyticTable[];
  layout?: Record<string, LayoutPosition>;
}
