// Helpers for the Properties tab of a table on the Data page.

import type { PipelineConfig } from "@/lib/types/config";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export interface TableSource {
  mapping: string;
  /** Source container name, or its id when the container is missing. */
  source: string;
  /** The mapping has a row filter. */
  filtered: boolean;
}

/** The mappings that write into a table, with the source each reads. */
export function tableSources(config: Pick<PipelineConfig, "mappings" | "source_containers">, tableId: string): TableSource[] {
  const sources = new Map(config.source_containers.map((s) => [s.id, s.name]));
  return config.mappings
    .filter((m) => m.analytic_table_id === tableId)
    .map((m) => ({
      mapping: m.name,
      source: sources.get(m.source_container_id) ?? m.source_container_id,
      filtered: m.where !== undefined && m.where !== null,
    }));
}
