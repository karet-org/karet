"use client";

// Dashboard YAML editor on the shared CodeEditor host: line numbers,
// highlighting, context completion, and parent-supplied diagnostics.

import { yaml } from "@codemirror/lang-yaml";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { Diagnostic } from "@codemirror/lint";
import CodeEditor from "@/components/editor/CodeEditor";
import {
  completionsAt,
  offsetForPath,
  pathAtOffset,
  pathInfoAtOffset,
  queryCompletions,
  type YamlPath,
} from "./yaml-context";

export interface EditorDiagnostic {
  message: string;
  /** YAML path to attach at; null pins to the document start. */
  path: YamlPath | null;
}

export default function YamlEditor({
  value,
  onChange,
  diagnostics,
  sqlSchema,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  diagnostics: EditorDiagnostic[];
  sqlSchema: Record<string, string[]>;
  ariaLabel: string;
}) {
  const complete = (context: CompletionContext): CompletionResult | null => {
    const source = context.state.doc.toString();
    const line = context.state.doc.lineAt(context.pos);

    // Resolve the path with the in-progress line blanked.
    const cleaned =
      source.slice(0, line.from) + " ".repeat(line.length) + source.slice(line.to);
    const anchor = Math.max(line.from - 1, 0);
    let { path, kind } = pathInfoAtOffset(cleaned, anchor);
    // A scalar anchor means a sibling key in its parent map.
    if (kind === "scalar" && path.length > 0) path = path.slice(0, -1);
    // The live path (unblanked) wins inside multiline scalars.
    const livePath = pathAtOffset(source, context.pos);
    if (
      livePath[livePath.length - 1] === "query" ||
      livePath[livePath.length - 1] === "options_sql"
    ) {
      path = livePath;
    }

    // Inside a query: params, tables, columns. Word-triggered.
    if (path[path.length - 1] === "query" || path[path.length - 1] === "options_sql") {
      const word = context.matchBefore(/[$\w]+/);
      if (!word && !context.explicit) return null;
      return {
        from: word?.from ?? context.pos,
        options: queryCompletions(source, sqlSchema).map((o) => ({
          label: o.label,
          type: o.type,
          detail: o.detail,
        })),
      };
    }

    // Key vs value position on the current line.
    const before = context.state.sliceDoc(line.from, context.pos);
    const valueMatch = before.match(/^\s*(?:- )?([A-Za-z_][A-Za-z0-9_]*):\s+(\S*)$/);
    const keyMatch = before.match(/^\s*(?:- )?([A-Za-z_]*)$/);
    if (!valueMatch && !keyMatch && !context.explicit) return null;

    const options = valueMatch
      ? completionsAt(source, path, false, valueMatch[1])
      : completionsAt(source, path, true, null);
    if (options.length === 0) return null;

    const word = context.matchBefore(/[\w-]*/);
    return {
      from: word?.from ?? context.pos,
      options: options.map((o) => ({
        label: o.label,
        type: o.type,
        detail: o.detail,
        apply: valueMatch ? o.label : `${o.label}: `,
      })),
    };
  };

  const lintSource = (view: EditorView): Diagnostic[] => {
    const source = view.state.doc.toString();
    const max = source.length;
    return diagnostics.map((d) => {
      const range = d.path ? offsetForPath(source, d.path) : null;
      const from = Math.min(range?.[0] ?? 0, max);
      const to = Math.min(range?.[1] ?? Math.min(1, max), max);
      return { from, to: Math.max(to, from), severity: "error" as const, message: d.message };
    });
  };

  return (
    <CodeEditor
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      testId="yaml-editor"
      className="min-h-0 flex-1 overflow-auto [&_.cm-editor]:h-full"
      extensions={[yaml()]}
      completionSource={complete}
      lintSource={lintSource}
      lintDependency={diagnostics}
      lineNumbers
      tabIndent
    />
  );
}
