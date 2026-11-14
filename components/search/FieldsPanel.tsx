// The fields of the searched table. Open a field to see its most common
// values among the matches; pick a value to add it to the search.

import { useEffect, useState } from "react";
import { IconChevronRight, IconMinus } from "@/components/icons";

interface FieldValues {
  total: number;
  values: { value: string; count: number }[];
}

function Values({
  pipeline,
  searchKey,
  field,
  onAdd,
}: {
  pipeline: string;
  searchKey: string;
  field: string;
  onAdd: (field: string, value: string, exclude: boolean) => void;
}) {
  const [data, setData] = useState<FieldValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const params = new URLSearchParams(searchKey);
    params.set("field", field);
    fetch(`/api/p/${pipeline}/search/fields?${params}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setData(body);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [pipeline, searchKey, field]);

  if (error) return <p className="pb-2 pl-7 pr-2 text-[11.5px] text-[color:var(--color-rose-deep)]">{error}</p>;
  if (!data) return <p className="pb-2 pl-7 pr-2 text-[11.5px] text-[color:var(--color-ink-4)]">Loading…</p>;
  if (data.values.length === 0) return <p className="pb-2 pl-7 pr-2 text-[11.5px] text-[color:var(--color-ink-4)]">No values.</p>;

  return (
    <div className="pb-1.5" data-testid={`field-values-${field}`}>
      <ul>
        {data.values.map((v) => {
          const share = data.total ? v.count / data.total : 0;
          return (
            <li key={v.value} className="group relative flex items-center gap-1 pl-7 pr-1 hover:bg-[color:var(--color-surface-2)]">
              <span
                className="absolute inset-y-0.5 left-6 rounded-sm bg-[color:var(--color-carrot)]/12"
                style={{ width: `calc((100% - 1.75rem) * ${share})` }}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => onAdd(field, v.value, false)}
                title={`Add ${field}=${v.value} to the search`}
                className="relative flex h-6 min-w-0 flex-1 items-center gap-2 text-left text-[12px]"
              >
                <span className="truncate text-[color:var(--color-ink-2)]">{v.value}</span>
                <span className="ml-auto shrink-0 tabular-nums text-[11px] text-[color:var(--color-ink-4)]">{v.count.toLocaleString()}</span>
              </button>
              <button
                type="button"
                onClick={() => onAdd(field, v.value, true)}
                aria-label={`Exclude ${field}=${v.value}`}
                title={`Exclude ${field}=${v.value}`}
                className="relative grid h-5 w-5 shrink-0 place-items-center rounded text-[color:var(--color-ink-4)] opacity-0 hover:text-[color:var(--color-ink)] focus-visible:opacity-100 group-hover:opacity-100"
              >
                <IconMinus size={12} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function FieldsPanel({
  pipeline,
  searchKey,
  columns,
  timeField,
  onAdd,
}: {
  pipeline: string;
  /** The search's query string, without paging. */
  searchKey: string;
  columns: { name: string; type: string }[];
  timeField: string | null;
  onAdd: (field: string, value: string, exclude: boolean) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <nav aria-label="Fields" data-testid="search-fields" className="text-[12.5px]">
      <div className="px-3 pb-0.5 pt-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[color:var(--color-ink-4)]">
        Fields ({columns.length})
      </div>
      <ul>
        {columns.map((c) => {
          const isOpen = open.has(c.name);
          return (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => toggle(c.name)}
                aria-expanded={isOpen}
                data-testid={`field-${c.name}`}
                className="flex h-6 w-full items-center gap-1 pl-2 pr-2 text-left hover:bg-[color:var(--color-surface-2)]"
              >
                <span className="grid w-4 shrink-0 place-items-center text-[color:var(--color-ink-4)]">
                  <IconChevronRight size={12} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </span>
                <span className="truncate text-[color:var(--color-ink)]">{c.name}</span>
                {c.name === timeField && (
                  <span title="Event time" className="text-[10px] text-[color:var(--color-carrot)]">
                    time
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[10.5px] text-[color:var(--color-ink-4)]">{c.type.toLowerCase()}</span>
              </button>
              {isOpen && <Values pipeline={pipeline} searchKey={searchKey} field={c.name} onAdd={onAdd} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

