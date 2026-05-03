// Structural editor for a Lookup_Mapping.
//
// repeating row editor where each row has:
//   - `input_patterns[]` (comma-separated entry; tokens trimmed of
//     surrounding whitespace but preserved empty if the user types only a
//     comma, so the validator can flag the empty token)
//   - `output`
//   - optional `parent_output`
//
// Shows an inline error iff any row has an empty `input_patterns` array or
// contains an empty-string pattern. Validation uses
// `validateLookupMapping` so the pure predicate and the DOM stay in sync.

import { useMemo } from "react";
import type { LookupCatchAll, LookupMapping, LookupRow } from "@/lib/types/config";
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
    const row: LookupRow = { input_patterns: [""], output: "" };
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
  /**
   * Patterns are typed as comma-separated text. We preserve every token
   * (including empty ones produced by a trailing comma) so the validator
   * can flag empty patterns.
   */
  const patternsText = value.input_patterns.join(", ");
  const setPatterns = (text: string) => {
    const parts = text.split(",").map((p) => p.trim());
    // An empty input means "no patterns"; everything else preserves the
    // user's tokens verbatim so the validator can flag empties.
    const input_patterns = text === "" ? [] : parts;
    onChange({ ...value, input_patterns });
  };

  const setOutput = (output: string) => onChange({ ...value, output });
  const setParentOutput = (parent_output: string) =>
    onChange({
      ...value,
      parent_output: parent_output === "" ? undefined : parent_output,
    });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <EditorField label="input_patterns (comma-separated)">
        <input
          aria-label={`row ${index} input_patterns`}
          className={inputClass("min-w-[160px] font-mono")}
          value={patternsText}
          onChange={(e) => setPatterns(e.target.value)}
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
      <EditorField label="parent_output">
        <input
          aria-label={`row ${index} parent_output`}
          className={inputClass()}
          value={value.parent_output ?? ""}
          onChange={(e) => setParentOutput(e.target.value)}
        />
      </EditorField>
      <button
        type="button"
        aria-label={`remove row ${index}`}
        onClick={onRemove}
        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
      >
        ×
      </button>
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
 * Collapsible catch-all section. When the checkbox is off, the field is
 * absent from the persisted JSON and the worker's matcher returns `None`
 * (null in the output column) on a miss — the original behavior. When
 * on, the user supplies an `output` value that fires whenever no row
 * matched; `parent_output` is optional for child lookups that need it.
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
          <EditorField label="parent_output">
            <input
              aria-label="catch_all parent_output"
              data-testid="lookup-mapping-editor-catch-all-parent-output"
              className={inputClass()}
              value={value.parent_output ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  parent_output:
                    e.target.value === "" ? undefined : e.target.value,
                })
              }
            />
          </EditorField>
        </div>
      )}
    </div>
  );
}

export default LookupMappingEditor;
