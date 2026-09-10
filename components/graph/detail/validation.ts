// Side-effect-free so property tests can assert the DOM error indicator
// equals the predicate.

import type {
  AnalyticTable,
  Dimension,
  Rollup,
  Mapping,
  SourceContainer,
} from "@/lib/types/config";
import { isFileRows, aggregateNeedsColumn, aggregateOutputs } from "@/lib/types/config";

/** Mirrors the editor dropdown options and the validator's known-type list. */
export const KNOWN_COLUMN_TYPES = [
  "string",
  "number",
  "int64",
  "float64",
  "date",
  "bool",
] as const;

type KnownColumnType = (typeof KNOWN_COLUMN_TYPES)[number];

function isKnownColumnType(t: string): t is KnownColumnType {
  return (KNOWN_COLUMN_TYPES as readonly string[]).includes(t);
}

export interface ValidationResult {
  /** Human-readable validation errors. Empty iff the edit is valid. */
  errors: string[];
}

/** Requires a name and a schema with unique names and known types. */
export function validateSourceContainer(
  entity: Pick<SourceContainer, "name" | "schema">,
): ValidationResult {
  const errors: string[] = [];
  if (!entity.name || entity.name.trim() === "") {
    errors.push("Name is required");
  }
  if (!entity.schema || entity.schema.length === 0) {
    errors.push("Schema must have at least one column");
  } else {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const col of entity.schema) {
      if (seen.has(col.name)) dupes.add(col.name);
      seen.add(col.name);
    }
    if (dupes.size > 0) {
      errors.push(
        `Duplicate column names: ${Array.from(dupes).sort().join(", ")}`,
      );
    }
    for (const col of entity.schema) {
      if (!isKnownColumnType(col.type)) {
        errors.push(`Unknown type "${col.type}" on column "${col.name}"`);
      }
    }
  }
  return { errors };
}

/** Every row needs at least one non-empty input pattern. */
export function validateDimension(
  entity: Pick<Dimension, "rows">,
): ValidationResult {
  const errors: string[] = [];
  if (entity.rows.values.length === 0) {
    errors.push("At least one value column is required");
  }
  if (isFileRows(entity.rows)) {
    if (!entity.rows.path_prefix) errors.push("Lake folder is required");
    if (!entity.rows.key) errors.push("Key column is required");
    return { errors };
  }
  const rows = entity.rows.rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.patterns || row.patterns.length === 0) {
      errors.push(`Row ${i + 1}: patterns is empty`);
      continue;
    }
    for (let j = 0; j < row.patterns.length; j++) {
      if (row.patterns[j] === "") {
        errors.push(`Row ${i + 1} pattern ${j + 1}: empty pattern`);
      }
    }
  }
  return { errors };
}

/** Requires a name plus both source-container and analytic-table connections. */
export function validateMapping(
  entity: Pick<Mapping, "name" | "source_container_id" | "analytic_table_id" | "columns">,
): ValidationResult {
  const errors: string[] = [];
  if (!entity.name || entity.name.trim() === "") {
    errors.push("Name is required");
  }
  if (!entity.source_container_id) {
    errors.push("Not connected to a source container");
  }
  if (!entity.analytic_table_id) {
    errors.push("Not connected to an analytic table");
  }
  return { errors };
}

/**
 * Per-entity rollup checks. `source`/`target` are optional so the editor can
 * validate before the tables are wired; the save-time validator supplies both.
 */
export function validateRollup(
  entity: Rollup,
  source?: AnalyticTable,
  target?: AnalyticTable,
): ValidationResult {
  const errors: string[] = [];
  if (entity.group_by.length === 0) errors.push("Grain is empty: add at least one column");
  if (entity.aggregates.length === 0) errors.push("No aggregates");
  if (entity.source_table_id && entity.source_table_id === entity.analytic_table_id) {
    errors.push("A rollup cannot read and write the same table");
  }

  const sourceCols = new Set(source?.schema.map((c) => c.name) ?? []);
  const targetCols = new Set(target?.schema.map((c) => c.name) ?? []);

  for (const key of entity.group_by) {
    if (source && !sourceCols.has(key)) {
      errors.push(`Grain column "${key}" is not in ${source.name || source.id}`);
    }
    if (target && !targetCols.has(key)) {
      errors.push(`Grain column "${key}" is not declared in ${target.name || target.id}`);
    }
  }

  // A run recomputes the partitions its rows touch, which only works if the
  // grain covers the target's partition keys and the source partitions on
  // them too.
  for (const key of target?.partition_keys ?? []) {
    if (!entity.group_by.includes(key)) {
      errors.push(`Grain must include the target's partition key "${key}"`);
    }
    if (source && !(source.partition_keys ?? []).includes(key)) {
      errors.push(
        `"${key}" partitions the target but not ${source.name || source.id}, so a run could not recompute one partition at a time`,
      );
    }
  }

  const produced = new Set<string>();
  for (const agg of entity.aggregates) {
    if (!agg.name) errors.push("An aggregate is missing its name");
    if (aggregateNeedsColumn(agg.fn) && !agg.column) {
      errors.push(`Aggregate "${agg.name || agg.fn}" needs a column`);
    }
    if (agg.column && source && !sourceCols.has(agg.column)) {
      errors.push(`Aggregate column "${agg.column}" is not in ${source.name || source.id}`);
    }
    for (const name of aggregateOutputs(agg)) {
      if (target && !targetCols.has(name)) {
        errors.push(`Output column "${name}" is not declared in ${target.name || target.id}`);
      }
      if (produced.has(name)) errors.push(`Duplicate output column "${name}"`);
      produced.add(name);
    }
  }
  return { errors };
}
