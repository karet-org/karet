"use client";

// Client-rendered dashboard page. The config loads through the shared
// dedupe cache, so navigating to a previously seen dashboard renders
// its exact config-derived skeletons on the first frame; only a first
// visit shows the brief generic frame while the YAML fetches.

import { use, useEffect, useState } from "react";
import { cachedText } from "@/lib/client/fetch-cache";
import { validateDashboardV2, type DashboardConfigV2 } from "@/lib/types/dashboard-v2";
import DashboardView from "@/components/dashboard/DashboardView";

type State =
  | { kind: "loading" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "missing" }
  | { kind: "ready"; config: DashboardConfigV2 };

export default function PipelineDashboardPage({
  params,
}: {
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = use(params);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    cachedText(`/api/p/${pipeline}/dashboards/${name}`)
      .then((body) => {
        if (cancelled) return;
        const result = validateDashboardV2(body);
        setState(result.ok ? { kind: "ready", config: result.config } : { kind: "invalid", errors: result.errors });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [pipeline, name]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1400px] p-3 sm:p-4 lg:p-6">
        {state.kind === "loading" ? (
          <div className="space-y-4" aria-busy>
            <div className="skeleton h-[58px] rounded-[13px]" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[76px] rounded-[13px]" />
              ))}
              <div className="skeleton h-[300px] rounded-[13px] md:col-span-3" />
            </div>
          </div>
        ) : state.kind === "missing" ? (
          <div
            role="alert"
            className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
          >
            Dashboard not found.
          </div>
        ) : state.kind === "invalid" ? (
          <div
            role="alert"
            className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
          >
            <strong className="font-semibold">This dashboard&apos;s config does not validate.</strong>{" "}
            Open the editor to fix it. ({state.errors[0]})
          </div>
        ) : (
          <DashboardView
            key={`${pipeline}/${name}`}
            pipeline={pipeline}
            id={name}
            config={state.config}
          />
        )}
      </div>
    </main>
  );
}
