import type { ReactNode } from "react";
import {
  evaluateViewExpression,
  type ViewExpressionContext,
  type ViewNode,
  type ViewTableColumn,
} from "@metacrdt/views/runtime";
import { Mono, StatusBadge } from "../ui";

// Phase 3 of specs/plans/views.md — a MINIMAL ViewSpec -> React renderer, inline in
// the app. It covers exactly the nodes the Entities list needs (rows, columns,
// heading, text, table, empty-state). It is intentionally not exhaustive; once
// it grows up it gets extracted to `@metacrdt/views-react`.
//
// The renderer is a render TARGET: it reads a normalized ViewSpec node tree plus
// a host-provided scope (ViewExpressionContext) and never executes queries — the
// data in `ctx.query` was resolved by the edge before it got here.

export type ViewRow = Record<string, unknown>;

export interface ViewRenderContext extends ViewExpressionContext {
  /** Host action: invoked when a table row is activated (the spec only declares intent). */
  readonly onRowActivate?: (row: ViewRow) => void;
}

function childrenOf(node: ViewNode): readonly ViewNode[] {
  return (node as { children?: readonly ViewNode[] }).children ?? [];
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function normalizeColumn(col: string | ViewTableColumn): ViewTableColumn {
  return typeof col === "string" ? { key: col } : col;
}

function Cell({ value, kind }: { value: unknown; kind?: ViewTableColumn["kind"] }) {
  const text = display(value);
  if (text === "") return <span className="text-faint">—</span>;
  if (kind === "mono") return <Mono>{text}</Mono>;
  if (kind === "status") return <StatusBadge status={text} />;
  return <span className="text-ink-2">{text}</span>;
}

function TableNode({
  node,
  ctx,
}: {
  node: Extract<ViewNode, { type: "table" }>;
  ctx: ViewRenderContext;
}) {
  const resolved = evaluateViewExpression(node.bind, ctx);
  const rows: ViewRow[] = Array.isArray(resolved) ? (resolved as ViewRow[]) : [];
  const columns = (node.columns ?? []).map(normalizeColumn);

  if (rows.length === 0) {
    return (
      <p className="px-5 py-4 text-[13px] text-muted">
        {node.emptyState ?? "Nothing to show."}
      </p>
    );
  }

  const clickable = Boolean(node.events?.onRowClick && ctx.onRowActivate);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-[11px] uppercase tracking-wide text-muted">
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2.5 font-semibold first:pl-5">
                {col.label ?? col.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((row, i) => (
            <tr
              key={display(row["id"]) || i}
              onClick={clickable ? () => ctx.onRowActivate?.(row) : undefined}
              className={clickable ? "cursor-pointer hover:bg-line-soft" : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="max-w-56 truncate px-3 py-3 first:pl-5"
                >
                  <Cell value={row[col.key]} kind={col.kind} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ViewRenderer({
  node,
  ctx,
}: {
  node: ViewNode;
  ctx: ViewRenderContext;
}): ReactNode {
  switch (node.type) {
    case "rows":
      return (
        <div className="flex flex-col gap-3">
          {childrenOf(node).map((child, i) => (
            <ViewRenderer key={i} node={child} ctx={ctx} />
          ))}
        </div>
      );
    case "columns":
      return (
        <div className="flex gap-3">
          {childrenOf(node).map((child, i) => (
            <ViewRenderer key={i} node={child} ctx={ctx} />
          ))}
        </div>
      );
    case "heading": {
      const text = display(evaluateViewExpression(node.text, ctx));
      const level = node.level ?? 2;
      const cls = level <= 1 ? "text-lg font-semibold text-ink" : "text-[15px] font-semibold text-ink";
      return <p className={cls}>{text}</p>;
    }
    case "text": {
      const text = display(evaluateViewExpression(node.content ?? node.bind, ctx));
      return <span className="text-[13px] text-ink-2">{text}</span>;
    }
    case "empty-state":
      return (
        <p className="px-5 py-4 text-[13px] text-muted">
          {display(evaluateViewExpression((node as { title?: unknown }).title, ctx))}
        </p>
      );
    case "table":
      return <TableNode node={node} ctx={ctx} />;
    default:
      // Unsupported node kinds render nothing in this minimal renderer.
      return null;
  }
}
