// Structural editor for a Lookup node (renamed from "lookup mapping",
// which collided with mapping nodes), display-first.
//
// Rules render as quiet pattern-to-output rows; clicking one opens it
// in place with the pattern chips, output, and priority (highest
// matching rule wins, definition order breaks ties). Catch-all is its
// own section: a fixed output on miss, or cleared so misses yield null.
//
// Validation (empty patterns) uses `validateLookupMapping` so the pure
// predicate and the DOM error indicator stay in sync.

import { useMemo, useState } from "react";
import type { LookupCatchAll, LookupMapping, LookupRow } from "@/lib/types/config";
import { ChipListEditor } from "@/components/ui/ChipListEditor";
import { InlineErrorList, inputClass } from "./editorPrimitives";
import {
  EditField,
  InspRow,
  kvInputClass,
  editInputClass,
  LabelButton,
  PencilIcon,
  PlusIcon,
  Section,
  TrashIcon,
} from "./inspector";
import { validateLookupMapping, type ValidationResult } from "./validation";

export interface LookupMappingEditorProps {
  value: LookupMapping;
  onChange: (next: LookupMapping) => void;
  onValidate?: (result: ValidationResult) => void;
}

export const LOOKUP_MAPPING_EDITOR_ERROR_TESTID = "lookup-mapping-editor-error";

export function LookupMappingEditor({ value, onChange, onValidate }: LookupMappingEditorProps) {
  const result = useMemo(() => validateLookupMapping(value), [value]);
  if (onValidate) onValidate(result);

  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [editingCatchAll, setEditingCatchAll] = useState(false);

  const setRow = (index: number, row: LookupRow) => {
    onChange({ ...value, rows: value.rows.map((r, i) => (i === index ? row : r)) });
  };
  const addRow = () => {
    onChange({ ...value, rows: [...value.rows, { input_patterns: [], output: "" }] });
    setEditingRule(value.rows.length);
  };
  const removeRow = (index: number) => {
    setEditingRule(null);
    onChange({ ...value, rows: value.rows.filter((_, i) => i !== index) });
  };
  const setCatchAll = (catch_all: LookupCatchAll | undefined) => {
    if (catch_all === undefined) {
      const { catch_all: _drop, ...rest } = value;
      onChange(rest);
    } else {
      onChange({ ...value, catch_all });
    }
  };

  return (
    <div data-testid="lookup-mapping-editor" className="flex flex-col">
      <Section label="Name">
        <input
          aria-label="lookup name"
          className={kvInputClass()}
          value={value.name ?? ""}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Section>

      <Section label="Matching">
        <InspRow label="Strategy">{(value.match ?? "keyword_substring").replace(/_/g, " ")}</InspRow>
        <InspRow label="Case">{value.case_insensitive ? "insensitive" : "sensitive"}</InspRow>
      </Section>

      <Section
        label={
          <>
            Rules ({value.rows.length})
            <LabelButton title="Add rule" testId="lookup-mapping-editor-add-row" onClick={addRow}>
              <PlusIcon />
            </LabelButton>
          </>
        }
      >
        {value.rows.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">No rules</p>
        ) : (
          <div className="-mx-1.5 flex flex-col">
            {value.rows.map((row, i) =>
              editingRule === i ? (
                <div
                  key={i}
                  data-testid="lookup-mapping-editor-row"
                  className="my-1 rounded-lg bg-[color:var(--color-surface-2)] p-2"
                >
                  <div className="flex items-end gap-1.5">
                    <EditField label="patterns" className="min-w-0 flex-1">
                      <ChipListEditor
                        ariaLabel={`row ${i} input_patterns`}
                        value={row.input_patterns}
                        onChange={(input_patterns) => setRow(i, { ...row, input_patterns })}
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
                  <div className="mt-2 flex gap-1.5">
                    <EditField label="output" className="flex-1">
                      <input
                        aria-label={`row ${i} output`}
                        className={editInputClass()}
                        value={row.output}
                        onChange={(e) => setRow(i, { ...row, output: e.target.value })}
                      />
                    </EditField>
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
                    <span className="w-6 flex-none" />
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
                  data-testid="lookup-mapping-editor-row"
                  onClick={() => setEditingRule(i)}
                  onKeyDown={(e) => e.key === "Enter" && setEditingRule(i)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--color-ink-2)]">
                    {row.input_patterns.length ? row.input_patterns.join(", ") : "(no patterns)"}
                  </span>
                  <span className="min-w-0 truncate text-xs font-medium text-[color:var(--color-ink)]">
                    {row.output || "…"}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
        <div className="mt-2">
          <InlineErrorList errors={result.errors} testId={LOOKUP_MAPPING_EDITOR_ERROR_TESTID} />
        </div>
      </Section>

      <Section
        label="Catch all"
        last
        action={
          <LabelButton
            title="Edit catch all"
            testId="lookup-mapping-editor-catch-all-toggle"
            active={editingCatchAll}
            onClick={() => setEditingCatchAll((v) => !v)}
          >
            <PencilIcon />
          </LabelButton>
        }
      >
        <div data-testid="lookup-mapping-editor-catch-all">
          {editingCatchAll ? (
            <input
              aria-label="catch_all output"
              data-testid="lookup-mapping-editor-catch-all-output"
              className={kvInputClass()}
              placeholder="empty: miss yields null"
              value={value.catch_all?.output ?? ""}
              onChange={(e) =>
                setCatchAll(e.target.value === "" ? undefined : { output: e.target.value })
              }
            />
          ) : (
            <InspRow label="On no match">{value.catch_all?.output ?? "null"}</InspRow>
          )}
        </div>
      </Section>
    </div>
  );
}

export default LookupMappingEditor;
