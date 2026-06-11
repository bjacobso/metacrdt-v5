import type { TimedPassResult } from "../engine/protocol";
import { formatJsonish } from "../lib/artifacts";
import { DiagnosticList } from "./DiagnosticList";

export function ValueView({
  result,
}: {
  readonly result: Extract<TimedPassResult, { readonly pass: "evaluate" }> | null;
}) {
  if (!result) return <p className="empty-state">Evaluate has not run.</p>;
  return (
    <div className="value-view">
      <pre>{result.printed ?? formatJsonish(result.value)}</pre>
      <p className="muted-line">{result.steps ?? 0} evaluator steps</p>
      <DiagnosticList diagnostics={result.diagnostics} />
    </div>
  );
}
