"use client";

// CodeMirror-based SQL editor with schema-aware autocomplete. The
// schema (table -> columns) comes from data the page already has; run
// is bound to Ctrl/Cmd+Enter.

import { useEffect, useRef } from "react";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  autocompletion,
  closeBrackets,
  completionKeymap,
} from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { sql } from "@codemirror/lang-sql";
import { tags } from "@lezer/highlight";

const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      fontSize: "12px",
      height: "100%",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      caretColor: "var(--color-ink)",
      padding: "12px 0",
    },
    ".cm-line": { padding: "0 16px" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor": { borderLeftColor: "var(--color-ink)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(255, 107, 53, 0.22) !important",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
    ".cm-tooltip": {
      backgroundColor: "var(--color-surface-2)",
      border: "1px solid var(--color-rule-soft)",
      borderRadius: "8px",
      color: "var(--color-ink-2)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete ul li": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      padding: "3px 8px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--color-carrot-soft)",
      color: "var(--color-ink)",
    },
    ".cm-completionMatchedText": {
      color: "var(--color-carrot-deep)",
      textDecoration: "none",
    },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-carrot-deep)" },
  { tag: tags.string, color: "#93ce8c" },
  { tag: tags.number, color: "var(--color-amber-deep)" },
  { tag: tags.comment, color: "var(--color-ink-3)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--color-ink-2)" },
  { tag: tags.typeName, color: "#6cb2ff" },
  { tag: tags.function(tags.variableName), color: "#6cb2ff" },
]);

export interface SqlSchema {
  /** table slug -> column names */
  [table: string]: string[];
}

export default function SqlEditor({
  value,
  onChange,
  onRun,
  schema,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  onRun: () => void;
  schema: SqlSchema;
  placeholder?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const schemaCompartment = useRef(new Compartment());
  // Fresh callbacks without re-creating the editor.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          closeBrackets(),
          autocompletion(),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  onRunRef.current();
                  return true;
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
          schemaCompartment.current.of(sql({ schema: {} })),
          theme,
          syntaxHighlighting(highlight),
          cmPlaceholder(placeholder ?? ""),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor owns the document after mount; `value` is initial-only
    // except for external replacements handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (saved-query chips, table inserts) replace the doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  // Schema updates reconfigure completion in place.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: schemaCompartment.current.reconfigure(sql({ schema })),
    });
  }, [schema]);

  return <div ref={hostRef} className="h-[88px] overflow-hidden" data-testid="sql-editor" />;
}
