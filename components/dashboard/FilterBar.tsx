"use client";

// FilterBar v2: one control per filter, reporting named SQL parameters.
// Dropdown options come from the /data response (options_sql results).

import type { DashboardFilterV2 } from "@/lib/types/dashboard-v2";
import type { Params } from "@/lib/services/dashboard-data";

interface FilterBarProps {
  filters: DashboardFilterV2[];
  options: Record<string, { options: string[] }>;
  params: Params;
  onChange: (next: Params) => void;
  /** Params set only by chart emits; shown as dismissible pills when active. */
  emitParams?: string[];
}

export function FilterBar({ filters, options, params, onChange, emitParams = [] }: FilterBarProps) {
  const activePills = emitParams.filter((p) => params[p] != null);
  if (filters.length === 0 && activePills.length === 0) return null;

  const set = (name: string, value: string | null) =>
    onChange({ ...params, [name]: value === "" ? null : value });

  const anySet = Object.values(params).some((v) => v !== null);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-3 shadow-sm">
      {filters.map((f) =>
        f.kind === "dropdown" ? (
          <label key={f.name} className="flex flex-col text-xs text-[color:var(--color-ink-2)]">
            <span className="mb-1 font-medium">{f.label ?? f.name}</span>
            <select
              value={params[f.name] ?? ""}
              onChange={(e) => set(f.name, e.target.value)}
              className="cursor-pointer rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1.5"
            >
              <option value="">All</option>
              {(options[f.name]?.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={f.name} className="flex flex-col text-xs text-[color:var(--color-ink-2)]">
            <span className="mb-1 font-medium">{f.label ?? f.name}</span>
            <span className="flex items-center gap-1.5">
              <input
                type="date"
                value={params[`${f.name}_from`] ?? ""}
                onChange={(e) => set(`${f.name}_from`, e.target.value)}
                className="rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1"
              />
              <span className="text-[color:var(--color-ink-4)]">to</span>
              <input
                type="date"
                value={params[`${f.name}_to`] ?? ""}
                onChange={(e) => set(`${f.name}_to`, e.target.value)}
                className="rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1"
              />
            </span>
          </label>
        ),
      )}
      {activePills.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => set(p, null)}
          title={`Clear ${p}`}
          data-testid={`emit-pill-${p}`}
          className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-carrot-soft)] px-3 py-1 text-xs font-medium text-[color:var(--color-carrot-deep)]"
        >
          {p}: {params[p]}
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      ))}
      {anySet && (
        <button
          type="button"
          onClick={() =>
            onChange(Object.fromEntries(Object.keys(params).map((k) => [k, null])))
          }
          className="mb-1 inline-flex items-center gap-1 text-xs text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default FilterBar;
