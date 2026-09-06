"use client";

// Inline expression input with an expand control. The expanded modal is
// a CodeMirror editor (line numbers, highlighting, lint, autocomplete)
// sharing the same value; closing commits via `onCommit`.

import { useState } from "react";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import Modal from "@/components/ui/Modal";
import { CloseButton } from "@/components/ui/CloseButton";
import CodeEditor from "@/components/editor/CodeEditor";
import {
  expressionCompletions,
  expressionLanguage,
  lintExpression,
} from "./expression-lang";

function ExpandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export interface ExpressionFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Commit handler: inline blur and modal close. */
  onCommit: () => void;
  ariaLabel: string;
  /** Error from the parent's validation, shown under the inline input. */
  error?: string | null;
  inputClassName?: string;
  modalTitle: string;
  /** Valid `col` references; null/undefined per the mapping editor. */
  sourceColumns: string[] | null | undefined;
  /** Lookup ids offered inside `lookup_ref(`. */
  lookupIds: string[];
}

export function ExpressionField({
  value,
  onChange,
  onCommit,
  ariaLabel,
  error,
  inputClassName = "",
  modalTitle,
  sourceColumns,
  lookupIds,
}: ExpressionFieldProps) {
  const [open, setOpen] = useState(false);

  const commitModal = () => {
    onCommit();
    setOpen(false);
  };

  const complete = (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w"]*/);
    if (!word && !context.explicit) return null;
    const before = context.state.sliceDoc(0, context.pos);
    const options = expressionCompletions(before, sourceColumns, lookupIds);
    if (options.length === 0) return null;
    return {
      from: word?.from ?? context.pos,
      options: options.map((o) => ({
        label: o.label,
        type: o.type,
        detail: o.detail,
        apply: o.apply ?? o.label,
      })),
    };
  };

  return (
    <div className="relative flex items-center">
      <input
        aria-label={ariaLabel}
        className={`${inputClassName} pr-7`}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
      <button
        type="button"
        aria-label={`Expand ${ariaLabel}`}
        title="Expand editor"
        onClick={() => setOpen(true)}
        className="absolute right-1 inline-flex h-5 w-5 items-center justify-center rounded text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-carrot)]/50"
      >
        <ExpandIcon />
      </button>

      <Modal
        open={open}
        onClose={commitModal}
        cardClassName="w-full max-w-2xl rounded-xl bg-[color:var(--color-surface)] p-5 text-[color:var(--color-ink)] shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">{modalTitle}</h2>
          <CloseButton size="sm" label="Close editor" onClick={commitModal} />
        </div>
        {open && (
          <div
            className={`mt-3 h-64 overflow-hidden rounded-[9px] border bg-[color:var(--color-bg)] ${
              error
                ? "border-[color:var(--color-rose-deep)]"
                : "border-[color:var(--color-rule-soft)]"
            }`}
          >
            <CodeEditor
              value={value}
              onChange={onChange}
              ariaLabel={`${ariaLabel} (expanded)`}
              testId="expression-editor"
              className="h-full overflow-auto [&_.cm-editor]:h-full"
              extensions={[expressionLanguage]}
              completionSource={complete}
              lintSource={(view) => lintExpression(view.state.doc.toString(), sourceColumns)}
              lintDependency={sourceColumns}
              lineNumbers
              tabIndent
              autoFocus
            />
          </div>
        )}
        {error ? (
          <p className="mt-2 text-xs text-[color:var(--color-rose-deep)]">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={commitModal}
            className="rounded-md bg-[color:var(--color-carrot)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-carrot-deep)]"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default ExpressionField;
