"use client";

// CodeMirror SQL editor: schema-aware autocomplete, Ctrl+Enter runs.

import { useEffect, useRef } from "react";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  autocompletion,
  closeBrackets,
  completionKeymap,
} from "@codemirror/autocomplete";
import { syntaxHighlighting } from "@codemirror/language";
import { sql } from "@codemirror/lang-sql";
import { editorHighlight, editorTheme } from "@/components/editor/theme";



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
          editorTheme,
          syntaxHighlighting(editorHighlight),
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
