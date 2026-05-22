// Shared fast-check generators for property tests.
//
// Mirrors the proptest generators in `src/karet-worker/src/testgen.rs` so
// the TypeScript and Rust property tests draw from the same distribution.
// Generators are intentionally bounded -- `arbAstNode` caps depth at ~6 via
// `fc.letrec`'s depth-identifier so shrinking stays fast.

import fc from "fast-check";
import type {
  AnalyticTable,
  AstNode,
  CastType,
  ColumnSchema,
  LayoutPosition,
  LookupMapping,
  LookupRow,
  Mapping,
  MappingColumn,
  PartitionBy,
  PipelineConfig,
  SourceContainer,
} from "./types/config";
import type {
  Aggregation,
  DashboardConfig,
  DashboardFilter,
  FilterKind,
  Panel,
} from "./types/dashboard";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ASCII-lowercase identifier: starts with a letter, 1..=8 chars. */
export const arbId: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
    fc.stringMatching(/^[a-z0-9_]{0,7}$/),
  )
  .map(([head, tail]) => head + tail);

/** Non-empty ASCII alphanumeric string, 1..=12 chars. */
export const arbName: fc.Arbitrary<string> = fc
  .stringMatching(/^[A-Za-z0-9]{1,12}$/)
  .filter((s) => s.length >= 1);

/** Short path prefix like `raw/foo/`. */
export const arbPathPrefix: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z][a-z0-9/_-]{0,15}$/);

/** One of the supported logical column types. */
export const arbColumnType: fc.Arbitrary<string> = fc.constantFrom(
  "string",
  "number",
  "int64",
  "float64",
  "date",
  "bool",
);

/** One of the four cast targets. */
export const arbCastType: fc.Arbitrary<CastType> = fc.constantFrom(
  "int64",
  "float64",
  "string",
  "date",
);

/**
 * Finite `number` suitable for AST `Num` literals. Excludes `NaN` and
 * ±∞ because JSON round-trip would collapse them to `null`.
 */
const arbFiniteNumber: fc.Arbitrary<number> = fc.double({
  noNaN: true,
  noDefaultInfinity: true,
});

// ---------------------------------------------------------------------------
// AstNode -- recursive generator via fc.letrec (depth-limited).
// ---------------------------------------------------------------------------

/**
 * Recursive generator for {@link AstNode}.
 *
 * Depth is bounded via fast-check's `depthIdentifier` + `depthSize`. Width
 * bounds mirror the Rust generator: `concat.args` is 0..=4, and the config
 * defaults are sized so trees stay small enough for fast shrinking.
 */
export const arbAstNode: fc.Arbitrary<AstNode> = fc.letrec<{
  node: AstNode;
}>((tie) => ({
  node: fc.oneof(
    { depthIdentifier: "astNode", depthSize: "small", withCrossShrink: true },
    // Leaves (non-recursive) -- listed first so they're picked as depth grows.
    arbName.map<AstNode>((name) => ({ kind: "col", name })),
    fc.string().map<AstNode>((value) => ({ kind: "str", value })),
    arbFiniteNumber.map<AstNode>((value) => ({ kind: "num", value })),
    fc.boolean().map<AstNode>((value) => ({ kind: "bool", value })),
    fc.constant<AstNode>({ kind: "null" }),

    // Arithmetic
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "add", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "sub", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "mul", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "div", left, right })),

    // String ops
    fc
      .tuple(fc.string(), fc.array(tie("node"), { minLength: 0, maxLength: 4 }))
      .map<AstNode>(([sep, args]) => ({ kind: "concat", sep, args })),
    tie("node").map<AstNode>((input) => ({ kind: "upper", input })),
    tie("node").map<AstNode>((input) => ({ kind: "lower", input })),
    tie("node").map<AstNode>((input) => ({ kind: "trim", input })),
    fc
      .tuple(
        tie("node"),
        fc.integer(),
        fc.option(fc.integer({ min: 0, max: 1024 }), { nil: null }),
      )
      .map<AstNode>(([input, start, length]) => ({
        kind: "substring",
        input,
        start,
        length,
      })),

    // Comparisons
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "eq", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "ne", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "gt", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "lt", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "ge", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([left, right]) => ({ kind: "le", left, right })),
    fc
      .tuple(tie("node"), tie("node"))
      .map<AstNode>(([input, pattern]) => ({ kind: "contains", input, pattern })),

    // Control flow
    fc
      .tuple(tie("node"), tie("node"), tie("node"))
      .map<AstNode>(([cond, t, e]) => ({ kind: "if", cond, then: t, else: e })),

    // Date and lookup
    fc
      .tuple(tie("node"), fc.stringMatching(/^[%A-Za-z0-9_/-]{1,10}$/))
      .map<AstNode>(([input, format]) => ({ kind: "parse_date", input, format })),
    fc
      .tuple(arbId, tie("node"))
      .map<AstNode>(([lookup_id, input]) => ({ kind: "lookup_ref", lookup_id, input })),

    // Cast
    fc
      .tuple(tie("node"), arbCastType)
      .map<AstNode>(([input, to]) => ({ kind: "cast", input, to })),
  ),
})).node as fc.Arbitrary<AstNode>;

// ---------------------------------------------------------------------------
// Pipeline_Config pieces
// ---------------------------------------------------------------------------

/** A single {@link ColumnSchema} with a random logical type. */
export const arbColumnSchema: fc.Arbitrary<ColumnSchema> = fc.record({
  name: arbName,
  type: arbColumnType,
  nullable: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * Analytic-table schema: 1..=5 columns.
 *
 * Exposed so graph / dashboard tests can sample schemas without constructing
 * a full `AnalyticTable`.
 */
export const arbAnalyticTableSchema: fc.Arbitrary<ColumnSchema[]> = fc.array(
  arbColumnSchema,
  { minLength: 1, maxLength: 5 },
);

/** {@link SourceContainer} -- non-empty schema (1..=5 cols). */
export const arbSourceContainer: fc.Arbitrary<SourceContainer> = fc.record({
  id: arbId,
  name: arbName,
  path_prefix: arbPathPrefix,
  schema: arbAnalyticTableSchema,
});

/** A single {@link LookupRow}: 1..=3 patterns. */
export const arbLookupRow: fc.Arbitrary<LookupRow> = fc.record(
  {
    input_patterns: fc.array(arbName, { minLength: 1, maxLength: 3 }),
    output: arbName,
    parent_output: fc.option(arbName, { nil: undefined }),
  },
  { requiredKeys: ["input_patterns", "output"] },
);

/**
 * {@link LookupMapping} -- flat (no recursive children).
 *
 * Mirrors the Rust generator: `children` is omitted so the generator stays
 * bounded; validator tests build hierarchies explicitly.
 */
export const arbLookupMapping: fc.Arbitrary<LookupMapping> = fc.record(
  {
    id: arbId,
    name: fc.option(arbName, { nil: undefined }),
    match: fc.option(fc.constant("keyword_substring"), { nil: undefined }),
    case_insensitive: fc.option(fc.boolean(), { nil: undefined }),
    rows: fc.array(arbLookupRow, { minLength: 1, maxLength: 5 }),
    parent_output_column: fc.option(arbName, { nil: undefined }),
  },
  { requiredKeys: ["id", "rows"] },
);

/** {@link PartitionBy} with month granularity. */
export const arbPartitionBy: fc.Arbitrary<PartitionBy> = fc.record({
  column: arbName,
  granularity: fc.constant("month"),
});

/** A single {@link MappingColumn} with a fresh AST expression. */
export const arbMappingColumn: fc.Arbitrary<MappingColumn> = fc.record({
  name: arbName,
  expr: arbAstNode,
});

/** {@link Mapping} with 1..=5 columns. */
export const arbMapping: fc.Arbitrary<Mapping> = fc.record(
  {
    id: arbId,
    name: arbName,
    source_container_id: arbId,
    analytic_table_id: arbId,
    partition_by: fc.option(arbPartitionBy, { nil: undefined }),
    columns: fc.array(arbMappingColumn, { minLength: 1, maxLength: 5 }),
  },
  {
    requiredKeys: [
      "id",
      "name",
      "source_container_id",
      "analytic_table_id",
      "columns",
    ],
  },
);

/** {@link AnalyticTable} with 1..=5 columns. */
export const arbAnalyticTable: fc.Arbitrary<AnalyticTable> = fc.record({
  id: arbId,
  name: arbName,
  output_prefix: arbPathPrefix,
  schema: arbAnalyticTableSchema,
});

/** {@link LayoutPosition}: finite x/y. */
export const arbLayoutPosition: fc.Arbitrary<LayoutPosition> = fc.record({
  x: fc.double({ noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ noNaN: true, noDefaultInfinity: true }),
});

/**
 * Rewrite colliding `id` fields across the four entity collections so that
 * every source_container / lookup_mapping / mapping / analytic_table id in
 * the returned config is globally unique. Appends `_1`, `_2`, ... to the
 * second and subsequent occurrences of a previously seen id.
 *
 * Only the entity `id` fields are rewritten -- cross-entity reference fields
 * (`Mapping.source_container_id`, `Mapping.analytic_table_id`, AST
 * `lookup_ref.lookup_id`) are left untouched, preserving the existing
 * contract that references are not guaranteed to resolve.
 */
function uniquifyEntityIds(cfg: PipelineConfig): PipelineConfig {
  const seen = new Set<string>();
  const rename = (id: string): string => {
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
    let suffix = 1;
    let candidate = `${id}_${suffix}`;
    while (seen.has(candidate)) {
      suffix += 1;
      candidate = `${id}_${suffix}`;
    }
    seen.add(candidate);
    return candidate;
  };
  return {
    ...cfg,
    source_containers: cfg.source_containers.map((sc) => ({
      ...sc,
      id: rename(sc.id),
    })),
    lookup_mappings: cfg.lookup_mappings.map((lm) => ({
      ...lm,
      id: rename(lm.id),
    })),
    mappings: cfg.mappings.map((m) => ({ ...m, id: rename(m.id) })),
    analytic_tables: cfg.analytic_tables.map((at) => ({
      ...at,
      id: rename(at.id),
    })),
  };
}

/**
 * Full {@link PipelineConfig}. References across collections are NOT
 * guaranteed to resolve -- validator tests construct valid configs explicitly.
 *
 * The entity `id` fields in `source_containers`, `lookup_mappings`,
 * `mappings`, and `analytic_tables` are guaranteed to be globally unique
 * across all four collections (colliding ids emitted by the sub-generators
 * are disambiguated with a `_N` suffix after generation). This keeps graph
 * rendering -- which emits one node per entity, keyed by `id` -- well-defined
 * on arbitrary configs.
 */
export const arbPipelineConfig: fc.Arbitrary<PipelineConfig> = fc
  .record(
    {
      version: fc.constant(1),
      source_containers: fc.array(arbSourceContainer, {
        minLength: 1,
        maxLength: 3,
      }),
      lookup_mappings: fc.array(arbLookupMapping, {
        minLength: 0,
        maxLength: 3,
      }),
      mappings: fc.array(arbMapping, { minLength: 1, maxLength: 3 }),
      analytic_tables: fc.array(arbAnalyticTable, {
        minLength: 1,
        maxLength: 3,
      }),
      layout: fc.option(
        fc.dictionary(arbId, arbLayoutPosition, {
          minKeys: 0,
          maxKeys: 4,
        }),
        { nil: undefined },
      ),
    },
    {
      requiredKeys: [
        "version",
        "source_containers",
        "lookup_mappings",
        "mappings",
        "analytic_tables",
      ],
    },
  )
  .map(uniquifyEntityIds);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const arbFilterKind: fc.Arbitrary<FilterKind> = fc.constantFrom(
  "dropdown",
  "date_range",
);

const arbAggregation: fc.Arbitrary<Aggregation> = fc.constantFrom(
  "sum",
  "count",
  "avg",
  "min",
  "max",
);

/** {@link DashboardFilter}. */
export const arbDashboardFilter: fc.Arbitrary<DashboardFilter> = fc.record({
  kind: arbFilterKind,
  column: arbName,
  label: arbName,
});

/** {@link Panel} -- uniform choice over the supported panel kinds. */
export const arbPanel: fc.Arbitrary<Panel> = fc.oneof(
  fc.record(
    {
      kind: fc.constant("kpi" as const),
      title: arbName,
      column: arbName,
      agg: fc.constantFrom("sum", "count", "avg", "min", "max", "mode"),
      format: fc.option(fc.constantFrom("number", "currency", "raw"), { nil: undefined }),
      icon: fc.option(fc.constantFrom("dollar", "chart", "shapes", "calendar"), { nil: undefined }),
    },
    { requiredKeys: ["kind", "title", "column", "agg"] },
  ),
  fc.record({
    kind: fc.constant("summary" as const),
    title: arbName,
    columns: fc.array(arbName, { minLength: 1, maxLength: 5 }),
  }),
  fc.record({
    kind: fc.constant("doughnut" as const),
    title: arbName,
    group_by: arbName,
    value: arbName,
    agg: arbAggregation,
  }),
  fc.record(
    {
      kind: fc.constant("line" as const),
      title: arbName,
      x: arbName,
      x_bin: fc.option(fc.constantFrom("day", "week", "month", "year"), {
        nil: undefined,
      }),
      y: arbName,
      agg: arbAggregation,
    },
    { requiredKeys: ["kind", "title", "x", "y", "agg"] },
  ),
  fc.record(
    {
      kind: fc.constant("bar" as const),
      title: arbName,
      group_by: arbName,
      value: arbName,
      agg: arbAggregation,
      limit: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
    },
    { requiredKeys: ["kind", "title", "group_by", "value", "agg"] },
  ),
  fc.record(
    {
      kind: fc.constant("table" as const),
      title: arbName,
      columns: fc.array(arbName, { minLength: 1, maxLength: 5 }),
      page_size: fc.option(fc.integer({ min: 1, max: 200 }), { nil: undefined }),
    },
    { requiredKeys: ["kind", "title", "columns"] },
  ),
);

/** {@link DashboardConfig}. */
export const arbDashboardConfig: fc.Arbitrary<DashboardConfig> = fc.record(
  {
    id: arbId,
    name: arbName,
    analytic_table_id: arbId,
    filters: fc.array(arbDashboardFilter, { minLength: 0, maxLength: 3 }),
    panels: fc.array(arbPanel, { minLength: 1, maxLength: 5 }),
    layout: fc.option(
      fc.record({ columns: fc.integer({ min: 1, max: 6 }) }),
      { nil: undefined },
    ),
  },
  {
    requiredKeys: ["id", "name", "analytic_table_id", "filters", "panels"],
  },
);
