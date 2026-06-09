/**
 * CodeMirror 6 language support for Lisp.
 *
 * Provides syntax highlighting, folding, indentation, and bracket matching
 * using the generated Lezer parser.
 */

import { parser } from "../grammar/parser.generated.js";
import {
  LRLanguage,
  LanguageSupport,
  foldNodeProp,
  foldInside,
  indentNodeProp,
} from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";

const lispHighlighting = styleTags({
  LineComment: t.lineComment,
  Number: t.number,
  String: t.string,
  MultilineString: t.string,
  Boolean: t.bool,
  Keyword: t.atom,
  Symbol: t.variableName,
  "specialForm!": t.keyword,
  "( )": t.paren,
  "[ ]": t.squareBracket,
  "{ }": t.brace,
  Backtick: t.meta,
  Tilde: t.meta,
  TildeAt: t.meta,
});

export const lispLanguage = LRLanguage.define({
  name: "lisp",
  parser: parser.configure({
    props: [
      lispHighlighting,
      foldNodeProp.add({
        List: foldInside,
        Vector: foldInside,
        Map: foldInside,
      }),
      indentNodeProp.add({
        List: (context) => context.column(context.node.from) + context.unit,
        Vector: (context) => context.column(context.node.from) + context.unit,
        Map: (context) => context.column(context.node.from) + context.unit,
      }),
    ],
  }),
  languageData: {
    commentTokens: { line: ";" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
});

export function lispSupport() {
  return new LanguageSupport(lispLanguage);
}
