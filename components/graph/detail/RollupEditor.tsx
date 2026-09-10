// Rollup inspector: the grain (group_by) and the aggregates it produces.
//
// The target table's partition keys must appear in the grain, so a run can
// recompute one partition at a time; `validateRollup` states that and the
// graph save-time check enforces it against the actual tables.

import { useMemo, useState } from "react";
import type { AggFn, AnalyticTable, Rollup, RollupAggregate } from "@/lib/types/config";
import { aggregateNeedsColumn, aggregateOutputs, isGrainLocked } from "@/lib/types/config";
import ChipListEditor from "@/components/ui/ChipListEditor";
import { InlineErrorList } from "./editorPrimitives";
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
import { validateRollup, type ValidationResult } from "./validation";

interface RollupEditorProps {
  value: Rollup;
  onChange: (next: Rollup) => void;
  onValidate?: (result: ValidationResult) => void;
  /** Tables in the config, for the source/target pickers and column hints. */
  tables?: AnalyticTable[];
}

export const ROLLUP_EDITOR_ERROR_TESTID = "rollup-editor-error";

const AGG_FUNCTIONS: AggFn[] = [
  "count",
  "sum",
  "min",
  "max",
  "avg",
  "count_distinct",
  "median",
];

function RollupEditor({ value, onChange, onValidate, tables = [] }: RollupEditorProps) {
  const source = tables.find((t) => t.id === value.source_table_id);
  const target = tables.find((t) => t.id === value.analytic_table_id);
  const result = useMemo(
    () => validateRollup(value, source, target),
    [value, source, target],
  );
  if (onValidate) onValidate(result);

  const [editing, setEditing] = useState<number | null>(null);

  const setAgg = (index: number, agg: RollupAggregate) =>
    onChange({
      ...value,
      aggregates: value.aggregates.map((a, i) => (i === index ? agg : a)),
    });
  const addAgg = () => {
    onChange({ ...value, aggregates: [...value.aggregates, { name: "", fn: "count" }] });
    setEditing(value.aggregates.length);
  };
  const removeAgg = (index: number) => {
    setEditing(null);
    onChange({ ...value, aggregates: value.aggregates.filter((_, i) => i !== index) });
  };

  return (
    <div data-testid="rollup-editor" className="flex flex-col">
      <Section label="Name">
        <input
          aria-label="rollup name"
          className={kvInputClass()}
          value={value.name ?? ""}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Section>

      <Section label="Tables">
        <div className="flex flex-col gap-1.5">
          <EditField label="reads">
            <select
              aria-label="source table"
              className={editInputClass()}
              value={value.source_table_id}
              onChange={(e) => onChange({ ...value, source_table_id: e.target.value })}
            >
              <option value="">(pick a table)</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id}
                </option>
              ))}
            </select>
          </EditField>
          <EditField label="writes">
            <select
              aria-label="target table"
              className={editInputClass()}
              value={value.analytic_table_id}
              onChange={(e) => onChange({ ...value, analytic_table_id: e.target.value })}
            >
              <option value="">(pick a table)</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id}
                </option>
              ))}
            </select>
          </EditField>
        </div>
      </Section>

      <Section label="Grain">
        <ChipListEditor
          ariaLabel="group by columns"
          value={value.group_by}
          onChange={(group_by) => onChange({ ...value, group_by })}
          placeholder="Add column…"
        />
        {target && target.partition_keys && target.partition_keys.length > 0 ? (
          <InspRow label="Must include">{target.partition_keys.join(", ")}</InspRow>
        ) : null}
      </Section>

      <Section
        label={
          <>
            Aggregates ({value.aggregates.length})
            <LabelButton title="Add aggregate" testId="rollup-editor-add-agg" onClick={addAgg}>
              <PlusIcon />
            </LabelButton>
          </>
        }
        last
      >
        {value.aggregates.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">No aggregates</p>
        ) : (
          <div className="-mx-1.5 flex flex-col">
            {value.aggregates.map((agg, i) =>
              editing === i ? (
                <div
                  key={i}
                  data-testid="rollup-editor-agg"
                  className="my-1 rounded-lg bg-[color:var(--color-surface-2)] p-2"
                >
                  <div className="flex items-end gap-1.5">
                    <EditField label="name" className="min-w-0 flex-1">
                      <input
                        aria-label={`aggregate ${i} name`}
                        className={editInputClass("font-mono")}
                        value={agg.name}
                        onChange={(e) => setAgg(i, { ...agg, name: e.target.value })}
                      />
                    </EditField>
                    <button
                      type="button"
                      aria-label={`remove aggregate ${i}`}
                      title="Delete aggregate"
                      onClick={() => removeAgg(i)}
                      className="mb-[3px] grid h-6 w-6 flex-none place-items-center rounded-md text-[color:var(--color-ink-3)] hover:bg-white/5 hover:text-[color:var(--color-rose-deep)]"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <EditField label="function" className="flex-1">
                      <select
                        aria-label={`aggregate ${i} fn`}
                        className={editInputClass()}
                        value={agg.fn}
                        onChange={(e) => {
                          const fn = e.target.value as AggFn;
                          const next: RollupAggregate = { ...agg, fn };
                          if (!aggregateNeedsColumn(fn)) delete next.column;
                          setAgg(i, next);
                        }}
                      >
                        {AGG_FUNCTIONS.map((fn) => (
                          <option key={fn} value={fn}>
                            {fn}
                          </option>
                        ))}
                      </select>
                    </EditField>
                    {aggregateNeedsColumn(agg.fn) ? (
                      <EditField label="column" className="flex-1">
                        <input
                          aria-label={`aggregate ${i} column`}
                          className={editInputClass("font-mono")}
                          list={source ? `rollup-cols-${value.id}` : undefined}
                          value={agg.column ?? ""}
                          onChange={(e) => setAgg(i, { ...agg, column: e.target.value })}
                        />
                      </EditField>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-[color:var(--color-ink-3)]">
                    Writes {aggregateOutputs(agg).join(" and ")}.
                    {agg.fn === "avg"
                      ? " A sum/count pair stays re-aggregatable; a stored mean does not."
                      : ""}
                    {isGrainLocked(agg)
                      ? " Grain-locked: correct here, but a coarser rollup cannot be built from it."
                      : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
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
                  title="Edit aggregate"
                  data-testid="rollup-editor-agg"
                  onClick={() => setEditing(i)}
                  onKeyDown={(e) => e.key === "Enter" && setEditing(i)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--color-ink-2)]">
                    {aggregateOutputs(agg).join(", ") || "…"}
                  </span>
                  <span className="flex-none text-[10.5px] text-[color:var(--color-ink-3)]">
                    {agg.fn}
                    {agg.column ? `(${agg.column})` : ""}
                    {isGrainLocked(agg) ? " ·locked" : ""}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
        {source ? (
          <datalist id={`rollup-cols-${value.id}`}>
            {source.schema.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        ) : null}
        <div className="mt-2">
          <InlineErrorList errors={result.errors} testId={ROLLUP_EDITOR_ERROR_TESTID} />
        </div>
      </Section>
    </div>
  );
}

export default RollupEditor;
