// Expression language support for the mapping expression editor:
// stream-based highlighting, context completions, and lint built on the
// existing parser. Pure helpers are exported for unit tests.

import { StreamLanguage } from "@codemirror/language";
import type { Diagnostic } from "@codemirror/lint";
import { parseExpression } from "@/lib/graph/expressionParser";
import type { AstNode } from "@/lib/types/config";

/** Function signatures offered by completion, with display details. */
export const EXPRESSION_FUNCTIONS: { label: string; detail: string }[] = [
  { label: "upper", detail: "upper(x)" },
  { label: "lower", detail: "lower(x)" },
  { label: "trim", detail: "trim(x)" },
  { label: "concat", detail: 'concat("sep", a, b)' },
  { label: "coalesce", detail: "coalesce(a, b, ...)" },
  { label: "substring", detail: "substring(x, start, len?)" },
  { label: "contains", detail: "contains(x, pattern)" },
  { label: "if", detail: "if(cond, then, else)" },
  { label: "parse_date", detail: 'parse_date(x, "%Y-%m-%d")' },
  { label: "year", detail: "year(date)" },
  { label: "month", detail: "month(date)" },
  { label: "day", detail: "day(date)" },
  { label: "cast", detail: 'cast(x, "int64")' },
  { label: "lookup_ref", detail: "lookup_ref(id, x)" },
  { label: "col", detail: "col(name)" },
];

export const CAST_TYPES = ["int64", "float64", "string", "date"];

const FUNCTION_NAMES = new Set(EXPRESSION_FUNCTIONS.map((f) => f.label));

/** Stream tokenizer for highlighting: strings, numbers, functions, columns. */
export const expressionLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/"([^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/-?\d+(\.\d+)?/)) return "number";
    if (stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();
      if (word === "true" || word === "false" || word === "null") return "bool";
      if (FUNCTION_NAMES.has(word) && stream.peek() === "(") return "keyword";
      return "variableName";
    }
    if (stream.match(/==|!=|>=|<=|[+\-*/><]/)) return "operator";
    stream.next();
    return null;
  },
});

export interface ExpressionCompletionOption {
  label: string;
  type: string;
  detail?: string;
  apply?: string;
}

/**
 * Completion options for the text before the cursor.
 *
 * - after `lookup_ref(`: lookup ids
 * - inside `cast(x, `: the cast type strings
 * - otherwise: functions plus the source columns the expression may
 *   reference (the same set the linter validates against)
 */
export function expressionCompletions(
  before: string,
  sourceColumns: string[] | null | undefined,
  lookupIds: string[],
): ExpressionCompletionOption[] {
  if (/lookup_ref\(\s*"?[\w-]*$/.test(before)) {
    return lookupIds.map((id) => ({ label: id, type: "constant", detail: "lookup" }));
  }
  if (/cast\([^(),]*,\s*"?\w*$/.test(before)) {
    return CAST_TYPES.map((t) => ({
      label: t,
      type: "type",
      apply: /"\w*$/.test(before) ? t : `"${t}"`,
    }));
  }
  return [
    ...(sourceColumns ?? []).map((c) => ({
      label: c,
      type: "variable",
      detail: "source column",
    })),
    ...EXPRESSION_FUNCTIONS.map((f) => ({
      label: f.label,
      type: "function",
      detail: f.detail,
      apply: `${f.label}(`,
    })),
  ];
}

function collectColRefs(node: AstNode): string[] {
  if (node.kind === "col") return [node.name];
  const refs: string[] = [];
  for (const v of Object.values(node)) {
    if (v && typeof v === "object" && "kind" in v) refs.push(...collectColRefs(v as AstNode));
    if (Array.isArray(v))
      for (const item of v)
        if (item && typeof item === "object" && "kind" in item)
          refs.push(...collectColRefs(item as AstNode));
  }
  return refs;
}

/**
 * Lint one expression text. Parse errors carry the parser's position;
 * unresolved column references underline each occurrence of the name.
 * `sourceColumns` semantics match the mapping editor: `string[]` =
 * validate against the set, `null` = source deleted, `undefined` = no
 * source connected.
 */
export function lintExpression(
  text: string,
  sourceColumns: string[] | null | undefined,
): Diagnostic[] {
  if (text.trim() === "") return [];
  const result = parseExpression(text);
  if (!result.ok) {
    const from = Math.min(result.pos, Math.max(text.length - 1, 0));
    return [
      {
        from,
        to: Math.min(from + 1, text.length),
        severity: "error",
        message: result.error,
      },
    ];
  }

  const refs = [...new Set(collectColRefs(result.value))];
  if (refs.length === 0) return [];

  const unknown =
    sourceColumns === undefined || sourceColumns === null
      ? refs
      : refs.filter((r) => !sourceColumns.includes(r));
  const reason =
    sourceColumns === undefined
      ? "no source container connected"
      : sourceColumns === null
        ? "source container is missing or deleted"
        : "not a source column";

  const out: Diagnostic[] = [];
  for (const name of unknown) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    for (const m of text.matchAll(re)) {
      out.push({
        from: m.index,
        to: m.index + name.length,
        severity: "error",
        message: `Unknown column \`${name}\`: ${reason}`,
      });
    }
  }
  return out;
}
