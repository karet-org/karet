// What changed between two configs, in the pipeline's own terms.
//
// A textual diff of the JSON is nearly useless here: the graph editor rebuilds
// objects on every edit, so key order moves and layout coordinates drift by
// fractions, and a one-column change reads as a hundred moved lines. This
// compares entities by id and reports the shape of the change instead.
//
// Layout is ignored deliberately: dragging a node is not a change to the
// pipeline, and treating it as one would fill the history with noise.

import type { PipelineConfig } from "@/lib/types/config";

export type ChangeKind = "added" | "removed" | "changed";

export interface EntityChange {
  kind: ChangeKind;
  /** "Source", "Dimension", "Mapping", "Table". */
  entity: string;
  id: string;
  name?: string;
  /** For "changed": which fields differ, in config terms. */
  fields?: string[];
}

export interface ConfigDiff {
  changes: EntityChange[];
  /** True when nothing but layout (or nothing at all) differs. */
  onlyLayout: boolean;
}

interface Entity {
  id: string;
  name?: string;
}

function byId<T extends Entity>(list: T[] | undefined): Map<string, T> {
  return new Map((list ?? []).map((e) => [e.id, e]));
}

/** Stable JSON with sorted keys, so a rebuilt object compares equal. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/** Top-level fields that differ between two entities. */
function changedFields(before: Entity, after: Entity): string[] {
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const key of keys) {
    if (canonical(a[key]) !== canonical(b[key])) out.push(key);
  }
  return out.sort();
}

function diffKind(
  entity: string,
  before: Entity[] | undefined,
  after: Entity[] | undefined,
): EntityChange[] {
  const a = byId(before);
  const b = byId(after);
  const changes: EntityChange[] = [];

  for (const [id, entry] of b) {
    const prior = a.get(id);
    if (!prior) {
      changes.push({ kind: "added", entity, id, name: entry.name });
      continue;
    }
    const fields = changedFields(prior, entry);
    if (fields.length > 0) {
      changes.push({ kind: "changed", entity, id, name: entry.name, fields });
    }
  }
  for (const [id, entry] of a) {
    if (!b.has(id)) changes.push({ kind: "removed", entity, id, name: entry.name });
  }
  return changes;
}

export function diffConfigs(
  before: PipelineConfig | null,
  after: PipelineConfig | null,
): ConfigDiff {
  if (!before || !after) return { changes: [], onlyLayout: false };

  const changes = [
    ...diffKind("Source", before.source_containers, after.source_containers),
    ...diffKind("Dimension", before.dimensions, after.dimensions),
    ...diffKind("Mapping", before.mappings, after.mappings),
    ...diffKind("Table", before.analytic_tables, after.analytic_tables),
  ];

  if (before.name !== after.name) {
    changes.push({
      kind: "changed",
      entity: "Pipeline",
      id: "name",
      name: after.name,
      fields: ["name"],
    });
  }

  return { changes, onlyLayout: changes.length === 0 };
}

/** One-line summary, e.g. "2 changed, 1 added". */
export function summarizeDiff(diff: ConfigDiff): string {
  if (diff.changes.length === 0) return "layout only";
  const counts = new Map<ChangeKind, number>();
  for (const c of diff.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  return (["added", "removed", "changed"] as ChangeKind[])
    .filter((k) => counts.has(k))
    .map((k) => `${counts.get(k)} ${k}`)
    .join(", ");
}
