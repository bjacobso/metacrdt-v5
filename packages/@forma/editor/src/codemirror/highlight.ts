/**
 * Semantic token overlay using a pluggable SemanticRangeProvider.
 */

import { ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { SemanticRangeProvider } from "./types.js";

export function createSemanticHighlightPlugin(provider: SemanticRangeProvider) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: import("@codemirror/view").EditorView) {
        this.decorations = buildDecorations(view.state.doc.toString(), provider);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.state.doc.toString(), provider);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

function buildDecorations(source: string, provider: SemanticRangeProvider): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  if (!source.trim()) return builder.finish();

  try {
    for (const token of provider.getRanges(source)) {
      builder.add(token.from, token.to, Decoration.mark({ class: token.cls }));
    }
  } catch {
    // Swallow — don't break the editor
  }

  return builder.finish();
}
