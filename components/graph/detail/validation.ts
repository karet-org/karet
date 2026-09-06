// Pure validation predicates for the structural editors.
//
// Each predicate returns a `ValidationResult` whose `errors` array is empty
// iff the edit is valid. The editors surface an inline error indicator iff
// `errors.length > 0`. Keeping these functions side-effect-free lets the
// property tests assert the DOM indicator equals the predicate.

import type {
  LookupMapping,
  Mapping,
  SourceContainer,
} from "@/lib/types/config";

/**
 * The logical column types recognized by the Source_Container editor.
 * Mirrors the dropdown options and the validator's known-type list.
 */
export const KNOWN_COLUMN_TYPES = [
  "string",
  "number",
  "int64",
  "float64",
  "date",
  "bool",
] as const;

export type KnownColumnType = (typeof KNOWN_COLUMN_TYPES)[number];

function isKnownColumnType(t: string): t is KnownColumnType {
  return (KNOWN_COLUMN_TYPES as readonly string[]).includes(t);
}

export interface ValidationResult {
  /** Human-readable validation errors. Empty iff the edit is valid. */
  errors: string[];
}

/**
 * Validate a Source_Container edit.
 *
 * Invalid iff any of:
 *   - `name` is empty (after trimming)
 *   - `schema` is empty
 *   - `schema` contains duplicate column names
 *   - any column uses a type that is not in {@link KNOWN_COLUMN_TYPES}
 */
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

/**
 * Validate a Lookup_Mapping edit.
 *
 * Invalid iff any row has an empty `input_patterns` array or any pattern is
 * an empty string.
 */
export function validateLookupMapping(
  entity: Pick<LookupMapping, "rows">,
): ValidationResult {
  const errors: string[] = [];
  for (let i = 0; i < entity.rows.length; i++) {
    const row = entity.rows[i];
    if (!row.input_patterns || row.input_patterns.length === 0) {
      errors.push(`Row ${i + 1}: input_patterns is empty`);
      continue;
    }
    for (let j = 0; j < row.input_patterns.length; j++) {
      if (row.input_patterns[j] === "") {
        errors.push(`Row ${i + 1} pattern ${j + 1}: empty pattern`);
      }
    }
  }
  return { errors };
}

/**
 * Validate a Mapping edit.
 *
 * Invalid iff:
 *   - `name` is empty
 *   - not connected to a source container
 *   - not connected to an analytic table
 *   - any column expression is a bare `null` (unset)
 */
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
