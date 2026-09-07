/**
 * Mint an opaque id: `<prefix>-<base36 ms>-<6 base36 chars>`. One format
 * for every entity (pipelines, jobs, dashboards). Ids are never parsed —
 * ordering and timestamps always come from stored record data.
 */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
