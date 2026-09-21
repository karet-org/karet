// A unified diff between two configs, the way `git diff` shows two files.
//
// Configs are JSON, so a naive text diff would be dominated by noise: the graph
// editor rebuilds objects on every edit, so key order moves, and dragging a node
// rewrites coordinates by fractions. Both sides are therefore canonicalised
// first — keys sorted recursively, node positions dropped — and only then
// compared line by line.
//
// The diff itself comes from `diff`, rather than a hand-rolled LCS. Displaying a
// wrong diff is worse than not showing one, and this is a solved problem.

import { structuredPatch } from "diff";
import type { PipelineConfig } from "@/lib/types/config";

export type LineKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: LineKind;
  text: string;
}

export interface DiffHunk {
  /** `@@ -12,7 +12,9 @@`, built from the patch's own line numbers. */
  header: string;
  lines: DiffLine[];
}

export interface UnifiedDiff {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  /** True when the two sides are identical once canonicalised. */
  identical: boolean;
}

/**
 * Stable JSON: keys sorted at every level, `layout` omitted.
 *
 * Sorting is what keeps a rebuilt object from reading as a change. Dropping
 * layout is a judgement: moving a node around the canvas is recorded in history,
 * but it is not a change to what the pipeline does, and a diff full of shifted
 * coordinates buries the edit that matters.
 */
export function canonicalJson(config: unknown): string {
  return JSON.stringify(sortKeys(stripLayout(config)), null, 2);
}

function stripLayout(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const { layout: _layout, ...rest } = value as Record<string, unknown>;
  return rest;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}

/**
 * Diff `from` (the live config) against `to` (the version being inspected), so
 * the result reads as "what restoring this would change".
 */
export function unifiedConfigDiff(
  from: PipelineConfig | null,
  to: PipelineConfig | null,
  context = 3,
): UnifiedDiff {
  if (!from || !to) return { hunks: [], additions: 0, deletions: 0, identical: false };

  const left = canonicalJson(from);
  const right = canonicalJson(to);
  if (left === right) return { hunks: [], additions: 0, deletions: 0, identical: true };

  const patch = structuredPatch("live", "version", `${left}\n`, `${right}\n`, undefined, undefined, {
    context,
  });

  let additions = 0;
  let deletions = 0;
  const hunks: DiffHunk[] = patch.hunks.map((h) => ({
    header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    lines: h.lines.flatMap((raw): DiffLine[] => {
      const marker = raw[0];
      const text = raw.slice(1);
      if (marker === "+") {
        additions += 1;
        return [{ kind: "added", text }];
      }
      if (marker === "-") {
        deletions += 1;
        return [{ kind: "removed", text }];
      }
      // `\ No newline at end of file` carries no content worth showing.
      if (marker === "\\") return [];
      return [{ kind: "context", text }];
    }),
  }));

  return { hunks, additions, deletions, identical: false };
}
