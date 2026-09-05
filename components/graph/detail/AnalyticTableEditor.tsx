// Structural editor for an Analytic_Table.
//
// Edits the table's name, output_prefix, schema columns, and each column's
// optional data-quality assertions (mirrors `ColumnAssertions` in the Rust
// worker: not_null, unique, accepted_values, min, max). Validation reuses
// the same KNOWN_COLUMN_TYPES / duplicate-column rules as
// `SourceContainerEditor`, since analytic-table schemas share the same
// structural shape.

import { useMemo, useState } from "react";
import type {
  AnalyticTable,
  ColumnAssertions,
  ColumnSchema,
} from "@/lib/types/config";
import Modal from "@/components/ui/Modal";
import { DeleteButton } from "@/components/ui/DeleteButton";
import {
  EditorField,
  InlineErrorList,
  inputClass,
} from "./editorPrimitives";
import {
  KNOWN_COLUMN_TYPES,
  validateSourceContainer,
  type ValidationResult,
} from "./validation";

export interface AnalyticTableEditorProps {
  value: AnalyticTable;
  onChange: (next: AnalyticTable) => void;
  onValidate?: (result: ValidationResult) => void;
}

export const ANALYTIC_TABLE_EDITOR_ERROR_TESTID = "analytic-table-editor-error";

export function AnalyticTableEditor({
  value,
  onChange,
  onValidate,
}: AnalyticTableEditorProps) {
  const result = useMemo(
    () =>
      validateSourceContainer({ name: value.name, schema: value.schema }),
    [value.name, value.schema],
  );
  if (onValidate) onValidate(result);

  // Track which column the user is asking to remove. The Modal opens
  // when this is non-null and closes back to null on cancel/confirm.
  const [columnToRemove, setColumnToRemove] = useState<number | null>(null);

  const setName = (name: string) => onChange({ ...value, name });
  const setOutputPrefix = (output_prefix: string) =>
    onChange({ ...value, output_prefix });

  const setColumn = (index: number, patch: Partial<ColumnSchema>) => {
    const schema = value.schema.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    );
    onChange({ ...value, schema });
  };
  const setAssertions = (index: number, patch: Partial<ColumnAssertions> | null) => {
    const schema = value.schema.map((c, i) => {
      if (i !== index) return c;
      if (patch === null) {
        // Drop the assertions object entirely (keep JSON minimal).
        const { assertions: _drop, ...rest } = c;
        return rest;
      }
      const next: ColumnAssertions = { ...(c.assertions ?? {}), ...patch };
      // If every field is unset, drop the object, the worker treats
      // missing and all-empty the same, but omitting keeps pipeline.json
      // tidy.
      const cleaned = pruneEmptyAssertions(next);
      return cleaned ? { ...c, assertions: cleaned } : stripAssertions(c);
    });
    onChange({ ...value, schema });
  };

  const addColumn = () => {
    onChange({
      ...value,
      schema: [...value.schema, { name: "", type: "string" }],
    });
  };
  // Open the confirm modal. The actual removal happens in
  // `confirmRemoveColumn` once the user accepts, and is also responsible
  // for dropping the same-named column from every connected Mapping
  // (cross-entity sync lives in `NodeDetailPanel.updateEntity`).
  const removeColumn = (index: number) => {
    setColumnToRemove(index);
  };
  const confirmRemoveColumn = () => {
    if (columnToRemove === null) return;
    onChange({
      ...value,
      schema: value.schema.filter((_, i) => i !== columnToRemove),
    });
    setColumnToRemove(null);
  };

  return (
    <div
      data-testid="analytic-table-editor"
      className="flex flex-col gap-3"
    >
      <EditorField label="name">
        <input
          data-testid="analytic-table-editor-name"
          className={inputClass()}
          value={value.name}
          onChange={(e) => setName(e.target.value)}
        />
      </EditorField>
      <EditorField label="output_prefix">
        <input
          data-testid="analytic-table-editor-output-prefix"
          className={inputClass("font-mono")}
          value={value.output_prefix}
          onChange={(e) => setOutputPrefix(e.target.value)}
        />
      </EditorField>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[color:var(--color-ink-3)]">Schema</span>
          <button
            type="button"
            data-testid="analytic-table-editor-add-column"
            onClick={addColumn}
            className="rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-0.5 text-[11px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
          >
            + Add column
          </button>
        </div>
        {value.schema.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">No columns</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {value.schema.map((col, i) => (
              <li
                key={i}
                data-testid="analytic-table-editor-column-row"
                className="rounded border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] p-2"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label={`column ${i} name`}
                    className={inputClass("flex-1 font-mono")}
                    value={col.name}
                    onChange={(e) => setColumn(i, { name: e.target.value })}
                  />
                  <select
                    aria-label={`column ${i} type`}
                    className={inputClass("w-24")}
                    value={col.type}
                    onChange={(e) => setColumn(i, { type: e.target.value })}
                  >
                    {!KNOWN_COLUMN_TYPES.includes(
                      col.type as (typeof KNOWN_COLUMN_TYPES)[number],
                    ) && <option value={col.type}>{col.type}</option>}
                    {KNOWN_COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <DeleteButton
                    label={`remove column ${i}`}
                    onClick={() => removeColumn(i)}
                  />
                </div>
                <AssertionsSection
                  index={i}
                  columnName={col.name || `column ${i}`}
                  columnType={col.type}
                  value={col.assertions}
                  onChange={(patch) => setAssertions(i, patch)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <InlineErrorList
        errors={result.errors}
        testId={ANALYTIC_TABLE_EDITOR_ERROR_TESTID}
      />

      {columnToRemove !== null ? (
        <Modal
          open
          onClose={() => setColumnToRemove(null)}
        >
          <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">Remove column</h2>
          <p className="mt-2 text-sm text-[color:var(--color-ink-2)]">
            Remove{" "}
            <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[12px]">
              {value.schema[columnToRemove]?.name ||
                `column ${columnToRemove + 1}`}
            </code>{" "}
            from <span className="font-medium">{value.name || "this table"}</span>?
          </p>
          <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
            It will also be removed from any Mapping that writes to this
            table. The change is staged in the editor; Save &amp; Publish
            commits it.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setColumnToRemove(null)}
              className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemoveColumn}
              data-testid="analytic-table-editor-confirm-remove-column"
              className="rounded-md bg-[color:var(--color-rose-deep)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-rose-deep)]"
            >
              Remove column
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

interface AssertionsSectionProps {
  index: number;
  columnName: string;
  columnType: string;
  value: ColumnAssertions | undefined;
  onChange: (patch: Partial<ColumnAssertions> | null) => void;
}

function AssertionsSection({
  index,
  columnName,
  columnType,
  value,
  onChange,
}: AssertionsSectionProps) {
  const [expanded, setExpanded] = useState<boolean>(
    () => value !== undefined && !isEmptyAssertions(value),
  );
  const hasAny = value !== undefined && !isEmptyAssertions(value);
  const numeric = isNumericType(columnType);

  const [acceptedText, setAcceptedText] = useState<string>(
    () => (value?.accepted_values ?? []).join(", "),
  );

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={`toggle assertions for ${columnName}`}
        data-testid={`analytic-table-editor-assertions-toggle-${index}`}
        className="flex items-center gap-1 text-[11px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>Assertions</span>
        {hasAny && (
          <span className="rounded-full bg-[rgba(108,178,255,0.16)] px-1.5 text-[9px] font-medium text-[#6cb2ff]">
            {countAssertions(value!)}
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1.5 rounded border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-2">
          <label className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-ink-2)]">
            <input
              type="checkbox"
              aria-label={`column ${index} not_null`}
              checked={value?.not_null === true}
              onChange={(e) =>
                onChange({ not_null: e.target.checked || undefined })
              }
            />
            <span>not null</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-ink-2)]">
            <input
              type="checkbox"
              aria-label={`column ${index} unique`}
              checked={value?.unique === true}
              onChange={(e) =>
                onChange({ unique: e.target.checked || undefined })
              }
            />
            <span>unique</span>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-[color:var(--color-ink-2)]">
            <span>accepted values (comma-separated)</span>
            <input
              aria-label={`column ${index} accepted_values`}
              className={inputClass("font-mono")}
              value={acceptedText}
              placeholder="FOOD, TRAVEL, SHOPPING"
              onChange={(e) => setAcceptedText(e.target.value)}
              onBlur={() => {
                const parsed = parseCsvList(acceptedText);
                onChange({ accepted_values: parsed.length ? parsed : undefined });
              }}
            />
          </label>
          {numeric ? (
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-0.5 text-[11px] text-[color:var(--color-ink-2)]">
                <span>min</span>
                <input
                  type="number"
                  aria-label={`column ${index} min`}
                  className={inputClass()}
                  value={value?.min ?? ""}
                  onChange={(e) =>
                    onChange({
                      min: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="flex flex-1 flex-col gap-0.5 text-[11px] text-[color:var(--color-ink-2)]">
                <span>max</span>
                <input
                  type="number"
                  aria-label={`column ${index} max`}
                  className={inputClass()}
                  value={value?.max ?? ""}
                  onChange={(e) =>
                    onChange({
                      max: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
          ) : (
            <p className="text-[10px] text-[color:var(--color-ink-3)]">
              min/max only apply to numeric column types
            </p>
          )}
          {hasAny && (
            <button
              type="button"
              onClick={() => {
                setAcceptedText("");
                onChange(null);
              }}
              className="self-start text-[11px] text-[color:var(--color-rose-deep)] hover:text-[color:var(--color-rose-deep)]"
            >
              Clear all assertions
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNumericType(type: string): boolean {
  return type === "number" || type === "int64" || type === "float64";
}

function parseCsvList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isEmptyAssertions(a: ColumnAssertions): boolean {
  return (
    a.not_null === undefined &&
    a.unique === undefined &&
    (a.accepted_values === undefined || a.accepted_values.length === 0) &&
    a.min === undefined &&
    a.max === undefined
  );
}

function countAssertions(a: ColumnAssertions): number {
  let n = 0;
  if (a.not_null) n++;
  if (a.unique) n++;
  if (a.accepted_values && a.accepted_values.length > 0) n++;
  if (a.min !== undefined) n++;
  if (a.max !== undefined) n++;
  return n;
}

function pruneEmptyAssertions(a: ColumnAssertions): ColumnAssertions | null {
  const cleaned: ColumnAssertions = {};
  if (a.not_null) cleaned.not_null = true;
  if (a.unique) cleaned.unique = true;
  if (a.accepted_values && a.accepted_values.length > 0) {
    cleaned.accepted_values = a.accepted_values;
  }
  if (a.min !== undefined) cleaned.min = a.min;
  if (a.max !== undefined) cleaned.max = a.max;
  return isEmptyAssertions(cleaned) ? null : cleaned;
}

function stripAssertions(c: ColumnSchema): ColumnSchema {
  const { assertions: _drop, ...rest } = c;
  return rest;
}

export default AnalyticTableEditor;
