// Matching events, newest first: the time, then each field as name=value.
// Open an event to see its fields one per line, with buttons to add or
// exclude a value.

import { Fragment, useState } from "react";
import { formatEventTime, valueText } from "@/lib/search/format";
import { IconMinus, IconPlus } from "@/components/icons";

export interface SearchEvent {
  time: number | null;
  row: Record<string, unknown>;
}

/** A value as shown: DATE columns arrive as midnight UTC timestamps, so drop the time. */
function shownValue(value: unknown, type: string | undefined): string | null {
  const text = valueText(value);
  if (text !== null && type === "DATE") return text.replace(/T00:00:00(\.000)?Z$/, "");
  return text;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Text with each search word wrapped in <mark>. */
function Highlighted({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern) return <>{text}</>;
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-[color:var(--color-amber-deep)]/30 text-[color:var(--color-ink)]">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export default function EventList({
  events,
  columns,
  timeField,
  terms,
  offset,
  onAdd,
}: {
  events: SearchEvent[];
  columns: { name: string; type: string }[];
  timeField: string | null;
  terms: string[];
  offset: number;
  onAdd: (field: string, value: string, exclude: boolean) => void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const pattern = terms.length ? new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi") : null;
  const names = columns.map((c) => c.name);
  const types = Object.fromEntries(columns.map((c) => [c.name, c.type]));
  const shown = names.filter((c) => c !== timeField);

  return (
    <ol className="font-mono text-[12px]" data-testid="search-events">
      {events.map((e, i) => {
        const key = offset + i;
        const isOpen = open.has(key);
        return (
          <li key={key} className="border-b border-[color:var(--color-rule-soft)]">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              className="flex w-full gap-3 px-3 py-1.5 text-left hover:bg-[color:var(--color-surface-2)] max-sm:flex-col max-sm:gap-0.5"
            >
              <span className="w-[8.75rem] shrink-0 tabular-nums text-[color:var(--color-ink-3)]">
                {e.time === null ? "No time" : formatEventTime(e.time)}
              </span>
              <span className="min-w-0 flex-1 leading-[1.55] text-[color:var(--color-ink-2)]">
                {shown.map((c) => {
                  const v = shownValue(e.row[c], types[c]);
                  if (v === null) return null;
                  return (
                    <span key={c} className="mr-3 inline-block max-w-full break-all align-top">
                      <span className="text-[color:var(--color-ink-4)]">{c}=</span>
                      <Highlighted text={v} pattern={pattern} />
                    </span>
                  );
                })}
              </span>
            </button>
            {isOpen && (
              <table className="mb-2 ml-3 font-sans text-[12px] sm:ml-[10.25rem]" data-testid="event-fields">
                <tbody>
                  {names.map((c) => {
                    const v = shownValue(e.row[c], types[c]);
                    return (
                      <tr key={c} className="group">
                        <td className="py-0.5 pr-4 align-top text-[color:var(--color-ink-3)]">{c}</td>
                        <td className="break-all py-0.5 pr-2 align-top font-mono text-[color:var(--color-ink)]">
                          {v === null ? <span className="text-[color:var(--color-ink-4)]">NULL</span> : v}
                        </td>
                        <td className="w-12 whitespace-nowrap py-0.5 align-top">
                          {v !== null && (
                            <span className="flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => onAdd(c, v, false)}
                                aria-label={`Add ${c}=${v} to the search`}
                                title="Add to the search"
                                className="grid h-5 w-5 place-items-center rounded text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
                              >
                                <IconPlus size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdd(c, v, true)}
                                aria-label={`Exclude ${c}=${v}`}
                                title="Exclude from the search"
                                className="grid h-5 w-5 place-items-center rounded text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
                              >
                                <IconMinus size={12} />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ol>
  );
}
