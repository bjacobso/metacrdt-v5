import { useState } from "react";
import type { LispEditorDebugState } from "./debug-types.js";

interface LispEditorDebugPanelProps {
  debugState: LispEditorDebugState;
}

const panelStyle: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 8,
  border: "1px solid #2f3542",
  background: "#0f172a",
  color: "#e5e7eb",
  padding: 12,
  fontFamily: "monospace",
  fontSize: 12,
  maxHeight: 400,
  overflow: "auto",
};

const sectionHeaderStyle: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 700,
  padding: "4px 0",
  userSelect: "none",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const dimStyle: React.CSSProperties = { color: "#64748b" };
const labelStyle: React.CSSProperties = { color: "#94a3b8" };

function Section({
  title,
  defaultOpen,
  count,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={sectionHeaderStyle} onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 10 }}>{open ? "\u25BC" : "\u25B6"}</span>
        <span>{title}</span>
        {count !== undefined && <span style={dimStyle}>({count})</span>}
      </div>
      {open && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  );
}

function CursorSection({ debugState }: { debugState: LispEditorDebugState }) {
  const ctx = debugState.cursorContext;
  if (!ctx) return <div style={dimStyle}>No cursor context</div>;

  const hm = ctx.hmTypeAtCursor;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", lineHeight: 1.6 }}>
      <span>
        <span style={labelStyle}>Type: </span>
        <span style={{ color: "#7dd3fc" }}>{hm?.display ?? "\u2014"}</span>
      </span>
      <span>
        <span style={labelStyle}>Word: </span>
        {ctx.word ?? "\u2014"}
      </span>
      <span>
        <span style={labelStyle}>Offset: </span>
        {ctx.offset}
      </span>
      {ctx.breadcrumbs && ctx.breadcrumbs.length > 0 && (
        <span>
          <span style={labelStyle}>Path: </span>
          {ctx.breadcrumbs.join(" \u203A ")}
        </span>
      )}
    </div>
  );
}

const severityIcon: Record<string, string> = {
  error: "\u2716",
  warning: "\u26A0",
  info: "\u2139",
  hint: "\u2731",
};

function DiagnosticsSection({ debugState }: { debugState: LispEditorDebugState }) {
  if (debugState.diagnostics.length === 0) return <div style={dimStyle}>None</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {debugState.diagnostics.map((d, i) => (
        <div key={i} style={{ lineHeight: 1.5 }}>
          <span style={{ color: d.severity === "error" ? "#f87171" : "#fbbf24" }}>
            {severityIcon[d.severity] ?? "?"}{" "}
          </span>
          <span>{d.message}</span>
          <span style={dimStyle}>
            {" "}
            [{d.source}] L{d.range.startLineNumber}:{d.range.startColumn}
          </span>
        </div>
      ))}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "2px 8px 2px 0",
  color: "#94a3b8",
  fontWeight: 600,
  borderBottom: "1px solid #1e293b",
};

const tdStyle: React.CSSProperties = {
  padding: "2px 8px 2px 0",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 200,
};

function TypedSpansSection({ debugState }: { debugState: LispEditorDebugState }) {
  const spans = debugState.analysis?.typedSpans;
  if (!spans || spans.length === 0) return <div style={dimStyle}>No typed spans</div>;

  const cursorOffset = debugState.cursorContext?.offset;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={thStyle}>Tag</th>
            <th style={thStyle}>Code</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Span</th>
          </tr>
        </thead>
        <tbody>
          {spans.map((s) => {
            const isActive =
              cursorOffset !== undefined &&
              s.span.startOffset <= cursorOffset &&
              cursorOffset < s.span.endOffset;
            const rowBg = isActive ? "rgba(56, 189, 248, 0.08)" : undefined;
            const rowColor = isActive ? "#e2e8f0" : undefined;
            return (
              <tr key={s.id} style={{ background: rowBg, color: rowColor }}>
                <td style={tdStyle}>{s.exprTag}</td>
                <td style={{ ...tdStyle, maxWidth: 180 }} title={s.code}>
                  {s.code}
                </td>
                <td style={{ ...tdStyle, color: "#7dd3fc" }}>{s.display}</td>
                <td style={{ ...tdStyle, ...dimStyle }}>
                  [{s.span.startOffset}:{s.span.endOffset}]
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LispEditorDebugPanel({ debugState }: LispEditorDebugPanelProps) {
  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>LSP Debug</div>
      <Section title="Cursor Context" defaultOpen={true}>
        <CursorSection debugState={debugState} />
      </Section>
      {debugState.diagnostics.length > 0 && (
        <Section title="Diagnostics" defaultOpen={true} count={debugState.diagnostics.length}>
          <DiagnosticsSection debugState={debugState} />
        </Section>
      )}
      <Section
        title="Typed Spans"
        defaultOpen={true}
        count={debugState.analysis?.typedSpans.length ?? 0}
      >
        <TypedSpansSection debugState={debugState} />
      </Section>
      <Section title="Raw JSON" defaultOpen={false}>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(debugState, null, 2)}
        </pre>
      </Section>
    </div>
  );
}
