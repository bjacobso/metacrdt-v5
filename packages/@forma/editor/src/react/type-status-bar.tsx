import type { LispEditorCursorContext } from "./debug-types.js";

export interface TypeStatusBarProps {
  cursorContext: LispEditorCursorContext | null;
}

export function TypeStatusBar({ cursorContext }: TypeStatusBarProps) {
  if (!cursorContext) return null;

  const typeStr = cursorContext.hmTypeAtCursor?.display ?? "";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        background: "#0d1117",
        borderTop: "1px solid #1e293b",
        fontFamily: "monospace",
        fontSize: 11,
        color: "#94a3b8",
        userSelect: "none",
      }}
    >
      <span style={{ color: typeStr ? "#e2e8f0" : "transparent" }}>{typeStr || "\u00A0"}</span>
      <span>
        Ln {cursorContext.lineNumber} Col {cursorContext.column}
      </span>
    </div>
  );
}
