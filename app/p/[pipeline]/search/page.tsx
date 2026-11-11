"use client";

// Search page: search the events in one table by words and field values, see
// matches over time, and narrow down from the fields panel. The search lives
// in the URL, so it can be shared and the back button returns to the last one.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Histogram, { type HistogramData } from "@/components/search/Histogram";
import FieldsPanel from "@/components/search/FieldsPanel";
import EventList, { type SearchEvent } from "@/components/search/EventList";
import { iconButton, toolButton, toolInput, toolPrimary } from "@/components/data/toolbar";
import { IconChevronLeft, IconChevronRight, IconLookup } from "@/components/icons";
import { addFieldTerm, highlightTerms, parseSearch } from "@/lib/search/query";
import { DEFAULT_RANGE, TIME_RANGES } from "@/lib/search/time";
import { formatDateTime, formatSpan } from "@/lib/search/format";

const PAGE_SIZE = 50;

interface Result {
  columns: { name: string; type: string }[];
  timeField: string | null;
  total: number;
  events: SearchEvent[];
  range: { from: number; to: number } | null;
  histogram: HistogramData | null;
  latest: number | null;
}

interface TableOption {
  id: string;
  name: string;
  version: number;
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}

function SearchView() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [tables, setTables] = useState<TableOption[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState<{ key: string | null; offset: number }>({ key: null, offset: 0 });
  const [runId, setRunId] = useState(0);
  const [ms, setMs] = useState<number | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const table = params.get("table") ?? tables?.find((t) => t.version > 0)?.id ?? tables?.[0]?.id ?? null;
  const q = params.get("q") ?? "";
  const from = params.get("from");
  const to = params.get("to");
  const custom = from !== null && to !== null;
  const range = custom ? "custom" : (params.get("range") ?? DEFAULT_RANGE);
  const [input, setInput] = useState(q);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    fetch(`/api/p/${pipeline}/tables`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
        setTables(body.tables ?? []);
      })
      .catch((e) => setTablesError((e as Error).message));
  }, [pipeline]);

  /** The search as a query string, without paging. */
  const searchKey = useMemo(() => {
    if (!table) return null;
    const s = new URLSearchParams({ table, q });
    if (custom) {
      s.set("from", from!);
      s.set("to", to!);
    } else s.set("range", range);
    return s.toString();
  }, [table, q, custom, from, to, range]);

  // A new search starts on the first page.
  const offset = page.key === searchKey ? page.offset : 0;
  const setOffset = (fn: (o: number) => number) => setPage({ key: searchKey, offset: fn(offset) });

  useEffect(() => {
    if (!searchKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const started = performance.now();
    fetch(`/api/p/${pipeline}/search?${searchKey}&offset=${offset}&limit=${PAGE_SIZE}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setResult(body);
        setMs(Math.round(performance.now() - started));
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
        setResult(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [pipeline, searchKey, offset, runId]);

  /** Change the URL; the fetch follows from it. */
  const navigate = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      if (table && !next.has("table")) next.set("table", table);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.push(`${pathname}?${next}`);
    },
    [params, pathname, router, table],
  );

  const submit = () => {
    const next = input.trim();
    if (next === q) {
      // The same search again: run it for new events.
      setPage({ key: searchKey, offset: 0 });
      setRunId((n) => n + 1);
    } else navigate({ q: next || null });
  };

  const addTerm = (field: string, value: string, exclude: boolean) => {
    const next = addFieldTerm(q, field, value, exclude);
    setInput(next);
    navigate({ q: next });
  };

  const terms = useMemo(() => {
    try {
      return highlightTerms(parseSearch(q));
    } catch {
      return [];
    }
  }, [q]);

  const hasTime = result?.timeField != null;
  const total = result?.total ?? 0;

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col md:h-full md:min-h-0">
      <form
        className="flex min-h-9 shrink-0 flex-wrap items-center gap-1.5 border-b border-[color:var(--color-rule-soft)] py-0.5 pl-3 pr-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="search-table" className="sr-only">
          Table
        </label>
        <select
          id="search-table"
          data-testid="search-table"
          value={table ?? ""}
          onChange={(e) => navigate({ table: e.target.value, timeField: null })}
          disabled={!tables?.length}
          className={toolInput("max-w-[12rem] pr-1")}
        >
          {(tables ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="relative min-w-[14rem] flex-1">
          <IconLookup size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--color-ink-4)]" />
          <input
            data-testid="search-input"
            aria-label="Search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='status>=500 host=git* "not found"'
            spellCheck={false}
            autoComplete="off"
            className={toolInput("w-full pl-7 font-mono [font-variant-ligatures:none]")}
          />
        </div>
        {(hasTime || !result) && (
          <>
            <label htmlFor="search-range" className="sr-only">
              Time range
            </label>
            <select
              id="search-range"
              data-testid="search-range"
              value={range}
              onChange={(e) => navigate({ range: e.target.value, from: null, to: null })}
              className={toolInput("pr-1")}
            >
              {custom && <option value="custom">{formatSpan(Number(from), Number(to))}</option>}
              {TIME_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="submit" className={toolPrimary()} disabled={!table} data-testid="search-submit">
          Search
        </button>
      </form>

      {tablesError || (tables && tables.length === 0) ? (
        <p className="px-3 py-3 text-[12.5px] text-[color:var(--color-ink-3)]">{tablesError ?? "No tables yet."}</p>
      ) : (
        <>
          <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 border-b border-[color:var(--color-rule-soft)] pl-3 pr-1.5 text-[12px] text-[color:var(--color-ink-3)]">
            <span data-testid="search-status" className={error ? "text-[color:var(--color-rose-deep)]" : ""} role={error ? "alert" : undefined}>
              {error
                ? error
                : result
                  ? `${total.toLocaleString()} event${total === 1 ? "" : "s"}${result.range ? `, ${formatSpan(result.range.from, result.range.to)}` : ""}`
                  : "Searching…"}
            </span>
            {loading && result && <span className="text-[color:var(--color-ink-4)]">Searching…</span>}
            {!loading && ms !== null && result && <span className="text-[11px] text-[color:var(--color-ink-4)]">{ms} ms</span>}
            {result && total > PAGE_SIZE && (
              <span className="ml-auto flex items-center gap-0.5 tabular-nums">
                <span className="mr-1.5 text-[11.5px]" data-testid="search-page">
                  {(offset + 1).toLocaleString()}–{Math.min(offset + PAGE_SIZE, total).toLocaleString()}
                </span>
                <button type="button" className={iconButton()} disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} aria-label="Newer events" title="Newer events">
                  <IconChevronLeft size={14} />
                </button>
                <button type="button" className={iconButton()} disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)} aria-label="Older events" title="Older events">
                  <IconChevronRight size={14} />
                </button>
              </span>
            )}
          </div>

          {result?.histogram && total > 0 && (
            <div className="shrink-0 border-b border-[color:var(--color-rule-soft)]">
              <Histogram data={result.histogram} onSelect={(f, t) => navigate({ from: String(f), to: String(t), range: null })} />
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {result && result.columns.length > 0 && (
              <aside className="shrink-0 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:w-[240px] md:overflow-y-auto md:border-b-0 md:border-r">
                <button
                  type="button"
                  onClick={() => setFieldsOpen((v) => !v)}
                  aria-expanded={fieldsOpen}
                  className={toolButton("m-1 md:hidden")}
                >
                  Fields
                </button>
                <div className={`${fieldsOpen ? "block" : "hidden"} md:block`}>
                  <FieldsPanel pipeline={pipeline} searchKey={searchKey!} columns={result.columns} timeField={result.timeField} onAdd={addTerm} />
                </div>
              </aside>
            )}
            <div className="min-h-[240px] min-w-0 flex-1 overflow-y-auto">
              {result && total === 0 ? (
                <div className="px-3 py-6 text-[12.5px] text-[color:var(--color-ink-3)]" data-testid="search-empty">
                  <p>No events match.</p>
                  {result.latest !== null && (
                    <p className="mt-1">
                      The latest match is from {formatDateTime(result.latest)}.{" "}
                      <button type="button" className="text-[color:var(--color-carrot)] hover:underline" onClick={() => navigate({ range: "all", from: null, to: null })}>
                        Search all time
                      </button>
                    </p>
                  )}
                </div>
              ) : result ? (
                <EventList
                  key={searchKey}
                  events={result.events}
                  columns={result.columns}
                  timeField={result.timeField}
                  terms={terms}
                  offset={offset}
                  onAdd={addTerm}
                />
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
