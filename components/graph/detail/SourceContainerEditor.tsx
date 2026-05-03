// Structural editor for a Source_Container.
//
// uncontrolled-over-controlled form for name, path_prefix,
// and a repeating column editor (name + type dropdown). Inline error
// indicator is visible iff {@link validateSourceContainer} flags the edit
// as invalid (empty name, empty columns, duplicate column names, or
// unknown type). Save-to-S3 wiring is a separate task (17).
//
// The form is a "structural editor": each change rebuilds a full
// Source_Container value and raises it to the parent via `onChange`, so
// validation always runs against the current draft and the parent owns
// state.

import { useMemo } from "react";
import type { ColumnSchema, SourceContainer } from "@/lib/types/config";
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

export interface SourceContainerEditorProps {
  value: SourceContainer;
  onChange: (next: SourceContainer) => void;
  /** Optional hook for tests / parents that want the validation result. */
  onValidate?: (result: ValidationResult) => void;
}

export const SOURCE_CONTAINER_EDITOR_ERROR_TESTID =
  "source-container-editor-error";

export function SourceContainerEditor({
  value,
  onChange,
  onValidate,
}: SourceContainerEditorProps) {
  const result = useMemo(() => validateSourceContainer(value), [value]);
  if (onValidate) onValidate(result);

  const setName = (name: string) => onChange({ ...value, name });
  const setPathPrefix = (path_prefix: string) =>
    onChange({ ...value, path_prefix });

  const setColumnName = (index: number, name: string) => {
    const schema = value.schema.map((c, i) => (i === index ? { ...c, name } : c));
    onChange({ ...value, schema });
  };
  const setColumnType = (index: number, type: string) => {
    const schema = value.schema.map((c, i) => (i === index ? { ...c, type } : c));
    onChange({ ...value, schema });
  };
  const addColumn = () => {
    const next: ColumnSchema = { name: "", type: "string" };
    onChange({ ...value, schema: [...value.schema, next] });
  };
  const removeColumn = (index: number) => {
    const schema = value.schema.filter((_, i) => i !== index);
    onChange({ ...value, schema });
  };

  return (
    <div
      data-testid="source-container-editor"
      className="flex flex-col gap-3"
    >
      <EditorField label="name">
        <input
          data-testid="source-container-editor-name"
          className={inputClass()}
          value={value.name}
          onChange={(e) => setName(e.target.value)}
        />
      </EditorField>
      <EditorField label="path_prefix">
        <input
          data-testid="source-container-editor-path-prefix"
          className={inputClass("font-mono")}
          value={value.path_prefix}
          onChange={(e) => setPathPrefix(e.target.value)}
        />
      </EditorField>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Schema</span>
          <button
            type="button"
            data-testid="source-container-editor-add-column"
            onClick={addColumn}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
          >
            + Add column
          </button>
        </div>
        {value.schema.length === 0 ? (
          <p className="text-xs text-gray-400">No columns</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {value.schema.map((col, i) => (
              <li
                key={i}
                data-testid="source-container-editor-column-row"
                className="flex items-center gap-1.5"
              >
                <input
                  aria-label={`column ${i} name`}
                  className={inputClass("flex-1 font-mono")}
                  value={col.name}
                  onChange={(e) => setColumnName(i, e.target.value)}
                />
                <select
                  aria-label={`column ${i} type`}
                  className={inputClass("w-24")}
                  value={col.type}
                  onChange={(e) => setColumnType(i, e.target.value)}
                >
                  {/* Always include the current value so "unknown" types are
                      still shown and flagged by the validator rather than
                      silently coerced. */}
                  {!KNOWN_COLUMN_TYPES.includes(
                    col.type as (typeof KNOWN_COLUMN_TYPES)[number],
                  ) && <option value={col.type}>{col.type}</option>}
                  {KNOWN_COLUMN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`remove column ${i}`}
                  onClick={() => removeColumn(i)}
                  className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <InlineErrorList
        errors={result.errors}
        testId={SOURCE_CONTAINER_EDITOR_ERROR_TESTID}
      />
    </div>
  );
}

export default SourceContainerEditor;
