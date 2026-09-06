"use client";

// CodeMirror SQL editor on the shared CodeEditor host: schema-aware
// autocomplete (reconfigured in place), Ctrl+Enter runs.

import { useEffect, useRef } from "react";
import { Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { sql } from "@codemirror/lang-sql";
import CodeEditor from "@/components/editor/CodeEditor";

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
  const viewRef = useRef<EditorView | null>(null);
  const schemaCompartment = useRef(new Compartment());
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  // Schema updates reconfigure completion in place.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: schemaCompartment.current.reconfigure(sql({ schema })),
    });
  }, [schema]);

  return (
    <CodeEditor
      value={value}
      onChange={onChange}
      ariaLabel="SQL editor"
      testId="sql-editor"
      className="h-[88px] overflow-hidden"
      viewRef={viewRef}
      extensions={[
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
        schemaCompartment.current.of(sql({ schema: {} })),
        cmPlaceholder(placeholder ?? ""),
      ]}
    />
  );
}
