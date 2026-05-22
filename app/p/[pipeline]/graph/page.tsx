"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { buildGraph, type GraphNode } from "@/lib/graph/build";
import { autoLayout, layoutToConfig } from "@/lib/graph/layout";
import { useGraphStore } from "@/lib/graph/store";
import {
  addNodeToConfig,
  analyzeNodeDeleteImpact,
  disconnectEdgeInConfig,
  scrubLookupReferences,
  type NodeKind,
} from "@/lib/graph/nodeDefaults";
import type { PipelineConfig } from "@/lib/types/config";
import GraphCanvas, { type GraphCanvasHandle } from "@/components/graph/GraphCanvas";
import { TOP_NAV_HEIGHT_PX } from "@/components/layout/TopNav";
import Modal from "@/components/ui/Modal";
import NodeDetailPanel, {
  NODE_DETAIL_PANEL_WIDTH_PX,
} from "@/components/graph/NodeDetailPanel";

type LoadState = "loading" | "error" | "ready";

export default function PipelineGraphPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  // When the user clicks an in-app link with unsaved changes, we
  // intercept the click and stash the destination here. Resolving the
  // modal either navigates to it or discards the intent.
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const select = useGraphStore((s) => s.select);
  const clear = useGraphStore((s) => s.clear);
  const setConfig = useGraphStore((s) => s.setConfig);
  // Subscribe to config so the page re-renders when editors mutate the
  // store -- otherwise `selectedNodeValue` stays stale and controlled
  // `<input value=...>` reverts on every keystroke after the first.
  const config = useGraphStore((s) => s.config);

  const canvasRef = useRef<GraphCanvasHandle>(null);
  const savedConfigRef = useRef<PipelineConfig | null>(null);
  const initialGraphRef = useRef<{
    nodes: GraphNode[];
    edges: ReturnType<typeof buildGraph>["edges"];
  } | null>(null);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const clearDirty = useCallback(() => setIsDirty(false), []);

  // Load config from S3.
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

  // Current selected node, derived from the live config so the detail
  // panel's editor inputs see every keystroke of store state.
  const selectedNodeValue = useMemo<GraphNode | null>(() => {
    if (!selectedNodeId || !config) return null;
    return buildGraph(config).nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, config]);

  // Warn on navigation when there are unsaved changes. Two guards:
  //   1. `beforeunload` covers tab close, browser back/forward, reload,
  //      and any real HTTP navigation (<a href> without a SPA handler).
  //   2. A document-level capture-phase click listener intercepts
  //      in-app <Link> clicks. Next.js App Router has no built-in
  //      "confirm navigation" hook, so we have to gate at the DOM.
  // Both guards are only attached while `isDirty` is true.
  useEffect(() => {
    if (!isDirty) return;

    const message = "You have unsaved changes. Leave anyway?";

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Setting returnValue is the spec-compliant way; modern browsers
      // ignore the string and show their own message, but we still need
      // to set it to trigger the prompt.
      e.returnValue = message;
      return message;
    };

    const onClick = (e: MouseEvent) => {
      // Ignore modified clicks and non-primary buttons -- those are the
      // user explicitly asking for a new tab/window, not navigating
      // away from the current view.
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Walk up to find an anchor. `composedPath` handles shadow DOM
      // correctly; the fallback works for plain documents.
      const path = (e.composedPath?.() ?? []) as EventTarget[];
      const anchor = (path.find(
        (n) => n instanceof HTMLElement && n.tagName === "A",
      ) ?? null) as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;

      // Skip new-tab links and downloads -- those don't navigate the
      // current page, so the warning would be a false positive.
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

      // Block the navigation entirely so the synchronous click never
      // turns into a route change, then surface a Modal asking whether
      // to leave. Resolution lives in `pendingNav` -- confirm =
      // router.push, cancel = drop.
      e.preventDefault();
      e.stopPropagation();
      setPendingNav(dest.pathname + dest.search + dest.hash);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase so we run before React's synthetic handlers and
    // next/link's own click handler get a chance to navigate.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty]);

  /** Apply a draft config change: update store, update canvas, mark dirty. */
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
      // Client-side pre-flight: refuse to save if any analytic table
      // has empty or duplicate column names. The worker validates the
      // same constraints, but we want to block the request locally so
      // the rule still applies when the worker is unreachable.
      const localErrors = validateConfigForSave(cfg);
      if (localErrors.length > 0) {
        setValidationErrors(localErrors);
        return;
      }

      // Validate via the worker before saving. Network failures are
      // surfaced to the user instead of silently skipping validation --
      // a worker-down save risks landing a config that's already known
      // to be invalid, so the user must explicitly accept the risk
      // (here, by retrying after the worker is back).
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

      // Honor the ETag we read at load time so a concurrent edit by
      // another session doesn't get silently overwritten. Failures here
      // (5xx, 412 ETag mismatch, network) MUST be surfaced -- previously
      // they were swallowed and the dirty banner cleared as if the save
      // had succeeded.
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
    // Honor the saved `layout` map -- `buildGraph` already reads
    // positions out of it. Only fall back to `autoLayout` when the
    // saved config has no layout at all (e.g. a fresh template-created
    // pipeline). The previous version unconditionally re-ran
    // autoLayout, which silently overwrote any hand-tuned positions
    // the user had previously saved.
    const hasLayout =
      saved.layout && Object.keys(saved.layout).length > 0;
    const positioned = hasLayout
      ? built.nodes
      : autoLayout(built.nodes, built.edges);
    canvasRef.current?.setGraph(positioned, built.edges);
    clearDirty();
    setValidationErrors([]);
  }, [clearDirty]);

  const handleAddNode = useCallback((kind: NodeKind, position: { x: number; y: number }) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;
    const updated = addNodeToConfig(cfg, kind);
    const list = kind === "source" ? updated.source_containers
      : kind === "lookup" ? updated.lookup_mappings
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
    const targetIsMapping = cfg.mappings.some((m) => m.id === targetId);
    const targetIsTable = cfg.analytic_tables.some((t) => t.id === targetId);

    let updated = cfg;
    if (isSource && targetIsMapping) {
      updated = { ...cfg, mappings: cfg.mappings.map((m) => m.id === targetId ? { ...m, source_container_id: sourceId } : m) };
    } else if (isMapping && targetIsTable) {
      const table = cfg.analytic_tables.find((t) => t.id === targetId);
      updated = { ...cfg, mappings: cfg.mappings.map((m) => m.id === sourceId ? syncMappingToTable(m, targetId, table) : m) };
    } else return;
    applyDraft(updated);
  }, [applyDraft]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;

    // Disconnect every edge that references the doomed node first so the
    // same field-clearing rules (including emptying `mapping.columns` when
    // a table connection drops) stay consistent with the edge-disconnect
    // flow.
    let working = cfg;
    for (const m of cfg.mappings) {
      if (m.source_container_id === nodeId) {
        working = disconnectEdgeInConfig(working, nodeId, m.id);
      }
      if (m.analytic_table_id === nodeId) {
        working = disconnectEdgeInConfig(working, m.id, nodeId);
      }
    }

    // If the doomed node is a Lookup, scrub every `lookup_ref` whose
    // root id matches it from every mapping column expression. The
    // user still needs to rewrite the affected columns, but at least
    // the config parses and the worker won't reject it on save with
    // a cryptic "unknown lookup id" error.
    const isLookup = cfg.lookup_mappings.some((l) => l.id === nodeId);
    if (isLookup) {
      working = {
        ...working,
        mappings: working.mappings.map((m) => ({
          ...m,
          columns: m.columns.map((c) => ({
            ...c,
            expr: scrubLookupReferences(c.expr, nodeId),
          })),
        })),
      };
    }

    // Then drop the node itself from its owning collection and clean up
    // its layout entry.
    const updated: PipelineConfig = {
      ...working,
      source_containers: working.source_containers.filter((s) => s.id !== nodeId),
      lookup_mappings: working.lookup_mappings.filter((l) => l.id !== nodeId),
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

  // Disconnect an edge by clearing the underlying config field that produced
  // it. Lookup→mapping edges are derived from AST `lookup_ref` nodes inside a
  // mapping column expression; they cannot be removed from the canvas and the
  // GraphCanvas suppresses the menu item for that edge kind.
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
      <main className="flex items-center justify-center" style={{ height: `calc(100vh - ${TOP_NAV_HEIGHT_PX}px)` }}>
        <div role="status" className="text-sm text-gray-500" data-testid="graph-loading">Loading pipeline…</div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex items-center justify-center" style={{ height: `calc(100vh - ${TOP_NAV_HEIGHT_PX}px)` }}>
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="graph-error">{errorMsg}</div>
      </main>
    );
  }

  const canvasStyle: CSSProperties = selectedNodeValue
    ? { width: `calc(100% - ${NODE_DETAIL_PANEL_WIDTH_PX}px)` }
    : { width: "100%" };
  const initial = initialGraphRef.current ?? { nodes: [], edges: [] };

  return (
    <main className="flex w-screen" style={{ height: `calc(100vh - ${TOP_NAV_HEIGHT_PX}px)` }} data-testid="graph-page">
      <div className="relative h-full" style={canvasStyle}>
        <GraphCanvas
          ref={canvasRef}
          nodes={initial.nodes}
          edges={initial.edges}
          onNodeClick={select}
          onPaneClick={clear}
          onLayout={handleLayoutChange}
          onNodeDragStop={handleLayoutChange}
          onAddNode={handleAddNode}
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
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
            {validationErrors.length > 0 && (
              <div className="w-max max-w-lg rounded-lg border border-red-300 bg-red-50 px-4 py-2 shadow-lg">
                <div className="text-xs font-semibold text-red-700">Validation failed:</div>
                <ul className="mt-1 list-inside list-disc text-xs text-red-600">
                  {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-full border border-orange-300 bg-white px-4 py-2 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              <span className="text-xs font-medium text-gray-700">Unsaved changes</span>
              <button type="button" onClick={handleRevert} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">Revert</button>
              <button type="button" onClick={handlePublish} disabled={saving} className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">
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
          <h2 className="text-lg font-semibold text-gray-900">
            Discard unsaved changes?
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You have edits that haven&rsquo;t been published yet. Leaving
            this page will lose them.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingNav(null)}
              data-testid="discard-nav-cancel"
              className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              Stay on this page
            </button>
            <button
              type="button"
              onClick={() => {
                const dest = pendingNav;
                setPendingNav(null);
                // Mark the page clean so the navigation isn't blocked
                // again by the same handler we just resolved through.
                clearDirty();
                router.push(dest);
              }}
              data-testid="discard-nav-confirm"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Discard and leave
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

/**
 * Block-on-save pre-flight for the structural rules the user must
 * resolve before publishing. Catches:
 *
 *   - empty / duplicate analytic-table column names
 *   - empty node names (source / lookup / mapping / table)
 *   - duplicate node names *within* a single kind (two tables both
 *     called "Transactions" -- the user can't tell them apart in the
 *     sidebar or graph header). Cross-kind name reuse is fine since
 *     the node type is part of the visual identity.
 *
 * Other constraints (worker AST validation, schema-shape sanity)
 * stay on the worker's `/validate` endpoint. Returns one human-
 * readable message per problem so the user knows where to look.
 */
function validateConfigForSave(cfg: PipelineConfig): string[] {
  const errors: string[] = [];

  // Per-kind name uniqueness + non-empty checks. Each kind keeps its
  // own scope so a Source named "Transactions" doesn't collide with a
  // Table named "Transactions" -- they're different shapes in the UI.
  const kinds: { label: string; entities: { id: string; name?: string }[] }[] = [
    { label: "Source", entities: cfg.source_containers },
    { label: "Lookup", entities: cfg.lookup_mappings },
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

  // Per-table column name checks. Empty/duplicate columns inside an
  // analytic table break SQL queries and Parquet output.
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

  return errors;
}

// Sync a Mapping's columns with its newly-connected Analytic_Table schema.
// The mapping's `analytic_table_id` is set to `tableId`, and its `columns`
// are rebuilt to match the table's schema in order. Any existing column
// whose `name` matches a table column keeps its authored `expr`; every
// other column is seeded with `null` (the conventional "absent value" in
// the AST taxonomy) so the user has a row per table column to fill in.
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
