// Side-effect-free so property tests can assert the DOM error indicator
// equals the predicate.

import type {
  LookupMapping,
  Mapping,
  SourceContainer,
} from "@/lib/types/config";

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
