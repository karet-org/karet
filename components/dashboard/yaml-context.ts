// Pure helpers for YAML editing: path at offset, path to offset, and
// schema-driven completions.

import { parseDocument, isMap, isSeq, isPair, isScalar, type Node } from "yaml";
import { PANEL_KINDS_V2, filterParams, type DashboardFilterV2 } from "@/lib/types/dashboard-v2";

export type YamlPath = (string | number)[];

const TOP_KEYS = ["version", "id", "name", "filters", "panels", "layout"];
const PANEL_COMMON = ["kind", "title", "query", "query_id", "grid"];
const PANEL_BINDINGS: Record<string, string[]> = {
  kpi: ["value", "format", "currency", "icon"],
  bar: ["x", "y", "series", "horizontal"],
  line: ["x", "y", "series"],
  doughnut: ["label", "value"],
  table: ["columns", "page_size"],
  sankey: ["source", "target", "value", "source_layer", "target_layer"],
  choropleth_map: ["region", "value"],
  symbol_map: ["lat", "lon", "value", "label", "max_radius"],
  summary: [],
};
const FILTER_KEYS = ["name", "kind", "label", "options_sql"];
const GRID_KEYS = ["span", "aspect", "maxHeight"];
const LAYOUT_KEYS = ["columns", "gap"];

const ENUMS: Record<string, string[]> = {
  format: ["number", "currency", "raw"],
  icon: ["dollar", "chart", "shapes", "calendar"],
  aspect: ["auto", "square", "video"],
  span: ["full"],
};

interface Visited {
  path: YamlPath;
  node: Node;
}

export interface PathInfo {
  path: YamlPath;
  kind: "map" | "seq" | "scalar";
}

function nodeRange(node: Node): [number, number] | null {
  const r = (node as { range?: [number, number, number] }).range;
  return r ? [r[0], r[1]] : null;
}

/** Deepest path whose node contains `offset`. */
export function pathAtOffset(source: string, offset: number): YamlPath {
  return pathInfoAtOffset(source, offset).path;
}

/** Deepest path plus the resolved node's shape. */
export function pathInfoAtOffset(source: string, offset: number): PathInfo {
  const doc = parseDocument(source, { keepSourceTokens: true });
  let best: Visited | null = null;

  const walk = (node: unknown, path: YamlPath) => {
    if (node == null || typeof node !== "object") return;
    if (isMap(node)) {
      for (const item of node.items) {
        if (!isPair(item)) continue;
        const key = isScalar(item.key) ? String(item.key.value) : "";
        if (item.value != null && typeof item.value === "object") {
          const r = nodeRange(item.value as Node);
          if (r && offset >= r[0] && offset <= r[1]) {
            best = { path: [...path, key], node: item.value as Node };
            walk(item.value, [...path, key]);
          }
        }
        // Cursor on the key or in the whitespace of this pair's line.
        const kr = item.key ? nodeRange(item.key as Node) : null;
        if (kr && offset >= kr[0] && offset <= kr[1] + 1) {
          best = best ?? { path, node: node as Node };
        }
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => {
        if (item != null && typeof item === "object") {
          const r = nodeRange(item as Node);
          if (r && offset >= r[0] && offset <= r[1]) {
            best = { path: [...path, i], node: item as Node };
            walk(item, [...path, i]);
          }
        }
      });
    }
  };
  if (doc.contents) walk(doc.contents, []);
  if (!best) return { path: [], kind: "map" };
  const node = (best as Visited).node;
  const kind = isMap(node) ? "map" : isSeq(node) ? "seq" : "scalar";
  return { path: (best as Visited).path, kind };
}

/** Offset of the node (its key when possible) at a validation path. */
export function offsetForPath(source: string, path: YamlPath): [number, number] | null {
  const doc = parseDocument(source);
  let node: unknown = doc.contents;
  let lastPairKeyRange: [number, number] | null = null;
  for (const seg of path) {
    if (isMap(node)) {
      const pair = node.items.find(
        (p) => isPair(p) && isScalar(p.key) && String(p.key.value) === String(seg),
      );
      if (!pair || !isPair(pair)) return lastPairKeyRange;
      lastPairKeyRange = pair.key ? nodeRange(pair.key as Node) : lastPairKeyRange;
      node = pair.value;
    } else if (isSeq(node) && typeof seg === "number") {
      node = node.items[seg];
      if (node != null && typeof node === "object") {
        const r = nodeRange(node as Node);
        if (r) lastPairKeyRange = [r[0], Math.min(r[1], r[0] + 40)];
      }
    } else {
      return lastPairKeyRange;
    }
  }
  // Prefer the key range so diagnostics underline the property name.
  if (lastPairKeyRange) return lastPairKeyRange;
  if (node != null && typeof node === "object") {
    const r = nodeRange(node as Node);
    if (r) return r;
  }
  return null;
}

export interface CompletionOption {
  label: string;
  type: "property" | "keyword" | "variable" | "class";
  detail?: string;
}

/** Panel kind at panels[i] in the parsed doc, if set. */
function panelKind(source: string, index: number): string | null {
  try {
    const doc = parseDocument(source);
    const kind = doc.getIn(["panels", index, "kind"]);
    return typeof kind === "string" ? kind : null;
  } catch {
    return null;
  }
}

/** Completions at `path`: keys when keyContext, else values for valueKey. */
export function completionsAt(
  source: string,
  path: YamlPath,
  keyContext: boolean,
  valueKey: string | null,
): CompletionOption[] {
  // Value positions: enums and kind lists.
  if (!keyContext && valueKey) {
    if (valueKey === "kind") {
      const inFilters = path[0] === "filters";
      const kinds = inFilters ? ["dropdown", "date_range"] : [...PANEL_KINDS_V2];
      return kinds.map((k) => ({ label: k, type: "keyword" }));
    }
    if (ENUMS[valueKey]) {
      return ENUMS[valueKey].map((v) => ({ label: v, type: "keyword" }));
    }
    return [];
  }

  // Key positions by context.
  if (path.length === 0) {
    return TOP_KEYS.map((k) => ({ label: k, type: "property" }));
  }
  if (path[0] === "panels" && typeof path[1] === "number" && path.length === 2) {
    const kind = panelKind(source, path[1]);
    const bindings = kind ? (PANEL_BINDINGS[kind] ?? []) : [];
    const all = [...PANEL_COMMON, ...bindings];
    return all.map((k) => ({
      label: k,
      type: "property",
      detail: bindings.includes(k) ? `${kind} binding` : undefined,
    }));
  }
  if (path[0] === "filters" && typeof path[1] === "number" && path.length === 2) {
    return FILTER_KEYS.map((k) => ({ label: k, type: "property" }));
  }
  if (path[path.length - 1] === "grid") {
    return GRID_KEYS.map((k) => ({ label: k, type: "property" }));
  }
  if (path[0] === "layout" && path.length === 1) {
    return LAYOUT_KEYS.map((k) => ({ label: k, type: "property" }));
  }
  return [];
}

/** Completions inside a `query` block: $params, tables, columns. */
export function queryCompletions(
  source: string,
  sqlSchema: Record<string, string[]>,
): CompletionOption[] {
  const out: CompletionOption[] = [];
  try {
    const doc = parseDocument(source);
    const filters = doc.get("filters");
    if (isSeq(filters)) {
      for (const f of filters.items) {
        const filter = (isMap(f) ? f.toJSON() : null) as DashboardFilterV2 | null;
        if (filter?.name && filter?.kind) {
          for (const p of filterParams(filter)) {
            out.push({ label: `$${p}`, type: "variable", detail: "filter param" });
          }
        }
      }
    }
  } catch {
    // No params from an unparseable doc.
  }
  for (const [table, columns] of Object.entries(sqlSchema)) {
    out.push({ label: table, type: "class", detail: "table" });
    for (const c of columns) out.push({ label: c, type: "property", detail: table });
  }
  return out;
}
