/**
 * CodeMirror 6 theme matching the app's dark theme.
 *
 * Colors derived from the app's oklch design system:
 * - background: oklch(0.18 0.015 250) ~ #1d2130
 * - card: oklch(0.22 0.015 250) ~ #262a39
 * - border: oklch(0.32 0.015 250) ~ #3d4356
 * - foreground: oklch(0.95 0.005 250) ~ #f0f1f4
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const appLightTheme = EditorView.theme({
  "&": {
    backgroundColor: "#ffffff",
    color: "#0a0a0a",
  },
  ".cm-content": {
    caretColor: "#171717",
    fontFamily: "monospace",
    fontSize: "14px",
    padding: "12px 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#171717",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#acd7ff",
  },
  ".cm-activeLine": {
    backgroundColor: "#f5f5f580",
  },
  ".cm-gutters": {
    backgroundColor: "#ffffff",
    color: "#737373",
    borderRight: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#f5f5f580",
    color: "#171717",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 16px",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-placeholder": {
    color: "#737373",
    fontStyle: "normal",
  },
});

export const appDarkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#1d2130",
      color: "#f0f1f4",
    },
    ".cm-content": {
      caretColor: "#e2e8f0",
      fontFamily: "monospace",
      fontSize: "14px",
      padding: "12px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#e2e8f0",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#3d435680",
    },
    ".cm-activeLine": {
      backgroundColor: "#262a3980",
    },
    ".cm-gutters": {
      backgroundColor: "#1d2130",
      color: "#64748b",
      borderRight: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#262a3980",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 16px",
    },
    ".cm-tooltip": {
      backgroundColor: "#262a39",
      border: "1px solid #3d4356",
      color: "#e2e8f0",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      backgroundColor: "#262a39",
      border: "1px solid #3d4356",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#3d435680",
    },
    ".cm-panels": {
      backgroundColor: "#262a39",
      color: "#e2e8f0",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      outline: "1px solid #3d4356",
    },
    ".cm-matchingBracket": {
      backgroundColor: "#3d435640",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    "&::-webkit-scrollbar, .cm-scroller::-webkit-scrollbar": {
      width: "8px",
      height: "8px",
    },
    "&::-webkit-scrollbar-thumb, .cm-scroller::-webkit-scrollbar-thumb": {
      background: "#3d435650",
      borderRadius: "4px",
    },
    "&::-webkit-scrollbar-thumb:hover, .cm-scroller::-webkit-scrollbar-thumb:hover": {
      background: "#3d435680",
    },
    ".cm-placeholder": {
      color: "#6b7280",
      fontStyle: "normal",
    },
  },
  { dark: true },
);

export const appDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c084fc" },
  { tag: t.variableName, color: "#e2e8f0" },
  { tag: t.heading, color: "#93c5fd", fontWeight: "700" },
  { tag: t.heading1, color: "#bfdbfe", fontWeight: "700" },
  { tag: t.heading2, color: "#bfdbfe", fontWeight: "700" },
  { tag: t.heading3, color: "#bfdbfe", fontWeight: "700" },
  { tag: t.processingInstruction, color: "#f472b6" },
  { tag: t.link, color: "#7dd3fc", textDecoration: "underline" },
  { tag: t.url, color: "#7dd3fc" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.atom, color: "#f97316" },
  { tag: t.string, color: "#86efac" },
  { tag: t.number, color: "#7dd3fc" },
  { tag: t.bool, color: "#c084fc" },
  { tag: t.lineComment, color: "#64748b", fontStyle: "italic" },
  { tag: t.paren, color: "#94a3b8" },
  { tag: t.squareBracket, color: "#94a3b8" },
  { tag: t.brace, color: "#94a3b8" },
  { tag: t.meta, color: "#f472b6" },
  // For semantic highlights
  { tag: t.typeName, color: "#7dd3fc" },
  { tag: t.function(t.variableName), color: "#93c5fd" },
  { tag: t.propertyName, color: "#fbbf24" },
]);

export const appDarkSyntaxHighlighting = syntaxHighlighting(appDarkHighlightStyle);
