"use client";

// Shared CodeMirror host used by the YAML, SQL, and expression editors.
//
// Owns the boilerplate every editor repeated: mount/teardown, the app
// theme + highlight style, external value replacement, fresh callback
// refs so the view never remounts, an optional completion override, an
// optional lint source with gutter, and the Tab behavior (accept an
// open completion, indent a selection, else insert spaces). Language
// and any extra keymaps arrive via `extensions`.

import { useEffect, useRef, type MutableRefObject } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers as cmLineNumbers } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from "@codemirror/commands";
import {
  acceptCompletion,
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import { editorHighlight, editorTheme } from "./theme";

export interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Language support and any editor-specific extensions/keymaps. */
  extensions?: Extension[];
  /** Completion override; kept fresh via ref, safe to close over props. */
  completionSource?: (context: CompletionContext) => CompletionResult | null;
  /** Lint source; kept fresh via ref. */
  lintSource?: (view: EditorView) => Diagnostic[];
  /** Re-runs the linter when this value changes identity. */
  lintDependency?: unknown;
  /** Show the line-number gutter. */
  lineNumbers?: boolean;
  /** Tab accepts completion / indents selection / inserts the unit. */
  tabIndent?: boolean;
  ariaLabel: string;
  testId?: string;
  className?: string;
  autoFocus?: boolean;
  /** Escape hatch for imperative needs (compartment reconfigure). */
  viewRef?: MutableRefObject<EditorView | null>;
}

export default function CodeEditor({
  value,
  onChange,
  extensions = [],
  completionSource,
  lintSource,
  lintDependency,
  lineNumbers = false,
  tabIndent = false,
  ariaLabel,
  testId,
  className,
  autoFocus = false,
  viewRef: externalViewRef,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const completeRef = useRef(completionSource);
  completeRef.current = completionSource;
  const lintRef = useRef(lintSource);
  lintRef.current = lintSource;

  useEffect(() => {
    if (!hostRef.current) return;

    const built: Extension[] = [history(), indentUnit.of("  ")];
    if (lineNumbers) built.push(cmLineNumbers());
    if (tabIndent) {
      built.push(
        keymap.of([
          {
            key: "Tab",
            shift: indentLess,
            run: (view) => {
              if (acceptCompletion(view)) return true;
              if (view.state.selection.ranges.some((r) => !r.empty)) {
                return indentMore(view);
              }
              view.dispatch(view.state.replaceSelection("  "), {
                scrollIntoView: true,
                userEvent: "input",
              });
              return true;
            },
          },
        ]),
      );
    }
    built.push(keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]));
    built.push(...extensions);
    if (completionSource) {
      built.push(autocompletion({ override: [(ctx) => completeRef.current?.(ctx) ?? null] }));
    }
    if (lintSource) {
      // No lint gutter: it reserves a column even when empty, and the
      // wavy underline + hover tooltip already carry the diagnostics.
      built.push(linter((view) => lintRef.current?.(view) ?? [], { delay: 300 }));
    }
    built.push(
      editorTheme,
      syntaxHighlighting(editorHighlight),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
    );

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({ doc: value, extensions: built }),
    });
    viewRef.current = view;
    if (externalViewRef) externalViewRef.current = view;
    if (hostRef.current.firstElementChild) {
      hostRef.current.firstElementChild.setAttribute("aria-label", ariaLabel);
    }
    if (autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
      if (externalViewRef) externalViewRef.current = null;
    };
    // Mount-only: the editor owns the doc; external replacement below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value replacement (load resolves after mount, chips, etc.).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  // A no-op transaction retriggers the linter after its delay.
  useEffect(() => {
    viewRef.current?.dispatch({});
  }, [lintDependency]);

  return <div ref={hostRef} className={className} data-testid={testId} />;
}
