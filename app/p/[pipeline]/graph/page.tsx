"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { buildGraph, type GraphNode } from "@/lib/graph/build";
import { autoLayout, layoutToConfig } from "@/lib/graph/layout";
import { useGraphStore } from "@/lib/graph/store";
import { addNodeToConfig, disconnectEdgeInConfig, type NodeKind } from "@/lib/graph/nodeDefaults";
import type { PipelineConfig } from "@/lib/types/config";
import GraphCanvas, { type GraphCanvasHandle } from "@/components/graph/GraphCanvas";
import { TOP_NAV_HEIGHT_PX } from "@/components/layout/TopNav";
import NodeDetailPanel, {
  NODE_DETAIL_PANEL_WIDTH_PX,
} from "@/components/graph/NodeDetailPanel";

type LoadState = "loading" | "error" | "ready";

export default function PipelineGraphPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const [status, setStatus] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const select = useGraphStore((s) => s.select);
  const clear = useGraphStore((s) => s.clear);
  const setConfig = useGraphStore((s) => s.setConfig);
  // Subscribe to config so the page re-renders when editors mutate the
  // store — otherwise `selectedNodeValue` stays stale and controlled
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
      // Ignore modified clicks and non-primary buttons — those are the
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

      // Skip new-tab links and downloads — those don't navigate the
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

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
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

  /** Snapshot the current canvas and PUT it as the pipeline's preview. */  const captureAndUploadPreview = useCallback(async () => {
    try {
      const dataUrl = await canvasRef.current?.capturePreview();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      await fetch(`/api/p/${pipeline}/preview`, { method: "PUT", body: blob });
    } catch {
      // Silent: the homepage falls back to a 1x1 placeholder if no
      // preview exists, so a capture failure isn't user-visible.
    }
  }, [pipeline]);

  // Auto-capture a preview the first time a pipeline is viewed if none
  // exists yet. Covers the "just created from template" case: the user
  // lands on this page, navigates home without saving, and otherwise
  // would see an empty thumbnail card. Runs once per mount, and only
  // after React Flow's fitView has had a moment to settle so the
  // rendered viewport matches what the user sees.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const head = await fetch(`/api/p/${pipeline}/preview`, { method: "HEAD" });
        if (head.status === 200) return; // Real preview already exists.
        if (head.status !== 404) return; // Other error — don't clobber.
        if (cancelled) return;
        await captureAndUploadPreview();
      } catch { /* silent */ }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [status, pipeline, captureAndUploadPreview]);

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
      // Validate via the worker before saving
      try {
        const valRes = await fetch(`/api/p/${pipeline}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cfg),
        });
        const valData = await valRes.json();
        if (valData.ok === false && valData.errors?.length > 0) {
          setValidationErrors(valData.errors.map((e: { message: string }) => e.message));
          return;
        }
      } catch { /* worker unreachable, skip validation */ }

      const res = await fetch(`/api/p/${pipeline}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      savedConfigRef.current = cfg;
      useGraphStore.setState({ config: cfg, etag: data.etag ?? null });
      clearDirty();

      // Fire-and-forget preview capture so the homepage card reflects the
      // just-published state.
      void captureAndUploadPreview();
    } finally {
      setSaving(false);
    }
  }, [pipeline, clearDirty, captureAndUploadPreview]);

  const handleRevert = useCallback(() => {
    const saved = savedConfigRef.current;
    if (!saved) return;
    useGraphStore.setState({ config: saved });
    const built = buildGraph(saved);
    canvasRef.current?.setGraph(autoLayout(built.nodes, built.edges), built.edges);
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
    </main>
  );
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
