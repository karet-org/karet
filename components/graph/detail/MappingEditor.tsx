// Structural editor for a Mapping's output columns.
//
// Columns are driven by the connected Analytic_Table's schema: a mapping
// that is not wired to a table has no columns to edit, and the editor
// shows a hint prompting the user to make that connection first. Once a
// final table is selected, the editor renders exactly one row per column
// in that table's schema (in order) and the user edits only the
// expression for each. Columns can't be freely added or removed, the
// set is the target table's schema.
//
// Expressions are parsed on blur using the existing expression parser.

import { useEffect, useMemo, useState } from "react";
import type {
  AstNode,
  ColumnSchema,
  Mapping,
  MappingColumn,
  PartitionBy,
} from "@/lib/types/config";
import { astExpression } from "../astSummary";
import { parseExpression } from "@/lib/graph/expressionParser";
import { useGraphStore } from "@/lib/graph/store";
import { ExpandableTextField } from "@/components/ui/ExpandableTextField";
import { EditorField, inputClass } from "./editorPrimitives";
import { validateMapping } from "./validation";

export interface MappingEditorProps {
  value: Mapping;
  onChange: (next: Mapping) => void;
}

export const MAPPING_COLUMN_EDITOR_TESTID = "mapping-column-editor";
export const AST_JSON_PARSE_ERROR_TESTID = "ast-json-parse-error";
export const MAPPING_EDITOR_UNCONNECTED_TESTID = "mapping-editor-unconnected";
export const PARTITION_BY_EDITOR_TESTID = "partition-by-editor";

/** Granularities the Rust worker currently recognizes. */
const SUPPORTED_GRANULARITIES = ["month"] as const;

export function MappingEditor({ value, onChange }: MappingEditorProps) {
  const validationResult = useMemo(() => validateMapping(value), [value]);

  // Look up the connected analytic table from the loaded config.
  const table = useGraphStore((s) =>
    value.analytic_table_id
      ? s.config?.analytic_tables.find((t) => t.id === value.analytic_table_id) ?? null
      : null,
  );

  // Source columns are the valid set of `col` references for this
  // mapping's expressions. Three-state:
  //   - `string[]`: source is connected and has a known schema. Empty
  //     array means the source is genuinely empty (no columns).
  //   - `null`: `source_container_id` is set but the source either
  //     doesn't exist (deleted) or has no schema field. Every `col`
  //     reference is broken in that case; the validator treats `null`
  //     as "nothing is a valid column".
  //   - `undefined`: no source configured at all. The mapping's amber
  //     "Not connected to a source container" banner already covers
  //     this; per-column validation skips the col-ref check.
  //
  // The zustand selector returns the resolved `SourceContainer` (or
  // `null` / `undefined`) rather than a derived `string[]` so the
  // default Object.is equality doesn't fire on every render, deriving
  // column names inline would mint a new array each call and trigger
  // an infinite re-render loop.
  const source = useGraphStore((s) => {
    if (!value.source_container_id) return undefined;
    return s.config?.source_containers.find((c) => c.id === value.source_container_id) ?? null;
  });
  const sourceColumns = useMemo<string[] | null | undefined>(() => {
    if (source === undefined) return undefined;
    if (source === null) return null;
    return source.schema.map((c) => c.name);
  }, [source]);

  const setColumn = (index: number, column: MappingColumn) => {
    const columns = value.columns.map((c, i) => (i === index ? column : c));
    onChange({ ...value, columns });
  };

  const hasErrors = useMemo(
    () => value.columns.some((c) => columnHasError(c, sourceColumns)),
    [value.columns, sourceColumns],
  );

  return (
    <div data-testid="mapping-editor" className="flex flex-col gap-3">
      <EditorField label="name">
        <input
          className={inputClass()}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </EditorField>
      {(() => {
        // Suppress the "No final table connected" amber entry when the
        // dashed placeholder below is already showing it, otherwise the
        // user sees the same warning twice.
        const shown = validationResult.errors.filter(
          (e) => table || !/analytic table/i.test(e),
        );
        if (shown.length === 0) return null;
        return (
          <ul className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {shown.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        );
      })()}
      {!table ? (
        <div
          data-testid={MAPPING_EDITOR_UNCONNECTED_TESTID}
          className="flex flex-col gap-2 rounded border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500"
        >
          <p className="font-semibold text-gray-700">No final table connected</p>
          <p>
            Connect this mapping to an analytic table in the graph to define
            its output columns.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Columns ({value.columns.length}) · final table{" "}
            <span className="font-mono text-gray-700">{table.id}</span>
            {hasErrors && <span className="ml-2 text-red-500">- fix errors before saving</span>}
          </p>
          {value.columns.length === 0 ? (
            <p className="text-xs text-gray-400">No columns</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {value.columns.map((col, i) => (
                <li key={i}>
                  <ColumnExprEditor
                    value={col}
                    onChange={(next) => setColumn(i, next)}
                    sourceColumns={sourceColumns}
                  />
                </li>
              ))}
            </ul>
          )}
          <PartitionByEditor
            value={value.partition_by}
            columns={value.columns.map((c) => c.name)}
            tableSchema={table.schema}
            onChange={(partition_by) =>
              onChange(
                partition_by
                  ? { ...value, partition_by }
                  : stripPartitionBy(value),
              )
            }
          />
          <div className="rounded border border-gray-100 bg-gray-50 p-2 text-[10px] text-gray-400">
            <span className="font-semibold">Expression syntax:</span>{" "}
            <code>column_name</code>, <code>&quot;string&quot;</code>, <code>123</code>,{" "}
            <code>upper(x)</code>, <code>x * 100</code>, <code>x == y</code>,{" "}
            <code>if(cond, then, else)</code>, <code>lookup_ref(id, input)</code>,{" "}
            <code>parse_date(col, &quot;%Y-%m-%d&quot;)</code>, <code>cast(x, &quot;int64&quot;)</code>
          </div>
        </>
      )}
    </div>
  );
}

interface PartitionByEditorProps {
  value: PartitionBy | undefined;
  columns: string[];
  tableSchema: ColumnSchema[];
  onChange: (next: PartitionBy | undefined) => void;
}

function PartitionByEditor({ value, columns, tableSchema, onChange }: PartitionByEditorProps) {
  const enabled = value !== undefined;

  // Only date columns are legal partition targets: the worker's only
  // supported granularity is `"month"`, which requires a date-typed
  // column to bin by. Filter the mapping's produced columns down to the
  // date-typed subset per the connected analytic table's schema.
  const dateColumns = columns.filter((name) => {
    const col = tableSchema.find((c) => c.name === name);
    return col?.type === "date";
  });

  const toggle = (on: boolean) => {
    if (!on) {
      onChange(undefined);
      return;
    }
    // Seed with the first date column; user can change it. Granularity
    // starts at "month" (the only one the worker accepts today).
    onChange({
      column: value?.column ?? dateColumns[0] ?? "",
      granularity: value?.granularity ?? "month",
    });
  };

  const setColumn = (column: string) => {
    if (!value) return;
    onChange({ ...value, column });
  };
  const setGranularity = (granularity: string) => {
    if (!value) return;
    onChange({ ...value, granularity });
  };

  const missing = enabled && value && !columns.includes(value.column);
  const noDates = dateColumns.length === 0;

  return (
    <div
      data-testid={PARTITION_BY_EDITOR_TESTID}
      className="rounded border border-gray-200 bg-gray-50 p-2"
    >
      <label className="flex items-center gap-1.5 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          disabled={noDates && !enabled}
          title={
            noDates
              ? "Add a date-typed column to the analytic table schema to enable partitioning"
              : undefined
          }
        />
        <span className="font-semibold">Partition output</span>
        {noDates && !enabled && (
          <span className="text-gray-400">- needs a date column</span>
        )}
      </label>
      {enabled && value && (
        <div className="mt-2 flex gap-2">
          <EditorField label="column" className="flex-1">
            <select
              aria-label="partition column"
              className={inputClass("font-mono")}
              value={value.column}
              onChange={(e) => setColumn(e.target.value)}
            >
              {/* Keep the current value in the list even if it's not a
                  produced date column so the validator, not the UI, is
                  the source of truth about what's acceptable. */}
              {(missing ||
                !dateColumns.includes(value.column)) && (
                <option value={value.column}>{value.column}</option>
              )}
              {dateColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </EditorField>
          <EditorField label="granularity">
            <select
              aria-label="partition granularity"
              className={inputClass()}
              value={value.granularity}
              onChange={(e) => setGranularity(e.target.value)}
            >
              {!SUPPORTED_GRANULARITIES.includes(
                value.granularity as (typeof SUPPORTED_GRANULARITIES)[number],
              ) && (
                <option value={value.granularity}>{value.granularity}</option>
              )}
              {SUPPORTED_GRANULARITIES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </EditorField>
        </div>
      )}
      {missing && (
        <p className="mt-1 text-[11px] text-red-600">
          ⚠ column <code className="font-mono">{value!.column}</code> is not
          produced by this mapping
        </p>
      )}
      {enabled && value && !missing && !dateColumns.includes(value.column) && (
        <p className="mt-1 text-[11px] text-red-600">
          ⚠ column <code className="font-mono">{value.column}</code> is not a
          date-typed column; month partitioning requires a date
        </p>
      )}
    </div>
  );
}

function stripPartitionBy(m: Mapping): Mapping {
  const { partition_by: _drop, ...rest } = m;
  return rest;
}

/**
 * Parse `text` as an expression and check every `col` reference resolves
 * against the current source schema. Returns the first error message, or
 * `null` when the expression is valid for saving.
 *
 * `sourceColumns` semantics:
 *   - `string[]`: validate col refs against this set. Empty array means
 *     the source is genuinely empty (no columns); any `col` ref is bad.
 *   - `null`: the mapping's `source_container_id` points at a source
 *     that no longer exists (deleted). Every `col` reference is broken.
 *   - `undefined`: no source configured at all (either newly-created or
 *     source was deleted and its reference cleared). Any `col` reference
 *     in the expression is unresolvable. We still flag it so the user
 *     sees the per-column error immediately on opening the mapping, the
 *     amber banner at the top complements this, it doesn't replace it.
 */
function validateExprText(
  text: string,
  sourceColumns: string[] | null | undefined,
): string | null {
  const result = parseExpression(text);
  if (!result.ok) return result.error;
  const refs = collectColRefs(result.value);
  if (sourceColumns === undefined) {
    if (refs.length === 0) return null;
    return `No source container connected; col(${[...new Set(refs)].join(", ")}) cannot be resolved`;
  }
  if (sourceColumns === null) {
    if (refs.length === 0) return null;
    return `Source container is missing or deleted; col(${[...new Set(refs)].join(", ")}) cannot be resolved`;
  }
  const unknown = refs.filter((r) => !sourceColumns.includes(r));
  if (unknown.length > 0) {
    return `Unknown source column(s): ${[...new Set(unknown)].join(", ")}`;
  }
  return null;
}

/** Validate an already-persisted MappingColumn for the parent's "any errors?" check. */
function columnHasError(
  col: MappingColumn,
  sourceColumns: string[] | null | undefined,
): boolean {
  return validateExprText(astExpression(col.expr), sourceColumns) !== null;
}

interface ColumnExprEditorProps {
  value: MappingColumn;
  onChange: (next: MappingColumn) => void;
  sourceColumns: string[] | null | undefined;
}

/** Collect all column references from an AST node. */
function collectColRefs(node: AstNode): string[] {
  if (node.kind === "col") return [node.name];
  const refs: string[] = [];
  for (const v of Object.values(node)) {
    if (v && typeof v === "object" && "kind" in v) refs.push(...collectColRefs(v as AstNode));
    if (Array.isArray(v)) for (const item of v) if (item && typeof item === "object" && "kind" in item) refs.push(...collectColRefs(item as AstNode));
  }
  return refs;
}

function ColumnExprEditor({ value, onChange, sourceColumns }: ColumnExprEditorProps) {
  const [exprText, setExprText] = useState(() => astExpression(value.expr));

  // If the persisted value changes out from under us (e.g. the source
  // connection was restored, or another pane edited the column), reset
  // the local text to match.
  const persistedText = astExpression(value.expr);
  useEffect(() => {
    setExprText(persistedText);
  }, [persistedText]);

  // Validate on every render so errors surface immediately (e.g. right
  // after a source node is deleted) rather than waiting for the user to
  // blur the input.
  const error = useMemo(
    () => validateExprText(exprText, sourceColumns),
    [exprText, sourceColumns],
  );

  const handleBlur = () => {
    const result = parseExpression(exprText);
    if (result.ok && error === null) {
      onChange({ ...value, expr: result.value });
    }
  };

  return (
    <div
      data-testid={MAPPING_COLUMN_EDITOR_TESTID}
      className={`rounded border p-2 ${error ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
    >
      <div className="flex gap-2">
        <EditorField label="name">
          <input
            aria-label="column name"
            className={inputClass("font-mono w-24 bg-gray-100 text-gray-600")}
            value={value.name}
            readOnly
            title="Column names come from the connected analytic table"
          />
        </EditorField>
        <EditorField label="expression" className="flex-1">
          <ExpandableTextField
            ariaLabel="expression"
            value={exprText}
            onChange={setExprText}
            onBlur={handleBlur}
            onModalAction={handleBlur}
            spellCheck={false}
            error={error}
            modalTitle={`Expression: ${value.name}`}
            modalActionLabel="Done"
            inputClassName={inputClass(
              `font-mono w-full ${error ? "border-red-400" : ""}`,
            )}
          />
        </EditorField>
      </div>
      {error && (
        <p data-testid={AST_JSON_PARSE_ERROR_TESTID} className="mt-1 text-[11px] text-red-600">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

export default MappingEditor;
