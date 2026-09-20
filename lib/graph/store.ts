// Zustand store for graph UI state: selected node id and the live
// `PipelineConfig`.

import { create } from "zustand";
import type { PipelineConfig } from "../types/config";

export interface GraphStore {
  selectedNodeId: string | null;
  select: (id: string | null) => void;
  clear: () => void;

  config: PipelineConfig | null;
  /** Version of the loaded config, sent back on save so a stale save is refused. */
  configVersion: string | null;
  setConfig: (config: PipelineConfig | null, configVersion?: string | null) => void;
}

export const useGraphStore = create<GraphStore>((set) => ({
  selectedNodeId: null,
  select: (id) => set({ selectedNodeId: id }),
  clear: () => set({ selectedNodeId: null }),

  config: null,
  configVersion: null,
  setConfig: (config, configVersion) => set({ config, configVersion: configVersion ?? null }),
}));
