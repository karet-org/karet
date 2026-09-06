// Shared CodeMirror theme mapped to the app's design tokens, used by
// the SQL editor (Data tab) and the dashboard YAML editor.

import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const editorTheme = EditorView.theme(
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
    ".cm-line": { padding: "0 16px 0 8px" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor": { borderLeftColor: "var(--color-ink)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(255, 107, 53, 0.22) !important",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--color-ink-4)",
      border: "none",
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 4px 0 8px",
      minWidth: "0",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--color-ink-2)",
    },
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
    ".cm-completionDetail": {
      color: "var(--color-ink-3)",
      fontStyle: "normal",
      marginLeft: "8px",
    },
    ".cm-diagnostic": {
      fontFamily: "var(--font-sans)",
      fontSize: "12px",
      padding: "4px 8px",
    },
    ".cm-diagnostic-error": { borderLeft: "3px solid var(--color-rose-deep)" },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      textDecoration: "underline wavy var(--color-rose-deep) 1px",
      textUnderlineOffset: "3px",
    },
    ".cm-lint-marker-error": {
      content: "none",
    },
  },
  { dark: true },
);

export const editorHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-carrot-deep)" },
  { tag: tags.propertyName, color: "var(--color-carrot-deep)" },
  { tag: tags.definition(tags.propertyName), color: "var(--color-carrot-deep)" },
  { tag: tags.string, color: "#93ce8c" },
  { tag: tags.number, color: "var(--color-amber-deep)" },
  { tag: tags.bool, color: "#6cb2ff" },
  { tag: tags.null, color: "#6cb2ff" },
  { tag: tags.comment, color: "var(--color-ink-3)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--color-ink-2)" },
  { tag: tags.typeName, color: "#6cb2ff" },
  { tag: tags.function(tags.variableName), color: "#6cb2ff" },
]);
