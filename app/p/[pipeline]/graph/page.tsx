"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { buildGraph, findNode, type GraphNode } from "@/lib/graph/build";
import { autoLayout, layoutToConfig } from "@/lib/graph/layout";
import { validateRollup } from "@/components/graph/detail/validation";
import { useGraphStore } from "@/lib/graph/store";
import {
  addNodeToConfig,
  analyzeNodeDeleteImpact,
  disconnectEdgeInConfig,
  scrubDimensionReferences,
  type NodeKind,
} from "@/lib/graph/nodeDefaults";
import type { PipelineConfig } from "@/lib/types/config";
import GraphCanvas, { type GraphCanvasHandle } from "@/components/graph/GraphCanvas";
import Modal from "@/components/ui/Modal";
import NodeDetailPanel from "@/components/graph/NodeDetailPanel";

type LoadState = "loading" | "error" | "ready";

export default function PipelineGraphPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  // Destination stashed by the click interceptor; the modal either
  // navigates to it or discards it.
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const select = useGraphStore((s) => s.select);
  const clear = useGraphStore((s) => s.clear);
  const setConfig = useGraphStore((s) => s.setConfig);
  // Subscribe to config so editor keystrokes rerender the page; without
  // it `selectedNodeValue` goes stale and controlled inputs revert.
  const config = useGraphStore((s) => s.config);

  const canvasRef = useRef<GraphCanvasHandle>(null);
  const savedConfigRef = useRef<PipelineConfig | null>(null);
  const initialGraphRef = useRef<{
    nodes: GraphNode[];
    edges: ReturnType<typeof buildGraph>["edges"];
  } | null>(null);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const clearDirty = useCallback(() => setIsDirty(false), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/p/${pipeline}/config`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error === "bucket_not_found"
              ? `S3 bucket not found. ${body.message}`
              : `Failed to load Pipeline_Config (${res.status})`,
          );
        }
        const etag = res.headers?.get?.("ETag")?.replace(/^"|"$/g, "") ?? null;
        const parsed = (await res.json()) as PipelineConfig;
        if (!cancelled) {
          savedConfigRef.current = parsed;
          setConfig(parsed, etag);
          const built = buildGraph(parsed);
          const hasLayout = parsed.layout && Object.keys(parsed.layout).length > 0;
          const positioned = hasLayout ? built.nodes : autoLayout(built.nodes, built.edges);
          initialGraphRef.current = { nodes: positioned, edges: built.edges };
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pipeline, setConfig]);

  const selectedNodeValue = useMemo<GraphNode | null>(() => {
    if (!selectedNodeId || !config) return null;
    return findNode(config, selectedNodeId);
  }, [selectedNodeId, config]);

  // Unsaved-changes guards while dirty: `beforeunload` for real
  // navigations, a capture-phase click listener for in-app <Link>s
  // (App Router has no confirm-navigation hook).
  useEffect(() => {
    if (!isDirty) return;

    const message = "You have unsaved changes. Leave anyway?";

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers ignore the string but still require returnValue to prompt.
      e.returnValue = message;
      return message;
    };

    const onClick = (e: MouseEvent) => {
      // Modified/non-primary clicks mean "new tab", not navigating away.
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // `composedPath` handles shadow DOM; the fallback covers plain docs.
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      const anchor = (path.find(
        (n) => n instanceof HTMLElement && n.tagName === "A",
      ) ?? null) as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;

      // New-tab links and downloads don't navigate this page.
      if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      // Skip same-page hash changes.
      const here = window.location;
      const dest = new URL(anchor.href, here.href);
      if (
        dest.origin === here.origin &&
        dest.pathname === here.pathname &&
        dest.search === here.search &&
        dest.hash !== here.hash
      ) {
        return;
      }

      // Skip links that resolve to the same URL we're already on.
      if (
        dest.origin === here.origin &&
        dest.pathname === here.pathname &&
        dest.search === here.search
      ) {
        return;
      }

      // Block the synchronous click so it never becomes a route change;
      // `pendingNav` resolves it (confirm = push, cancel = drop).
      e.preventDefault();
      e.stopPropagation();
      setPendingNav(dest.pathname + dest.search + dest.hash);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase so we run before React's synthetic handlers and
    // next/link's own click handler navigate.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty]);

  const applyDraft = useCallback((cfg: PipelineConfig) => {
    useGraphStore.setState({ config: cfg });
    const built = buildGraph(cfg);
    canvasRef.current?.updateGraph(built.nodes, built.edges);
    markDirty();
  }, [markDirty]);

  const handleLayoutChange = useCallback((nodes: GraphNode[]) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;
    useGraphStore.setState({ config: layoutToConfig(cfg, nodes) });
    markDirty();
  }, [markDirty]);

  const handlePublish = useCallback(async () => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;
    setSaving(true);
    setValidationErrors([]);
    try {
      // Pre-flight locally so the rule still holds when the worker (which
      // validates the same constraints) is unreachable.
      const localErrors = validateConfigForSave(cfg);
      if (localErrors.length > 0) {
        setValidationErrors(localErrors);
        return;
      }

      // Worker validation. Network failures are surfaced rather than
      // skipped: saving unvalidated risks landing a known-bad config.
      try {
        const valRes = await fetch(`/api/p/${pipeline}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cfg),
        });
        if (!valRes.ok) {
          setValidationErrors([
            `Validation request failed (${valRes.status}). The worker may be down. Try again or check rustfs/worker container health.`,
          ]);
          return;
        }
        const valData = await valRes.json();
        if (valData.ok === false && valData.errors?.length > 0) {
          setValidationErrors(valData.errors.map((e: { message: string }) => e.message));
          return;
        }
      } catch (err) {
        setValidationErrors([
          `Could not reach the worker for validation: ${
            err instanceof Error ? err.message : String(err)
          }. Refusing to save until the worker is reachable.`,
        ]);
        return;
      }

      // Send the load-time ETag so a concurrent edit isn't overwritten;
      // 412/5xx/network failures must stay dirty, not clear the banner.
      const etag = useGraphStore.getState().etag;
      let res: Response;
      try {
        res = await fetch(`/api/p/${pipeline}/config`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(etag ? { "If-Match": `"${etag}"` } : {}),
          },
          body: JSON.stringify(cfg),
        });
      } catch (err) {
        setValidationErrors([
          `Save failed (network): ${
            err instanceof Error ? err.message : String(err)
          }. Your edits are still in the editor.`,
        ]);
        return;
      }

      if (res.status === 412) {
        setValidationErrors([
          "This pipeline was modified elsewhere since you opened it. Reload to see the latest version, then re-apply your edits. Your changes are still in the editor for now.",
        ]);
        return;
      }

      if (!res.ok) {
        const body: { error?: string; message?: string } = await res
          .json()
          .catch(() => ({}));
        setValidationErrors([
          `Save failed (${res.status}): ${
            body.message ?? body.error ?? res.statusText
          }`,
        ]);
        return;
      }

      const data = await res.json().catch(() => ({}));
      savedConfigRef.current = cfg;
      useGraphStore.setState({ config: cfg, etag: data.etag ?? null });
      clearDirty();
    } finally {
      setSaving(false);
    }
  }, [pipeline, clearDirty]);

  const handleRevert = useCallback(() => {
    const saved = savedConfigRef.current;
    if (!saved) return;
    useGraphStore.setState({ config: saved });
    const built = buildGraph(saved);
    // Only autoLayout when the saved config has no layout at all;
    // otherwise re-running it would clobber hand-tuned positions.
    const hasLayout =
      saved.layout && Object.keys(saved.layout).length > 0;
    const positioned = hasLayout
      ? built.nodes
      : autoLayout(built.nodes, built.edges);
    canvasRef.current?.setGraph(positioned, built.edges);
    clearDirty();
    setValidationErrors([]);
  }, [clearDirty]);

  const runningRef = useRef(false);
  const handleRun = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await fetch(`/api/p/${pipeline}/jobs`, { method: "POST" });
      router.push(`/p/${pipeline}/jobs`);
    } finally {
      runningRef.current = false;
    }
  }, [pipeline, router]);

  const handleAddNode = useCallback((kind: NodeKind, position: { x: number; y: number }) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;
    const updated = addNodeToConfig(cfg, kind);
    const list = kind === "source" ? updated.source_containers
      : kind === "dimension" ? updated.dimensions
      : kind === "mapping" ? updated.mappings
      : updated.analytic_tables;
    const newId = list[list.length - 1]?.id;
    if (newId) {
      updated.layout = { ...(updated.layout ?? {}), [newId]: position };
    }
    applyDraft(updated);
  }, [applyDraft]);

  const handleConnect = useCallback((sourceId: string, targetId: string) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;
    const isSource = cfg.source_containers.some((s) => s.id === sourceId);
    const isMapping = cfg.mappings.some((m) => m.id === sourceId);
    const isTable = cfg.analytic_tables.some((t) => t.id === sourceId);
    const isRollup = (cfg.rollups ?? []).some((r) => r.id === sourceId);
    const targetIsMapping = cfg.mappings.some((m) => m.id === targetId);
    const targetIsTable = cfg.analytic_tables.some((t) => t.id === targetId);
    const targetIsRollup = (cfg.rollups ?? []).some((r) => r.id === targetId);

    let updated = cfg;
    if (isSource && targetIsMapping) {
      updated = { ...cfg, mappings: cfg.mappings.map((m) => m.id === targetId ? { ...m, source_container_id: sourceId } : m) };
    } else if (isMapping && targetIsTable) {
      const table = cfg.analytic_tables.find((t) => t.id === targetId);
      updated = { ...cfg, mappings: cfg.mappings.map((m) => m.id === sourceId ? syncMappingToTable(m, targetId, table) : m) };
    } else if (isTable && targetIsRollup) {
      // A rollup reads one table…
      updated = {
        ...cfg,
        rollups: (cfg.rollups ?? []).map((r) =>
          r.id === targetId ? { ...r, source_table_id: sourceId } : r,
        ),
      };
    } else if (isRollup && targetIsTable) {
      // …and writes another.
      updated = {
        ...cfg,
        rollups: (cfg.rollups ?? []).map((r) =>
          r.id === sourceId ? { ...r, analytic_table_id: targetId } : r,
        ),
      };
    } else return;
    applyDraft(updated);
  }, [applyDraft]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;

    // Disconnect edges first so field-clearing rules (e.g. emptying
    // `mapping.columns`) match the edge-disconnect flow.
    let working = cfg;
    for (const m of cfg.mappings) {
      if (m.source_container_id === nodeId) {
        working = disconnectEdgeInConfig(working, nodeId, m.id);
      }
      if (m.analytic_table_id === nodeId) {
        working = disconnectEdgeInConfig(working, m.id, nodeId);
      }
    }

    // Scrub `dim_ref`s to a deleted Dimension so the config still parses
    // and the worker won't reject the save with "unknown dimension id".
    const isDimension = cfg.dimensions.some((l) => l.id === nodeId);
    if (isDimension) {
      working = {
        ...working,
        mappings: working.mappings.map((m) => ({
          ...m,
          columns: m.columns.map((c) => ({
            ...c,
            expr: scrubDimensionReferences(c.expr, nodeId),
          })),
        })),
      };
    }

    const updated: PipelineConfig = {
      ...working,
      source_containers: working.source_containers.filter((s) => s.id !== nodeId),
      dimensions: working.dimensions.filter((l) => l.id !== nodeId),
      mappings: working.mappings.filter((m) => m.id !== nodeId),
      analytic_tables: working.analytic_tables.filter((t) => t.id !== nodeId),
    };
    if (updated.layout) {
      const { [nodeId]: _, ...rest } = updated.layout;
      updated.layout = rest;
    }
    clear();
    applyDraft(updated);
  }, [applyDraft, clear]);

  // Clears the config field that produced the edge. Dimension→mapping edges
  // come from AST `dim_ref`s, so GraphCanvas hides the menu item there.
  const handleDisconnectEdge = useCallback(
    ({ source, target }: { id: string; source: string; target: string }) => {
      const cfg = useGraphStore.getState().config;
      if (!cfg) return;
      const updated = disconnectEdgeInConfig(cfg, source, target);
      if (updated === cfg) return;
      applyDraft(updated);
    },
    [applyDraft],
  );

  if (status === "loading") {
    return (
      <main className="flex h-[calc(100vh-48px)] items-center justify-center md:h-full">
        <div role="status" className="text-sm text-[color:var(--color-ink-3)]" data-testid="graph-loading">Loading pipeline…</div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex h-[calc(100vh-48px)] items-center justify-center md:h-full">
        <div role="alert" className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]" data-testid="graph-error">{errorMsg}</div>
      </main>
    );
  }

  // Mobile shows the detail panel as a full-width overlay, so only offset
  // the canvas at sm+. 300 must match NodeDetailPanel's sm:w-[300px].
  const canvasClass = selectedNodeValue
    ? "relative h-full w-full sm:w-[calc(100%-300px)]"
    : "relative h-full w-full";
  const initial = initialGraphRef.current ?? { nodes: [], edges: [] };

  return (
    <main className="flex h-[calc(100vh-48px)] w-full md:h-full" data-testid="graph-page">
      <div className={canvasClass}>
        <GraphCanvas
          ref={canvasRef}
          nodes={initial.nodes}
          edges={initial.edges}
          onNodeClick={select}
          onPaneClick={clear}
          onLayout={handleLayoutChange}
          onNodeDragStop={handleLayoutChange}
          onAddNode={handleAddNode}
          onRun={handleRun}
          onConnect={handleConnect}
          onDeleteNode={handleDeleteNode}
          analyzeDeleteImpact={(nodeId) => {
            const cfg = useGraphStore.getState().config;
            if (!cfg) {
              return {
                disconnectedMappings: [],
                disconnectedTables: [],
                brokenExpressions: [],
              };
            }
            return analyzeNodeDeleteImpact(cfg, nodeId);
          }}
          onDisconnectEdge={handleDisconnectEdge}
        />
        {isDirty && (
          // Top-center: keeps the bottom toolbar usable while dirty.
          <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
            {validationErrors.length > 0 && (
              <div className="w-max max-w-lg rounded-lg border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-2 shadow-lg">
                <div className="text-xs font-semibold text-[color:var(--color-rose-deep)]">Validation failed:</div>
                <ul className="mt-1 list-inside list-disc text-xs text-[color:var(--color-rose-deep)]">
                  {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-full border border-[color:var(--color-carrot)] bg-[color:var(--color-surface)] px-4 py-2 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-[color:var(--color-carrot)]" />
              <span className="text-xs font-medium text-[color:var(--color-ink-2)]">Unsaved changes</span>
              <button type="button" onClick={handleRevert} className="rounded border border-[color:var(--color-rule)] px-3 py-1 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]">Revert</button>
              <button type="button" onClick={handlePublish} disabled={saving} className="rounded bg-[color:var(--color-carrot)] px-3 py-1 text-xs font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50">
                {saving ? "Saving…" : "Save & Publish"}
              </button>
            </div>
          </div>
        )}
      </div>
      <NodeDetailPanel node={selectedNodeValue} onClose={clear} onEdit={() => {
        const cfg = useGraphStore.getState().config;
        if (cfg) {
          const built = buildGraph(cfg);
          canvasRef.current?.updateGraph(built.nodes, built.edges);
          markDirty();
        }
      }} />

      {pendingNav !== null ? (
        <Modal open onClose={() => setPendingNav(null)}>
          <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">
            Discard unsaved changes?
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-ink-2)]">
            You have edits that haven&rsquo;t been published yet. Leaving
            this page will lose them.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingNav(null)}
              data-testid="discard-nav-cancel"
              className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
            >
              Stay on this page
            </button>
            <button
              type="button"
              onClick={() => {
                const dest = pendingNav;
                setPendingNav(null);
                // Clean first, or the same handler blocks this push.
                clearDirty();
                router.push(dest);
              }}
              data-testid="discard-nav-confirm"
              className="rounded-md bg-[color:var(--color-rose-deep)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-rose-deep)]"
            >
              Discard and leave
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

/** Blocking pre-flight checks; deeper validation is the worker's job. */
function validateConfigForSave(cfg: PipelineConfig): string[] {
  const errors: string[] = [];

  // Name scopes are per-kind: a Source and a Table may share a name.
  const kinds: { label: string; entities: { id: string; name?: string }[] }[] = [
    { label: "Source", entities: cfg.source_containers },
    { label: "Dimension", entities: cfg.dimensions },
    { label: "Rollup", entities: cfg.rollups ?? [] },
    { label: "Mapping", entities: cfg.mappings },
    { label: "Table", entities: cfg.analytic_tables },
  ];
  for (const { label, entities } of kinds) {
    const seen = new Map<string, number>();
    let emptyCount = 0;
    for (const e of entities) {
      const name = e.name?.trim() ?? "";
      if (name === "") {
        emptyCount++;
        continue;
      }
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    if (emptyCount > 0) {
      errors.push(
        `${emptyCount} ${label}${emptyCount === 1 ? "" : "s"} missing a name`,
      );
    }
    const dupes = Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
    if (dupes.length > 0) {
      errors.push(
        `Duplicate ${label} name${dupes.length === 1 ? "" : "s"}: ${dupes
          .sort()
          .map((n) => `"${n}"`)
          .join(", ")}`,
      );
    }
  }

  // Union: several mappings may feed one table (that is how a multi-source
  // fact table works), but two writing the same column with different types
  // produce Parquet that fails at query time.
  for (const t of cfg.analytic_tables) {
    const feeding = cfg.mappings.filter((m) => m.analytic_table_id === t.id);
    if (feeding.length < 2) continue;
    const declared = new Map(t.schema.map((c) => [c.name, c.type]));
    const seen = new Map<string, { type: string; mapping: string }>();
    for (const m of feeding) {
      for (const col of m.columns) {
        const type = declared.get(col.name);
        if (type === undefined) continue;
        const prior = seen.get(col.name);
        if (prior && prior.type !== type) {
          errors.push(
            `Table "${t.name?.trim() || t.id}": mappings "${prior.mapping}" and "${m.name || m.id}" both write "${col.name}" with different types (${prior.type} vs ${type})`,
          );
        } else if (!prior) {
          seen.set(col.name, { type, mapping: m.name || m.id });
        }
      }
    }
  }


  for (const t of cfg.analytic_tables) {
    const label = t.name?.trim() || t.id;
    const seen = new Set<string>();
    const dupes = new Set<string>();
    let emptyCount = 0;
    for (const col of t.schema) {
      const name = col.name?.trim() ?? "";
      if (name === "") {
        emptyCount++;
        continue;
      }
      if (seen.has(name)) dupes.add(name);
      seen.add(name);
    }
    if (emptyCount > 0) {
      errors.push(
        `Table "${label}": ${emptyCount} column${
          emptyCount === 1 ? "" : "s"
        } missing a name`,
      );
    }
    if (dupes.size > 0) {
      errors.push(
        `Table "${label}": duplicate column names (${Array.from(dupes)
          .sort()
          .join(", ")})`,
      );
    }
  }

  // Rollups: the grain must cover the target's partitioning, and the source
  // must partition on the same keys, or a run could not recompute a partition
  // in isolation.
  for (const r of cfg.rollups ?? []) {
    const source = cfg.analytic_tables.find((t) => t.id === r.source_table_id);
    const target = cfg.analytic_tables.find((t) => t.id === r.analytic_table_id);
    if (!source || !target) {
      errors.push(`Rollup "${r.name || r.id}" is not connected to two tables`);
      continue;
    }
    for (const e of validateRollup(r, source, target).errors) {
      errors.push(`Rollup "${r.name || r.id}": ${e}`);
    }
  }

  return errors;
}

// Rebuilds columns to match the table schema in order; columns matched by
// name keep their `expr`, new ones are seeded with the AST `null` value.
function syncMappingToTable(
  mapping: PipelineConfig["mappings"][number],
  tableId: string,
  table: PipelineConfig["analytic_tables"][number] | undefined,
): PipelineConfig["mappings"][number] {
  if (!table) return { ...mapping, analytic_table_id: tableId };
  const byName = new Map(mapping.columns.map((c) => [c.name, c]));
  const columns = table.schema.map((col) => {
    const existing = byName.get(col.name);
    return existing ?? { name: col.name, expr: { kind: "null" as const } };
  });
  return { ...mapping, analytic_table_id: tableId, columns };
}
