// Structural editor for a Mapping's output columns, display-first.
// The column set mirrors the connected table's schema; the mapping
// authors only the expressions, parsed and committed on blur.

import { useEffect, useMemo, useState } from "react";
import type { AstNode, Mapping, MappingColumn } from "@/lib/types/config";
import { astExpression } from "../astSummary";
import { parseExpression } from "@/lib/graph/expressionParser";
import { useGraphStore } from "@/lib/graph/store";
import { ExpressionField } from "./ExpressionField";
import { InspRow, kvInputClass, Section } from "./inspector";
import { inputClass } from "./editorPrimitives";
import { validateMapping } from "./validation";

export interface MappingEditorProps {
  value: Mapping;
  onChange: (next: Mapping) => void;
}

export const MAPPING_COLUMN_EDITOR_TESTID = "mapping-column-editor";
export const AST_JSON_PARSE_ERROR_TESTID = "ast-json-parse-error";
export const MAPPING_EDITOR_UNCONNECTED_TESTID = "mapping-editor-unconnected";

export function MappingEditor({ value, onChange }: MappingEditorProps) {
  const validationResult = useMemo(() => validateMapping(value), [value]);

  const table = useGraphStore((s) =>
    value.analytic_table_id
      ? s.config?.analytic_tables.find((t) => t.id === value.analytic_table_id) ?? null
      : null,
  );

  // Entity selector (not a derived array) so Object.is holds between
  // renders; three-state semantics documented on `validateExprText`.
  const source = useGraphStore((s) => {
    if (!value.source_container_id) return undefined;
    return s.config?.source_containers.find((c) => c.id === value.source_container_id) ?? null;
  });
  const lookups = useGraphStore((s) => s.config?.lookup_mappings);
  const lookupIds = useMemo(() => (lookups ?? []).map((l) => l.id), [lookups]);
  const sourceColumns = useMemo<string[] | null | undefined>(() => {
    if (source === undefined) return undefined;
    if (source === null) return null;
    return source.schema.map((c) => c.name);
  }, [source]);

  const setColumn = (index: number, column: MappingColumn) => {
    const columns = value.columns.map((c, i) => (i === index ? column : c));
    onChange({ ...value, columns });
  };

  const hasErrors = useMemo(
    () => value.columns.some((c) => columnHasError(c, sourceColumns)),
    [value.columns, sourceColumns],
  );

  const shownErrors = validationResult.errors.filter((e) => table || !/analytic table/i.test(e));

  return (
    <div data-testid="mapping-editor" className="flex flex-col">
      <Section label="Name">
        <input
          aria-label="mapping name"
          className={kvInputClass()}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Section>

      {shownErrors.length > 0 && (
        <ul className="mb-3.5 rounded-[7px] border border-amber-200/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          {shownErrors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {!table ? (
        <div
          data-testid={MAPPING_EDITOR_UNCONNECTED_TESTID}
          className="flex flex-col gap-2 rounded-[7px] border border-dashed border-[color:var(--color-rule)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-3)]"
        >
          <p className="font-semibold text-[color:var(--color-ink-2)]">No final table connected</p>
          <p>Connect this mapping to an analytic table in the graph to define its output columns.</p>
        </div>
      ) : (
        <>
          <Section label="Writes to">
            <InspRow label="Table">{table.name || table.id}</InspRow>
            {source && <InspRow label="Source">{source.name || source.id}</InspRow>}
            {hasErrors && (
              <p className="pt-1 text-[11px] text-[color:var(--color-rose-deep)]">
                Fix expression errors before saving
              </p>
            )}
          </Section>

          <Section label={`Columns (${value.columns.length})`} last>
            {value.columns.length === 0 ? (
              <p className="text-xs text-[color:var(--color-ink-3)]">No columns</p>
            ) : (
              <div className="-mx-1.5 flex flex-col">
                {value.columns.map((col, i) => (
                  <ColumnExprRow
                    key={`${i}-${col.name}`}
                    value={col}
                    onChange={(next) => setColumn(i, next)}
                    sourceColumns={sourceColumns}
                    lookupIds={lookupIds}
                  />
                ))}
              </div>
            )}
            <p className="mt-2.5 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
              Column set comes from{" "}
              <span className="text-[color:var(--color-ink-2)]">{table.name || table.id}</span>
              &apos;s schema; add or remove columns there. New columns appear here unmapped.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

/**
 * Parse `text` and check every `col` reference against the source schema.
 * `sourceColumns`: `string[]` = validate against the set; `null` = source
 * deleted (all refs broken); `undefined` = no source configured.
 */
function validateExprText(
  text: string,
  sourceColumns: string[] | null | undefined,
): string | null {
  const result = parseExpression(text);
  if (!result.ok) return result.error;
  const refs = collectColRefs(result.value);
  if (sourceColumns === undefined) {
    if (refs.length === 0) return null;
    return `No source container connected; col(${[...new Set(refs)].join(", ")}) cannot be resolved`;
  }
  if (sourceColumns === null) {
    if (refs.length === 0) return null;
    return `Source container is missing or deleted; col(${[...new Set(refs)].join(", ")}) cannot be resolved`;
  }
  const unknown = refs.filter((r) => !sourceColumns.includes(r));
  if (unknown.length > 0) {
    return `Unknown source column(s): ${[...new Set(unknown)].join(", ")}`;
  }
  return null;
}

function columnHasError(
  col: MappingColumn,
  sourceColumns: string[] | null | undefined,
): boolean {
  return validateExprText(astExpression(col.expr), sourceColumns) !== null;
}

function collectColRefs(node: AstNode): string[] {
  if (node.kind === "col") return [node.name];
  const refs: string[] = [];
  for (const v of Object.values(node)) {
    if (v && typeof v === "object" && "kind" in v) refs.push(...collectColRefs(v as AstNode));
    if (Array.isArray(v)) for (const item of v) if (item && typeof item === "object" && "kind" in item) refs.push(...collectColRefs(item as AstNode));
  }
  return refs;
}

interface ColumnExprRowProps {
  value: MappingColumn;
  onChange: (next: MappingColumn) => void;
  sourceColumns: string[] | null | undefined;
  lookupIds: string[];
}

function ColumnExprRow({ value, onChange, sourceColumns, lookupIds }: ColumnExprRowProps) {
  // Placeholder columns from schema adds carry a bare null expression.
  const unmapped = value.expr.kind === "null";
  const [open, setOpen] = useState(unmapped);
  const [exprText, setExprText] = useState(() => (unmapped ? "" : astExpression(value.expr)));

  // Reset local text if the persisted value changes underneath us.
  const persistedText = astExpression(value.expr);
  useEffect(() => {
    setExprText(value.expr.kind === "null" ? "" : persistedText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedText]);

  const error = useMemo(
    () => (exprText === "" ? null : validateExprText(exprText, sourceColumns)),
    [exprText, sourceColumns],
  );

  const handleBlur = () => {
    if (exprText === "") return;
    const result = parseExpression(exprText);
    if (result.ok && error === null) {
      onChange({ ...value, expr: result.value });
    }
  };

  return (
    <div data-testid={MAPPING_COLUMN_EDITOR_TESTID} className="rounded-[7px]">
      <button
        type="button"
        title="Edit expression"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] text-left hover:bg-white/[0.03]"
      >
        <span className="flex-none font-mono text-xs text-[color:var(--color-ink)]">{value.name}</span>
        <span
          className={`min-w-0 flex-1 truncate text-right text-[10.5px] ${
            unmapped && exprText === ""
              ? "italic text-[color:var(--color-amber, #ffcd29)]"
              : "font-mono text-[color:var(--color-ink-3)]"
          }`}
        >
          {unmapped && exprText === "" ? "unmapped" : exprText || persistedText}
        </span>
      </button>
      {open && (
        <div className="px-1.5 pb-2.5 pt-1">
          <ExpressionField
            ariaLabel="expression"
            value={exprText}
            onChange={setExprText}
            onCommit={handleBlur}
            error={error}
            modalTitle={`Expression: ${value.name}`}
            sourceColumns={sourceColumns}
            lookupIds={lookupIds}
            inputClassName={inputClass(
              `font-mono w-full ${error ? "border-[color:var(--color-rose-deep)]" : ""}`,
            )}
          />
          {error && (
            <p
              data-testid={AST_JSON_PARSE_ERROR_TESTID}
              className="mt-1 text-[11px] text-[color:var(--color-rose-deep)]"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default MappingEditor;
