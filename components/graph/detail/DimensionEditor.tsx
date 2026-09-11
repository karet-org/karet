// Dimension inspector: a key-to-value table referenced from mapping
// expressions. Rows come inline from the config or from CSV files in the lake.
// Highest-priority match wins; definition order breaks ties.

import { useMemo, useState } from "react";
import type {
  Dimension,
  InlineDimensionRow,
  MatchMode,
  OnMiss,
} from "@/lib/types/config";
import { inlineDimensionRows, isFileRows } from "@/lib/types/config";
import ChipListEditor from "@/components/ui/ChipListEditor";
import { InlineErrorList } from "./editorPrimitives";
import LakeFolderField from "./LakeFolderField";
import {
  EditField,
  InspRow,
  kvInputClass,
  editInputClass,
  LabelButton,
  PlusIcon,
  Section,
  TrashIcon,
} from "./inspector";
import { validateDimension, type ValidationResult } from "./validation";

interface DimensionEditorProps {
  value: Dimension;
  onChange: (next: Dimension) => void;
  onValidate?: (result: ValidationResult) => void;
}

export const DIMENSION_EDITOR_ERROR_TESTID = "dimension-editor-error";

function DimensionEditor({ value, onChange, onValidate }: DimensionEditorProps) {
  const result = useMemo(() => validateDimension(value), [value]);
  if (onValidate) onValidate(result);

  const [editingRule, setEditingRule] = useState<number | null>(null);
  const fileRows = isFileRows(value.rows);
  const inlineRows = inlineDimensionRows(value.rows);
  const values = value.rows.values;
  const onMiss = value.on_miss ?? "null";

  const setInline = (rows: InlineDimensionRow[]) => {
    if (fileRows) return;
    onChange({ ...value, rows: { values, rows } });
  };
  const setRow = (index: number, row: InlineDimensionRow) =>
    setInline(inlineRows.map((r, i) => (i === index ? row : r)));
  const addRow = () => {
    setInline([...inlineRows, { patterns: [], values: values.map(() => "") }]);
    setEditingRule(inlineRows.length);
  };
  const removeRow = (index: number) => {
    setEditingRule(null);
    setInline(inlineRows.filter((_, i) => i !== index));
  };

  // Switching row source keeps the value column names, which are the contract
  // `dim_ref` expressions bind to.
  const setSource = (next: "inline" | "file") => {
    if (next === "file" && !fileRows) {
      onChange({ ...value, rows: { path_prefix: "", key: "", values } });
    } else if (next === "inline" && fileRows) {
      onChange({ ...value, rows: { values, rows: [] } });
    }
  };

  const setValueColumns = (names: string[]) => {
    if (fileRows) {
      onChange({ ...value, rows: { ...value.rows, values: names } });
    } else {
      // Keep each row's values positionally aligned with the column list.
      onChange({
        ...value,
        rows: {
          values: names,
          rows: inlineRows.map((r) => ({
            ...r,
            values: names.map((_, i) => r.values[i] ?? ""),
          })),
        },
      });
    }
  };

  return (
    <div data-testid="dimension-editor" className="flex flex-col">
      <Section label="Name">
        <input
          aria-label="dimension name"
          className={kvInputClass()}
          value={value.name ?? ""}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Section>

      <Section label="Matching">
        <select
          aria-label="match mode"
          className={kvInputClass()}
          value={value.match ?? "exact"}
          onChange={(e) => onChange({ ...value, match: e.target.value as MatchMode })}
        >
          <option value="exact">Exact key</option>
          <option value="keyword_substring">Keyword substring</option>
        </select>
        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-[color:var(--color-ink-2)]">
          <input
            type="checkbox"
            aria-label="case insensitive"
            checked={value.case_insensitive ?? false}
            onChange={(e) => onChange({ ...value, case_insensitive: e.target.checked })}
          />
          Case insensitive
        </label>
      </Section>

      <Section label="Value columns">
        <ChipListEditor
          ariaLabel="value columns"
          value={values}
          onChange={setValueColumns}
          placeholder="Add column…"
        />
        <p className="mt-1 text-[10.5px] text-[color:var(--color-ink-3)]">
          A <code>dim_ref</code> expression picks one of these; the first is the default.
        </p>
      </Section>

      <Section label="Rows">
        <select
          aria-label="row source"
          className={kvInputClass()}
          value={fileRows ? "file" : "inline"}
          onChange={(e) => setSource(e.target.value as "inline" | "file")}
        >
          <option value="inline">Inline in config</option>
          <option value="file">CSV files in the lake</option>
        </select>
      </Section>

      {isFileRows(value.rows) ? (
        <Section label="Lake folder" last>
          <LakeFolderField
            value={value.rows.path_prefix}
            onChange={(path_prefix) =>
              onChange({ ...value, rows: { ...value.rows, path_prefix } as typeof value.rows })
            }
          />
          <div className="mt-2 flex gap-1.5">
            <EditField label="key column" className="flex-1">
              <input
                aria-label="key column"
                className={editInputClass("font-mono")}
                value={value.rows.key}
                onChange={(e) =>
                  onChange({ ...value, rows: { ...value.rows, key: e.target.value } as typeof value.rows })
                }
              />
            </EditField>
            <EditField label="priority column" className="flex-1">
              <input
                aria-label="priority column"
                className={editInputClass("font-mono")}
                placeholder="optional"
                value={isFileRows(value.rows) ? value.rows.priority_column ?? "" : ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    rows: {
                      ...value.rows,
                      priority_column: e.target.value || undefined,
                    } as typeof value.rows,
                  })
                }
              />
            </EditField>
          </div>
          <div className="mt-2">
            <InlineErrorList errors={result.errors} testId={DIMENSION_EDITOR_ERROR_TESTID} />
          </div>
        </Section>
      ) : (
        <Section
          label={
            <>
              Rules ({inlineRows.length})
              <LabelButton title="Add rule" testId="dimension-editor-add-row" onClick={addRow}>
                <PlusIcon />
              </LabelButton>
            </>
          }
          last
        >
          {inlineRows.length === 0 ? (
            <p className="text-xs text-[color:var(--color-ink-3)]">No rules</p>
          ) : (
            <div className="-mx-1.5 flex flex-col">
              {inlineRows.map((row, i) =>
                editingRule === i ? (
                  <div
                    key={i}
                    data-testid="dimension-editor-row"
                    className="my-1 rounded-lg bg-[color:var(--color-surface-2)] p-2"
                  >
                    <div className="flex items-end gap-1.5">
                      <EditField label="patterns" className="min-w-0 flex-1">
                        <ChipListEditor
                          ariaLabel={`row ${i} patterns`}
                          value={row.patterns}
                          onChange={(patterns) => setRow(i, { ...row, patterns })}
                          placeholder="Add pattern…"
                        />
                      </EditField>
                      <button
                        type="button"
                        aria-label={`remove row ${i}`}
                        title="Delete rule"
                        onClick={() => removeRow(i)}
                        className="mb-[3px] grid h-6 w-6 flex-none place-items-center rounded-md text-[color:var(--color-ink-3)] hover:bg-white/5 hover:text-[color:var(--color-rose-deep)]"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {values.map((columnName, vi) => (
                        <EditField key={columnName} label={columnName} className="min-w-[96px] flex-1">
                          <input
                            aria-label={`row ${i} ${columnName}`}
                            className={editInputClass()}
                            value={row.values[vi] ?? ""}
                            onChange={(e) => {
                              const next = values.map((_, k) =>
                                k === vi ? e.target.value : row.values[k] ?? "",
                              );
                              setRow(i, { ...row, values: next });
                            }}
                          />
                        </EditField>
                      ))}
                      <EditField label="priority" className="w-14 flex-none">
                        <input
                          type="number"
                          step="1"
                          aria-label={`row ${i} priority`}
                          title="Highest matching rule wins"
                          className={editInputClass("font-mono")}
                          value={row.priority ?? ""}
                          placeholder="0"
                          onChange={(e) => {
                            if (e.target.value === "") {
                              const { priority: _drop, ...rest } = row;
                              setRow(i, rest);
                              return;
                            }
                            const parsed = Number(e.target.value);
                            if (Number.isInteger(parsed)) setRow(i, { ...row, priority: parsed });
                          }}
                        />
                      </EditField>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingRule(null)}
                      className="mt-2 text-[10.5px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    title="Edit rule"
                    data-testid="dimension-editor-row"
                    onClick={() => setEditingRule(i)}
                    onKeyDown={(e) => e.key === "Enter" && setEditingRule(i)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--color-ink-2)]">
                      {row.patterns.length ? row.patterns.join(", ") : "(no patterns)"}
                    </span>
                    <span className="min-w-0 truncate text-xs font-medium text-[color:var(--color-ink)]">
                      {row.values[0] || "…"}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
          <div className="mt-2">
            <InlineErrorList errors={result.errors} testId={DIMENSION_EDITOR_ERROR_TESTID} />
          </div>
        </Section>
      )}

      <Section label="On no match" last>
        <select
          aria-label="on miss"
          className={kvInputClass()}
          value={typeof onMiss === "object" ? "literal" : onMiss}
          onChange={(e) => {
            const next = e.target.value;
            onChange({
              ...value,
              on_miss: next === "literal" ? { literal: "" } : (next as OnMiss),
            });
          }}
        >
          <option value="null">null</option>
          <option value="passthrough">Pass the input through</option>
          <option value="literal">A fixed value…</option>
        </select>
        {typeof onMiss === "object" && (
          <input
            aria-label="on miss literal"
            className={kvInputClass("mt-1.5")}
            placeholder="e.g. Uncategorized"
            value={onMiss.literal}
            onChange={(e) => onChange({ ...value, on_miss: { literal: e.target.value } })}
          />
        )}
      </Section>
    </div>
  );
}

export default DimensionEditor;
