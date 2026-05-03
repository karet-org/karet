// Zustand store for graph UI state: selected node id and the live
// `PipelineConfig`. Edits are applied directly to `config` via
// `setState({ config })`; the old drafts/toast/saveStatus indirection
// was removed when the graph page took over save-and-publish flow.

import { create } from "zustand";
import type { PipelineConfig } from "../types/config";

export interface GraphStore {
  // ---- selection ------------------------------------------------------
  selectedNodeId: string | null;
  select: (id: string | null) => void;
  clear: () => void;

  // ---- config ---------------------------------------------------------
  config: PipelineConfig | null;
  /** S3 ETag of the currently-loaded config, for optimistic concurrency. */
  etag: string | null;
  setConfig: (config: PipelineConfig | null, etag?: string | null) => void;
}

export const useGraphStore = create<GraphStore>((set) => ({
  // selection
  selectedNodeId: null,
  select: (id) => set({ selectedNodeId: id }),
  clear: () => set({ selectedNodeId: null }),

  // config
  config: null,
  etag: null,
  setConfig: (config, etag) => set({ config, etag: etag ?? null }),
}));
