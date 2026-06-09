/**
 * CodeMirror 6 autocompletion extension.
 *
 * Accepts a CompletionProvider to supply domain-specific completions.
 */

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { CompletionProvider } from "./types.js";

function mapCompletionType(kind: string): string {
  switch (kind) {
    case "variable":
      return "variable";
    case "field":
    case "property":
      return "property";
    case "type":
      return "type";
    case "keyword":
      return "keyword";
    case "function":
      return "function";
    case "constant":
      return "constant";
    case "form":
      return "class";
    case "snippet":
      return "text";
    default:
      return "text";
  }
}

export function createCompletionExtension(provider: CompletionProvider) {
  function completionSource(context: CompletionContext): CompletionResult | null {
    const source = context.state.doc.toString();
    const offset = context.pos;

    const before = context.matchBefore(/[\w\-!?*+/<>=$.&:]+/);
    const triggered = context.matchBefore(/\(/);

    if (!before && !triggered && !context.explicit) return null;

    const completions = provider.getCompletions(source, offset);
    if (!completions) return null;

    return {
      from: before?.from ?? completions.from,
      options: completions.options.map((c) => ({
        label: c.label,
        type: mapCompletionType(c.type),
        apply: c.apply,
        ...(c.detail !== undefined ? { detail: c.detail } : {}),
        ...(c.info !== undefined ? { info: c.info } : {}),
      })),
    };
  }

  return autocompletion({
    override: [completionSource],
    activateOnTyping: true,
  });
}
