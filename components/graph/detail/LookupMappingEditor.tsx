// Structural editor for a Lookup_Mapping.
//
// repeating row editor where each row has:
//   - `input_patterns[]` (edited as removable chips; add via Enter/comma,
//     remove via each chip's ✕ or Backspace on an empty input)
//   - `output`
//   - optional `priority` (tie-breaker; highest matching row wins)
//
// Shows an inline error iff any row has an empty `input_patterns` array or
// contains an empty-string pattern. Validation uses
// `validateLookupMapping` so the pure predicate and the DOM stay in sync.

import { useMemo } from "react";
import type { LookupCatchAll, LookupMapping, LookupRow } from "@/lib/types/config";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { ChipListEditor } from "@/components/ui/ChipListEditor";
import {
  EditorField,
  InlineErrorList,
  inputClass,
} from "./editorPrimitives";
import {
  validateLookupMapping,
  type ValidationResult,
} from "./validation";

export interface LookupMappingEditorProps {
  value: LookupMapping;
  onChange: (next: LookupMapping) => void;
  onValidate?: (result: ValidationResult) => void;
}

export const LOOKUP_MAPPING_EDITOR_ERROR_TESTID =
  "lookup-mapping-editor-error";

export function LookupMappingEditor({
  value,
  onChange,
  onValidate,
}: LookupMappingEditorProps) {
  const result = useMemo(() => validateLookupMapping(value), [value]);
  if (onValidate) onValidate(result);

  const setRow = (index: number, row: LookupRow) => {
    const rows = value.rows.map((r, i) => (i === index ? row : r));
    onChange({ ...value, rows });
  };
  const addRow = () => {
    const row: LookupRow = { input_patterns: [], output: "" };
    onChange({ ...value, rows: [...value.rows, row] });
  };
  const removeRow = (index: number) => {
    onChange({ ...value, rows: value.rows.filter((_, i) => i !== index) });
  };
  const setCatchAll = (catch_all: LookupCatchAll | undefined) => {
    if (catch_all === undefined) {
      // Drop the field entirely so the persisted JSON stays minimal.
      const { catch_all: _drop, ...rest } = value;
      onChange(rest);
    } else {
      onChange({ ...value, catch_all });
    }
  };

  return (
    <div
      data-testid="lookup-mapping-editor"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Rows ({value.rows.length})
        </span>
        <button
          type="button"
          data-testid="lookup-mapping-editor-add-row"
          onClick={addRow}
          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
        >
          + Add row
        </button>
      </div>
      {value.rows.length === 0 ? (
        <p className="text-xs text-gray-400">No rows</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {value.rows.map((row, i) => (
            <li
              key={i}
              data-testid="lookup-mapping-editor-row"
              className="rounded border border-gray-200 bg-gray-50 p-2"
            >
              <LookupRowEditor
                index={i}
                value={row}
                onChange={(next) => setRow(i, next)}
                onRemove={() => removeRow(i)}
              />
            </li>
          ))}
        </ul>
      )}
      <CatchAllEditor value={value.catch_all} onChange={setCatchAll} />
      <InlineErrorList
        errors={result.errors}
        testId={LOOKUP_MAPPING_EDITOR_ERROR_TESTID}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-row editor
// ---------------------------------------------------------------------------

interface LookupRowEditorProps {
  index: number;
  value: LookupRow;
  onChange: (next: LookupRow) => void;
  onRemove: () => void;
}

function LookupRowEditor({
  index,
  value,
  onChange,
  onRemove,
}: LookupRowEditorProps) {
  const setPatterns = (input_patterns: string[]) =>
    onChange({ ...value, input_patterns });

  const setOutput = (output: string) => onChange({ ...value, output });
  const setPriority = (priority: string) => {
    // Empty input clears the field (back to default 0). Non-numeric input is
    // ignored so the editor never persists NaN.
    if (priority === "") {
      const { priority: _drop, ...rest } = value;
      onChange(rest);
      return;
    }
    const parsed = Number(priority);
    if (Number.isInteger(parsed)) onChange({ ...value, priority: parsed });
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <EditorField label="input_patterns" className="min-w-[200px] flex-1">
        <ChipListEditor
          ariaLabel={`row ${index} input_patterns`}
          value={value.input_patterns}
          onChange={setPatterns}
          placeholder="Add pattern…"
        />
      </EditorField>
      <EditorField label="output">
        <input
          aria-label={`row ${index} output`}
          className={inputClass()}
          value={value.output}
          onChange={(e) => setOutput(e.target.value)}
        />
      </EditorField>
      <EditorField label="priority">
        <input
          type="number"
          step="1"
          aria-label={`row ${index} priority`}
          className={inputClass("w-20")}
          value={value.priority ?? ""}
          placeholder="0"
          onChange={(e) => setPriority(e.target.value)}
        />
      </EditorField>
      <DeleteButton
        label={`remove row ${index}`}
        onClick={onRemove}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catch-all editor
// ---------------------------------------------------------------------------

interface CatchAllEditorProps {
  value: LookupCatchAll | undefined;
  onChange: (next: LookupCatchAll | undefined) => void;
}

/**
 * Collapsible catch-all section. Off: no field persisted, misses yield null.
 * On: the `output` value fires when no row matches.
 */
function CatchAllEditor({ value, onChange }: CatchAllEditorProps) {
  const enabled = value !== undefined;

  const toggle = (on: boolean) => {
    if (on) onChange({ output: value?.output ?? "" });
    else onChange(undefined);
  };

  return (
    <div
      data-testid="lookup-mapping-editor-catch-all"
      className="rounded border border-gray-200 bg-gray-50 p-2"
    >
      <label className="flex items-center gap-1.5 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          data-testid="lookup-mapping-editor-catch-all-toggle"
        />
        <span className="font-semibold">Catch-all output</span>
        <span className="text-gray-400">
          {enabled ? "" : "- defaults to null on miss"}
        </span>
      </label>
      {enabled && value && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <EditorField label="output">
            <input
              aria-label="catch_all output"
              data-testid="lookup-mapping-editor-catch-all-output"
              className={inputClass()}
              value={value.output}
              onChange={(e) =>
                onChange({ ...value, output: e.target.value })
              }
            />
          </EditorField>
        </div>
      )}
    </div>
  );
}

export default LookupMappingEditor;
