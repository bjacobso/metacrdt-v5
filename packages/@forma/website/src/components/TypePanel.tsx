import type { TimedPassResult } from "../engine/protocol";
import { sameSpan, spanRange, type SpanRange } from "../lib/artifacts";
import { DiagnosticList } from "./DiagnosticList";

export function TypePanel({
  result,
  selectedSpan,
  onSelectSpan,
}: {
  readonly result: Extract<TimedPassResult, { readonly pass: "typecheck" }> | null;
  readonly selectedSpan: SpanRange | null;
  readonly onSelectSpan: (span: SpanRange | null) => void;
}) {
  if (!result) return <p className="empty-state">Typecheck has not run.</p>;
  return (
    <div className="type-panel">
      <div className="headline-type">
        <span>Inferred</span>
        <code>{result.display ?? result.type?.display ?? "Unknown"}</code>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Expression</th>
              <th>Type</th>
              <th>Span</th>
            </tr>
          </thead>
          <tbody>
            {(result.expressionTypes ?? []).map((item) => {
              const span = spanRange(item.span);
              return (
                <tr
                  className={sameSpan(span, selectedSpan) ? "selected-artifact" : ""}
                  key={item.expressionId}
                  onMouseEnter={() => onSelectSpan(span)}
                >
                  <td>{item.formIndex}</td>
                  <td>
                    <code>{item.display}</code>
                  </td>
                  <td>{span ? `${span[0]}:${span[1]}` : "engine summary"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DiagnosticList diagnostics={result.diagnostics} />
    </div>
  );
}
