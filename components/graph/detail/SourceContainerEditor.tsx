// Structural editor for a Source_Container, display-first.
//
// Sections: Name / Lake folder / Schema. The lake folder is an absolute
// key prefix anywhere in the data lake (partition-keys v2 design §7);
// the browse control lists folders from /api/lake so the common case is
// pick-not-type, with free text kept for folders that don't exist yet.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnSchema, SourceContainer } from "@/lib/types/config";
import { InlineErrorList } from "./editorPrimitives";
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

export interface SourceContainerEditorProps {
  value: SourceContainer;
  onChange: (next: SourceContainer) => void;
  onValidate?: (result: ValidationResult) => void;
}

export const SOURCE_CONTAINER_EDITOR_ERROR_TESTID = "source-container-editor-error";

export function SourceContainerEditor({ value, onChange, onValidate }: SourceContainerEditorProps) {
  const result = useMemo(() => validateSourceContainer(value), [value]);
  if (onValidate) onValidate(result);

  const [editingRow, setEditingRow] = useState<number | null>(null);

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
          Any folder in the data lake; CSV files under it feed this source.
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

/**
 * Lake folder input with a browse dropdown listing folders at the
 * current prefix level from /api/lake. Free text always works.
 */
function LakeFolderField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<string[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // List folders under the deepest complete segment of the value.
  const browsePrefix = value.includes("/") ? value.slice(0, value.lastIndexOf("/") + 1) : "";
  useEffect(() => {
    if (!open) return;
    let stale = false;
    setFolders(null);
    fetch(`/api/lake?prefix=${encodeURIComponent(browsePrefix)}`)
      .then((r) => (r.ok ? r.json() : { folders: [] }))
      .then((data: { folders?: string[] }) => {
        if (!stale) setFolders(data.folders ?? []);
      })
      .catch(() => {
        if (!stale) setFolders([]);
      });
    return () => {
      stale = true;
    };
  }, [open, browsePrefix]);

  return (
    <div ref={ref} className="relative flex gap-1.5">
      <input
        data-testid="source-container-editor-path-prefix"
        aria-label="lake folder"
        className={kvInputClass("flex-1 font-mono")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label="browse lake folders"
        onClick={() => setOpen((v) => !v)}
        className="flex-none rounded-[7px] border border-[color:var(--color-rule-soft)] px-2.5 text-[11px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
      >
        Browse
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-10 max-h-56 w-64 overflow-y-auto rounded-[9px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] p-1 shadow-xl">
          {folders === null ? (
            <div className="px-2 py-1.5 text-[11.5px] text-[color:var(--color-ink-3)]">Loading…</div>
          ) : folders.length === 0 ? (
            <div className="px-2 py-1.5 text-[11.5px] text-[color:var(--color-ink-3)]">
              No folders under {browsePrefix || "the lake root"}
            </div>
          ) : (
            folders.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onChange(f);
                }}
                className="block w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-[11.5px] text-[color:var(--color-ink)] hover:bg-white/5"
              >
                {f}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SourceContainerEditor;
