"use client";

// Spreadsheet-style result grid: row numbers, column types under the names,
// sortable headers, NULL shown as NULL, and a selectable cell.

import { cellText, isNumericColumn, type Row, type Sort } from "@/lib/data/grid";

export interface GridColumn {
  name: string;
  type?: string;
}

export interface CellRef {
  row: number;
  column: string;
}

export default function ResultGrid({
  columns,
  rows,
  rowOffset = 0,
  sort,
  onSort,
  selected,
  onSelect,
}: {
  columns: GridColumn[];
  rows: Row[];
  /** Number of the first row, for the row-number column. */
  rowOffset?: number;
  sort: Sort | null;
  onSort: (column: string) => void;
  selected: CellRef | null;
  onSelect: (cell: CellRef) => void;
}) {
  return (
    <table className="result-grid" data-testid="result-grid">
      <thead>
        <tr>
          <th className="result-grid-rownum" aria-label="Row" />
          {columns.map((c) => {
            const active = sort?.column === c.name ? sort.dir : null;
            return (
              <th
                key={c.name}
                aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
                className={isNumericColumn(c.type, rows[0]?.[c.name]) ? "text-right" : ""}
              >
                <button
                  type="button"
                  onClick={() => onSort(c.name)}
                  title={`Sort by ${c.name}`}
                  className="flex w-full items-baseline gap-1.5 text-left"
                >
                  <span className="truncate font-medium text-[color:var(--color-ink-2)]">{c.name}</span>
                  {c.type && (
                    <span className="truncate font-normal text-[color:var(--color-ink-4)]">{c.type.toLowerCase()}</span>
                  )}
                  <span className="ml-auto w-2 shrink-0 text-[color:var(--color-carrot)]" aria-hidden>
                    {active === "asc" ? "↑" : active === "desc" ? "↓" : ""}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={rowOffset + i}>
            <td className="result-grid-rownum">{rowOffset + i + 1}</td>
            {columns.map((c) => {
              const text = cellText(row[c.name]);
              const isSelected = selected?.row === i && selected.column === c.name;
              return (
                <td
                  key={c.name}
                  onClick={() => onSelect({ row: i, column: c.name })}
                  aria-selected={isSelected}
                  className={`${isNumericColumn(c.type, row[c.name]) ? "text-right tabular-nums" : ""} ${
                    isSelected ? "result-grid-selected" : ""
                  }`}
                >
                  {text === null ? (
                    <span className="result-grid-null">NULL</span>
                  ) : (
                    <span className="cell-clamp">{text}</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
