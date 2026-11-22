// `path_prefix` is an absolute lake key prefix; browse lists /api/lake folders.

import { useMemo, useState } from "react";
import type { ColumnSchema, SourceContainer, SourceFormat } from "@/lib/types/config";
import { InlineErrorList } from "./editorPrimitives";
import LakeFolderField from "./LakeFolderField";
import {
  ColumnEditCard,
  EditField,
  kvInputClass,
  editInputClass,
  LabelButton,
  PlusIcon,
  Section,
} from "./inspector";
import { validateSourceContainer, type ValidationResult } from "./validation";

interface SourceContainerEditorProps {
  value: SourceContainer;
  onChange: (next: SourceContainer) => void;
  onValidate?: (result: ValidationResult) => void;
}

export const SOURCE_CONTAINER_EDITOR_ERROR_TESTID = "source-container-editor-error";

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
          Any folder in the data lake. Files under it matching the format below feed
          this source.
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
          <option value="csv">CSV (.csv)</option>
          <option value="ndjson">JSON lines (.json, .jsonl, .ndjson)</option>
        </select>
      </Section>

      <Section label="Raw file retention">
        <div className="flex items-center gap-2">
          <div className="w-24">
            <input
              aria-label="raw file retention days"
              type="number"
              min={1}
              placeholder="forever"
              className={kvInputClass("font-mono")}
              value={value.retention_days ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  retention_days: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
          <span className="text-xs text-[color:var(--color-ink-2)]">days</span>
        </div>
        <p className="mt-1.5 text-[10.5px] text-[color:var(--color-ink-3)]">
          Deletes raw files this many days after upload, once every mapping has loaded
          them. Rows already in tables are kept. Empty keeps files forever.
        </p>
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
                <ColumnEditCard
                  key={i}
                  index={i}
                  column={col}
                  testId="source-container-editor-column-row"
                  deleteLabel="remove"
                  onChange={(patch) => setColumn(i, patch)}
                  onDelete={() => removeColumn(i)}
                  onDone={() => setEditingRow(null)}
                  beside={
                    isJson && (
                      <EditField label="path" className="flex-1">
                        <input
                          aria-label={`column ${i} path`}
                          className={editInputClass("font-mono")}
                          // Doubles as the syntax hint: dotted keys, [n] for
                          // array indices. Empty means the column name.
                          placeholder={col.name || "request.headers.User-Agent[0]"}
                          title="Path inside each record, e.g. request.headers.User-Agent[0]. Missing paths read as null."
                          value={col.path ?? ""}
                          onChange={(e) =>
                            setColumn(i, { path: e.target.value || undefined })
                          }
                        />
                      </EditField>
                    )
                  }
                />
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

export default SourceContainerEditor;
