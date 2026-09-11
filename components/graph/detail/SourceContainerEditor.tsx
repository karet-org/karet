// `path_prefix` is an absolute lake key prefix; browse lists /api/lake folders.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnSchema, SourceContainer, SourceFormat } from "@/lib/types/config";
import { InlineErrorList } from "./editorPrimitives";
import LakeFolderField from "./LakeFolderField";
import {
  EditField,
  kvInputClass,
  editInputClass,
  LabelButton,
  PlusIcon,
  Section,
  TrashIcon,
} from "./inspector";
import {
  KNOWN_COLUMN_TYPES,
  validateSourceContainer,
  type ValidationResult,
} from "./validation";

interface SourceContainerEditorProps {
  value: SourceContainer;
  onChange: (next: SourceContainer) => void;
  onValidate?: (result: ValidationResult) => void;
}

export const SOURCE_CONTAINER_EDITOR_ERROR_TESTID = "source-container-editor-error";

const formatBlurb: Record<SourceFormat, string> = {
  csv: "CSV files",
  ndjson: "JSON-lines files (.json, .jsonl, .ndjson): one object per line",
};

function SourceContainerEditor({ value, onChange, onValidate }: SourceContainerEditorProps) {
  const result = useMemo(() => validateSourceContainer(value), [value]);
  if (onValidate) onValidate(result);

  const [editingRow, setEditingRow] = useState<number | null>(null);

  const format: SourceFormat = value.format ?? "csv";
  const isJson = format !== "csv";

  const setColumn = (index: number, patch: Partial<ColumnSchema>) => {
    const schema = value.schema.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...value, schema });
  };
  const addColumn = () => {
    onChange({ ...value, schema: [...value.schema, { name: "", type: "string" }] });
    setEditingRow(value.schema.length);
  };
  const removeColumn = (index: number) => {
    setEditingRow(null);
    onChange({ ...value, schema: value.schema.filter((_, i) => i !== index) });
  };

  return (
    <div data-testid="source-container-editor" className="flex flex-col">
      <Section label="Name">
        <input
          data-testid="source-container-editor-name"
          aria-label="source name"
          className={kvInputClass()}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Section>

      <Section label="Lake folder">
        <LakeFolderField
          value={value.path_prefix}
          onChange={(path_prefix) => onChange({ ...value, path_prefix })}
        />
        <p className="mt-1.5 text-[10.5px] text-[color:var(--color-ink-3)]">
          Any folder in the data lake; {formatBlurb[format]} under it feed this source.
        </p>
      </Section>

      <Section label="Format">
        <select
          aria-label="source format"
          className={kvInputClass()}
          value={format}
          onChange={(e) => {
            const next = e.target.value as SourceFormat;
            if (next === "csv") {
              // Paths are meaningless for CSV: columns bind to headers.
              const { record_filter: _drop, ...rest } = value;
              onChange({
                ...rest,
                format: next,
                schema: value.schema.map(({ path: _p, ...c }) => c),
              });
            } else {
              onChange({ ...value, format: next });
            }
          }}
        >
          <option value="csv">CSV</option>
          <option value="ndjson">JSON lines (NDJSON)</option>
        </select>
        {isJson && (
          <p className="mt-1.5 text-[10.5px] text-[color:var(--color-ink-3)]">
            Columns bind to a path inside each record, e.g.{" "}
            <code>request.headers.User-Agent[0]</code>. Missing paths read as null.
          </p>
        )}
      </Section>

      <Section
        label={
          <>
            Schema ({value.schema.length})
            <LabelButton
              title="Add column"
              testId="source-container-editor-add-column"
              onClick={addColumn}
            >
              <PlusIcon />
            </LabelButton>
          </>
        }
        last
      >
        {value.schema.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">No columns</p>
        ) : (
          <div className="-mx-1.5 flex flex-col">
            {value.schema.map((col, i) =>
              editingRow === i ? (
                <div
                  key={i}
                  data-testid="source-container-editor-column-row"
                  className="my-1 rounded-lg bg-[color:var(--color-surface-2)] p-2"
                >
                  <div className="flex items-end gap-1.5">
                    <EditField label="name" className="flex-1">
                      <input
                        aria-label={`column ${i} name`}
                        className={editInputClass("font-mono")}
                        value={col.name}
                        onChange={(e) => setColumn(i, { name: e.target.value })}
                      />
                    </EditField>
                    {isJson && (
                      <EditField label="path" className="flex-1">
                        <input
                          aria-label={`column ${i} path`}
                          className={editInputClass("font-mono")}
                          placeholder={col.name}
                          value={col.path ?? ""}
                          onChange={(e) =>
                            setColumn(i, { path: e.target.value || undefined })
                          }
                        />
                      </EditField>
                    )}
                    <EditField label="type">
                      <select
                        aria-label={`column ${i} type`}
                        className={editInputClass("w-[86px]")}
                        value={col.type}
                        onChange={(e) => setColumn(i, { type: e.target.value })}
                      >
                        {!KNOWN_COLUMN_TYPES.includes(col.type as (typeof KNOWN_COLUMN_TYPES)[number]) && (
                          <option value={col.type}>{col.type}</option>
                        )}
                        {KNOWN_COLUMN_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </EditField>
                    <button
                      type="button"
                      aria-label={`remove column ${i}`}
                      title="Delete column"
                      onClick={() => removeColumn(i)}
                      className="mb-[3px] grid h-6 w-6 flex-none place-items-center rounded-md text-[color:var(--color-ink-3)] hover:bg-white/5 hover:text-[color:var(--color-rose-deep)]"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingRow(null)}
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
                  title="Edit column"
                  data-testid="source-container-editor-column-row"
                  onClick={() => setEditingRow(i)}
                  onKeyDown={(e) => e.key === "Enter" && setEditingRow(i)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-[color:var(--color-ink)]">
                    {col.name || "(unnamed)"}
                  </span>
                  <span className="text-[11px] font-medium text-[color:var(--color-ink)]">
                    {col.type}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
        <div className="mt-2">
          <InlineErrorList errors={result.errors} testId={SOURCE_CONTAINER_EDITOR_ERROR_TESTID} />
        </div>
      </Section>
    </div>
  );
}

/** Folder input with a /api/lake browse dropdown; free text always works. */

export default SourceContainerEditor;
