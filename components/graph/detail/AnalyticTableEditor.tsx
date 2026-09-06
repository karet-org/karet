// Structural editor for an Analytic_Table, display-first per the
// partition-keys v2 design (doc rev 1.4).
//
// The table owns structure: schema columns (name, type, not-null,
// min/max for numerics), the hive partition_keys (max 2, non-float),
// and the dedup_keys. Mappings own only expressions; schema edits here
// propagate placeholders via the parent's schema-sync (NodeDetailPanel).
//
// Section layout: Name / Output prefix / Partition keys / Dedup keys /
// Schema. Key sections render as quiet rows and switch to chips behind
// the pencil; schema rows edit in place on click.

import { useMemo, useState } from "react";
import type { AnalyticTable, ColumnSchema } from "@/lib/types/config";
import {
  AddChip,
  EditField,
  InspRow,
  KeyChip,
  kvInputClass,
  editInputClass,
  LabelButton,
  PencilIcon,
  PlusIcon,
  Section,
  Switch,
  TrashIcon,
} from "./inspector";
import { InlineErrorList } from "./editorPrimitives";
import { KNOWN_COLUMN_TYPES } from "./validation";

export const ANALYTIC_TABLE_EDITOR_ERROR_TESTID = "analytic-table-editor-error";
export const PARTITION_KEYS_TESTID = "partition-keys-section";
export const DEDUP_KEYS_TESTID = "dedup-keys-section";

const MAX_PARTITION_KEYS = 2;

export interface AnalyticTableEditorProps {
  value: AnalyticTable;
  onChange: (next: AnalyticTable) => void;
}

function validate(t: AnalyticTable): string[] {
  const errors: string[] = [];
  if (!t.name || t.name.trim() === "") errors.push("Name is required");
  if (t.schema.length === 0) errors.push("Schema must have at least one column");
  const seen = new Set<string>();
  for (const c of t.schema) {
    if (seen.has(c.name)) errors.push(`Duplicate column name: ${c.name}`);
    seen.add(c.name);
    if (c.name.trim() === "") errors.push("Column names cannot be empty");
  }
  return errors;
}

/** Placeholder path segment for a key column, derived from its type. */
function placeholder(type: string | undefined): string {
  switch (type) {
    case "int64":
    case "number":
      return "<int64>";
    case "date":
      return "<date>";
    case "bool":
      return "<bool>";
    default:
      return "<string>";
  }
}

export function AnalyticTableEditor({ value, onChange }: AnalyticTableEditorProps) {
  const [editingKeys, setEditingKeys] = useState(false);
  const [editingDedup, setEditingDedup] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);

  const errors = useMemo(() => validate(value), [value]);
  const partitionKeys = value.partition_keys ?? [];
  const dedupKeys = value.dedup_keys ?? [];

  const setKeys = (partition_keys: string[]) =>
    onChange({ ...value, partition_keys: partition_keys.length ? partition_keys : undefined });
  const setDedup = (dedup_keys: string[]) =>
    onChange({ ...value, dedup_keys: dedup_keys.length ? dedup_keys : undefined });

  const typeOf = (name: string) => value.schema.find((c) => c.name === name)?.type;

  // Rename and delete cascade through both key lists; the parent's
  // schema-sync cascades into mapping columns.
  const renameColumn = (index: number, name: string) => {
    const prev = value.schema[index].name;
    const schema = value.schema.map((c, i) => (i === index ? { ...c, name } : c));
    onChange({
      ...value,
      schema,
      partition_keys: partitionKeys.map((k) => (k === prev ? name : k)),
      dedup_keys: dedupKeys.map((k) => (k === prev ? name : k)),
    });
  };
  const retypeColumn = (index: number, type: string) => {
    const name = value.schema[index].name;
    const schema = value.schema.map((c, i) => (i === index ? { ...c, type } : c));
    onChange({
      ...value,
      schema,
      // Floats are ineligible partition keys; the chip disappears with
      // the retype and the path preview updates in the same frame.
      partition_keys:
        type === "float64" ? partitionKeys.filter((k) => k !== name) : value.partition_keys,
    });
  };
  const deleteColumn = (index: number) => {
    const name = value.schema[index].name;
    setEditingRow(null);
    onChange({
      ...value,
      schema: value.schema.filter((_, i) => i !== index),
      partition_keys: partitionKeys.filter((k) => k !== name),
      dedup_keys: dedupKeys.filter((k) => k !== name),
    });
  };
  const addColumn = () => {
    onChange({ ...value, schema: [...value.schema, { name: "new_column", type: "string" }] });
    setEditingRow(value.schema.length);
  };

  const setAssertion = (index: number, patch: Partial<NonNullable<ColumnSchema["assertions"]>>) => {
    const schema = value.schema.map((c, i) => {
      if (i !== index) return c;
      const merged = { ...c.assertions, ...patch };
      const active = merged.not_null || merged.min !== undefined || merged.max !== undefined;
      return { ...c, assertions: active ? merged : undefined };
    });
    onChange({ ...value, schema });
  };

  const pathPreview = (
    <div className="mt-1.5 truncate font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
      {value.id}/
      {partitionKeys.map((k) => (
        <span key={k}>
          {k}=<span className="text-[color:var(--color-ink-2)]">{placeholder(typeOf(k))}</span>/
        </span>
      ))}
      {"<mapping>"}.parquet
    </div>
  );

  return (
    <div data-testid="analytic-table-editor" className="flex flex-col">
      <Section label="Name">
        <input
          aria-label="table name"
          className={kvInputClass()}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Section>

      <Section label="Output prefix">
        <input
          aria-label="output prefix"
          className={kvInputClass("font-mono")}
          value={value.output_prefix}
          onChange={(e) => onChange({ ...value, output_prefix: e.target.value })}
        />
      </Section>

      <Section
        label="Partition keys"
        action={
          <LabelButton
            title="Edit partition keys"
            testId="edit-partition-keys"
            active={editingKeys}
            onClick={() => setEditingKeys((v) => !v)}
          >
            <PencilIcon />
          </LabelButton>
        }
      >
        <div data-testid={PARTITION_KEYS_TESTID}>
          {editingKeys ? (
            <div className="flex flex-wrap gap-1.5">
              {partitionKeys.map((k) => (
                <KeyChip key={k} name={k} onRemove={() => setKeys(partitionKeys.filter((x) => x !== k))} />
              ))}
              {partitionKeys.length < MAX_PARTITION_KEYS && (
                <AddChip
                  label="Add key"
                  emptyNote="No eligible columns left"
                  options={value.schema
                    .filter((c) => c.type !== "float64" && !partitionKeys.includes(c.name))
                    .map((c) => ({ name: c.name, note: c.type }))}
                  onPick={(name) => setKeys([...partitionKeys, name])}
                />
              )}
            </div>
          ) : (
            <InspRow label="Keys">{partitionKeys.length ? partitionKeys.join(", ") : "none"}</InspRow>
          )}
          {pathPreview}
        </div>
      </Section>

      <Section
        label="Dedup keys"
        action={
          <LabelButton
            title="Edit dedup keys"
            testId="edit-dedup-keys"
            active={editingDedup}
            onClick={() => setEditingDedup((v) => !v)}
          >
            <PencilIcon />
          </LabelButton>
        }
      >
        <div data-testid={DEDUP_KEYS_TESTID}>
          {editingDedup ? (
            <div className="flex flex-wrap gap-1.5">
              {dedupKeys.map((k) => (
                <KeyChip key={k} name={k} onRemove={() => setDedup(dedupKeys.filter((x) => x !== k))} />
              ))}
              <AddChip
                label="Add key"
                emptyNote="No columns left"
                options={value.schema
                  .filter((c) => !dedupKeys.includes(c.name))
                  .map((c) => ({ name: c.name, note: c.type }))}
                onPick={(name) => setDedup([...dedupKeys, name])}
              />
            </div>
          ) : (
            <InspRow label="Keys">{dedupKeys.length ? dedupKeys.join(", ") : "none"}</InspRow>
          )}
        </div>
      </Section>

      <Section
        label={
          <>
            Schema ({value.schema.length})
            <LabelButton title="Add column" testId="add-schema-column" onClick={addColumn}>
              <PlusIcon />
            </LabelButton>
          </>
        }
        action={<span className="text-[9.5px]">not null</span>}
        last
      >
        <div className="-mx-1.5">
          {value.schema.map((col, i) => {
            const numeric = col.type === "int64" || col.type === "float64" || col.type === "number";
            if (editingRow === i) {
              return (
                <div
                  key={i}
                  className="my-1 rounded-lg bg-[color:var(--color-surface-2)] p-2"
                  data-testid="schema-column-editing"
                >
                  <div className="flex items-end gap-1.5">
                    <EditField label="name" className="flex-1">
                      <input
                        aria-label={`column ${i} name`}
                        className={editInputClass("font-mono")}
                        value={col.name}
                        onChange={(e) => renameColumn(i, e.target.value)}
                      />
                    </EditField>
                    <EditField label="type">
                      <select
                        aria-label={`column ${i} type`}
                        className={editInputClass("w-[86px]")}
                        value={col.type}
                        onChange={(e) => retypeColumn(i, e.target.value)}
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
                      aria-label={`delete column ${i}`}
                      title="Delete column"
                      onClick={() => deleteColumn(i)}
                      className="mb-[3px] grid h-6 w-6 flex-none place-items-center rounded-md text-[color:var(--color-ink-3)] hover:bg-white/5 hover:text-[color:var(--color-rose-deep)]"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {numeric && (
                    <div className="mt-2 flex gap-1.5">
                      <EditField label="min" className="flex-1">
                        <input
                          aria-label={`column ${i} min`}
                          type="number"
                          className={editInputClass("font-mono")}
                          value={col.assertions?.min ?? ""}
                          onChange={(e) =>
                            setAssertion(i, {
                              min: e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </EditField>
                      <EditField label="max" className="flex-1">
                        <input
                          aria-label={`column ${i} max`}
                          type="number"
                          className={editInputClass("font-mono")}
                          value={col.assertions?.max ?? ""}
                          onChange={(e) =>
                            setAssertion(i, {
                              max: e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </EditField>
                      <span className="w-6 flex-none" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingRow(null)}
                    className="mt-2 text-[10.5px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                  >
                    Done
                  </button>
                </div>
              );
            }
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                title="Edit column"
                data-testid="schema-column-row"
                onClick={() => setEditingRow(i)}
                onKeyDown={(e) => e.key === "Enter" && setEditingRow(i)}
                className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] hover:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-[color:var(--color-ink)]">
                  {col.name}
                </span>
                <span className="text-[11px] text-[color:var(--color-ink-3)]">{col.type}</span>
                <Switch
                  on={col.assertions?.not_null === true}
                  title={`Not null: ${col.name}`}
                  onToggle={() => setAssertion(i, { not_null: col.assertions?.not_null ? undefined : true })}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2">
          <InlineErrorList errors={errors} testId={ANALYTIC_TABLE_EDITOR_ERROR_TESTID} />
        </div>
      </Section>
    </div>
  );
}

export default AnalyticTableEditor;
