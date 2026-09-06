"use client";

// CodeMirror YAML editor for dashboard configs: line numbers, syntax
// highlighting, two-space tab handling, schema-aware autocomplete, and
// parent-supplied diagnostics rendered as inline lint.

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { yaml } from "@codemirror/lang-yaml";
import { editorHighlight, editorTheme } from "@/components/editor/theme";
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
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  const schemaRef = useRef(sqlSchema);
  schemaRef.current = sqlSchema;

  useEffect(() => {
    if (!hostRef.current) return;

    const complete = (context: CompletionContext): CompletionResult | null => {
      const source = context.state.doc.toString();
      const line = context.state.doc.lineAt(context.pos);

      // The in-progress line is usually invalid YAML; resolve the path
      // against the doc with it blanked, anchored at the previous line.
      const cleaned =
        source.slice(0, line.from) + " ".repeat(line.length) + source.slice(line.to);
      const anchor = Math.max(line.from - 1, 0);
      let { path, kind } = pathInfoAtOffset(cleaned, anchor);
      // A scalar anchor (the previous line's value) means we're a
      // sibling key in its parent map.
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
          options: queryCompletions(source, schemaRef.current).map((o) => ({
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
        ? completionsAt(source, path, false, valueMatch[1], schemaRef.current)
        : completionsAt(source, path, true, null, schemaRef.current);
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
      return diagnosticsRef.current.map((d) => {
        const range = d.path ? offsetForPath(source, d.path) : null;
        const from = Math.min(range?.[0] ?? 0, max);
        const to = Math.min(range?.[1] ?? Math.min(1, max), max);
        return { from, to: Math.max(to, from), severity: "error" as const, message: d.message };
      });
    };

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          indentUnit.of("  "),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
          yaml(),
          autocompletion({ override: [complete] }),
          linter(lintSource, { delay: 300 }),
          lintGutter(),
          editorTheme,
          syntaxHighlighting(editorHighlight),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (hostRef.current.firstElementChild) {
      hostRef.current.firstElementChild.setAttribute("aria-label", ariaLabel);
    }
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount-only: the editor owns the doc; external replacement below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value replacement (initial load resolves after mount).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  // Diagnostics changed: nudge the linter to re-run against the ref.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // A no-op transaction retriggers the linter after its delay.
    view.dispatch({});
  }, [diagnostics]);

  return (
    <div
      ref={hostRef}
      className="min-h-0 flex-1 overflow-auto [&_.cm-editor]:h-full"
      data-testid="yaml-editor"
    />
  );
}
