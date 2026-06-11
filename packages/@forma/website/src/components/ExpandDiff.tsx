import type { TimedPassResult } from "../engine/protocol";
import { astToSource, nodeToSource, sameSpan, spanRange, type SpanRange } from "../lib/artifacts";

export function ExpandDiff({
  parseResult,
  expandResult,
  selectedSpan,
  onSelectSpan,
}: {
  readonly parseResult: Extract<TimedPassResult, { readonly pass: "parse" }> | null;
  readonly expandResult: Extract<TimedPassResult, { readonly pass: "expand" }> | null;
  readonly selectedSpan: SpanRange | null;
  readonly onSelectSpan: (span: SpanRange | null) => void;
}) {
  const beforeNodes = parseResult?.ast ?? [];
  const afterNodes = expandResult?.ast ?? [];
  const before = beforeNodes.map(nodeToSource);
  const after = afterNodes.map(nodeToSource);
  if (before.length === 0 && after.length === 0) {
    return <p className="empty-state">No expansion output.</p>;
  }
  return (
    <div className="diff-grid">
      <div>
        <h4>Before</h4>
        <div className="diff-lines">
          {before.map((line, index) => {
            const span = spanRange(beforeNodes[index]?.span);
            const afterLine = after[index] ?? astToSource(afterNodes);
            const changed = line !== afterLine;
            return (
              <div className="diff-line-group" key={index}>
                <button
                  className={`diff-line ${changed ? "" : "diff-muted"} ${
                    sameSpan(span, selectedSpan) ? "selected-artifact" : ""
                  }`}
                  onMouseEnter={() => onSelectSpan(span)}
                  type="button"
                >
                  <code>{line}</code>
                  {span ? <small>{`${span[0]}:${span[1]}`}</small> : null}
                </button>
                {changed ? (
                  <details className="macro-reveal">
                    <summary>Show expansion</summary>
                    <pre>{afterLine}</pre>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h4>After</h4>
        <pre className="diff-after">
          {after.map((line, index) => (
            <code className={before.includes(line) ? "diff-muted" : "diff-added"} key={index}>
              {line}
              {"\n"}
            </code>
          ))}
        </pre>
      </div>
    </div>
  );
}
