"use client";

// Dashboard v2 renderer: fetches the batch /data endpoint on mount and
// on (debounced) filter changes; each panel binds its own result.

import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardConfigV2, PanelV2 } from "@/lib/types/dashboard-v2";
import type { DashboardData, Params } from "@/lib/services/dashboard-data";
import { filterParams } from "@/lib/types/dashboard-v2";
import FilterBar from "./FilterBar";
import PanelRenderer from "./PanelRenderer";

const DEBOUNCE_MS = 250;

function emptyParams(config: DashboardConfigV2): Params {
  const params: Params = {};
  for (const f of config.filters) for (const p of filterParams(f)) params[p] = null;
  return params;
}

function spanStyle(panel: PanelV2, columns: number): React.CSSProperties {
  const span = panel.grid?.span;
  if (span === "full") return { gridColumn: "1 / -1" };
  if (typeof span === "number") return { gridColumn: `span ${Math.min(span, columns)}` };
  return {};
}

export function DashboardView({
  pipeline,
  id,
  config,
  draft = false,
}: {
  pipeline: string;
  id: string;
  config: DashboardConfigV2;
  draft?: boolean;
}) {
  const [params, setParams] = useState<Params>(() => emptyParams(config));
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mySeq = ++seq.current;
    const run = async () => {
      try {
        const res = await fetch(
          `/api/p/${pipeline}/dashboards/${id}/data${draft ? "?draft=1" : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ params }),
          },
        );
        const body = await res.json();
        if (seq.current !== mySeq) return;
        if (!res.ok) {
          setError(body.message ?? body.error ?? `Data fetch failed (${res.status})`);
          return;
        }
        setError(null);
        setData(body as DashboardData);
      } catch (e) {
        if (seq.current === mySeq) setError(e instanceof Error ? e.message : String(e));
      }
    };
    // First load fires immediately; param changes debounce.
    if (data === null) void run();
    else {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline, id, draft, params]);

  const columns = config.layout?.columns ?? 3;
  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: config.layout?.gap ?? "1rem",
    }),
    [columns, config.layout?.gap],
  );

  return (
    <div data-testid="dashboard-view" className="space-y-4">
      <FilterBar
        filters={config.filters}
        options={data?.filters ?? {}}
        params={params}
        onChange={setParams}
      />
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
        >
          {error}
        </div>
      )}
      <div style={gridStyle}>
        {config.panels.map((panel, i) => (
          <div key={i} className="flex min-w-0" style={spanStyle(panel, columns)}>
            <PanelRenderer
              panel={panel}
              result={data?.panels[i]}
              params={params}
              onEmit={(param, value) =>
                setParams((prev) => ({
                  ...prev,
                  [param]: prev[param] === value ? null : value,
                }))
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default DashboardView;
