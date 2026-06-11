import type { ReactNode } from "react";
import {
  evaluateViewExpression,
  type ViewExpressionContext,
  type ViewNode,
  type ViewTableColumn,
} from "@metacrdt/views/runtime";
import { Button, Card, CardHeader, Chip, Mono, StatusBadge } from "./ui";

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
  readonly dispatch?: (
    actionOrList: unknown,
    scope?: Partial<ViewExpressionContext>,
  ) => void;
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

function renderChildren(nodes: readonly ViewNode[], ctx: ViewRenderContext) {
  return nodes.map((child, i) => <ViewRenderer key={i} node={child} ctx={ctx} />);
}

function buttonVariant(
  variant: Extract<ViewNode, { type: "button" }>["variant"],
): Parameters<typeof Button>[0]["variant"] {
  if (variant === "default") return "primary";
  if (variant === "destructive") return "collect";
  if (variant === "ghost" || variant === "link") return "ghost";
  return "outline";
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

  const clickable = Boolean(
    node.events?.onRowClick && (ctx.dispatch || ctx.onRowActivate),
  );

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
              onClick={
                clickable
                  ? () => {
                      if (ctx.dispatch) {
                        ctx.dispatch(node.events?.onRowClick, { $row: row });
                      } else {
                        ctx.onRowActivate?.(row);
                      }
                    }
                  : undefined
              }
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
          {renderChildren(childrenOf(node), ctx)}
        </div>
      );
    case "columns":
      return (
        <div className="flex flex-wrap items-center gap-3">
          {renderChildren(childrenOf(node), ctx)}
        </div>
      );
    case "card": {
      const title = display(evaluateViewExpression(node.title, ctx));
      const description = display(evaluateViewExpression(node.description, ctx));
      const action = (node as { action?: readonly ViewNode[] }).action ?? [];
      const footer = (node as { footer?: readonly ViewNode[] }).footer ?? [];
      return (
        <Card>
          {(title || description || action.length > 0) && (
            <CardHeader
              title={title}
              hint={description}
              right={<div className="flex gap-2">{renderChildren(action, ctx)}</div>}
            />
          )}
          <div className="space-y-3 px-5 py-4">
            {renderChildren(childrenOf(node), ctx)}
          </div>
          {footer.length > 0 && (
            <div className="border-t border-line-soft px-5 py-3">
              {renderChildren(footer, ctx)}
            </div>
          )}
        </Card>
      );
    }
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
    case "badge": {
      const text = display(evaluateViewExpression(node.content, ctx));
      return text ? <StatusBadge status={text} /> : <Chip>None</Chip>;
    }
    case "button": {
      const disabled = Boolean(evaluateViewExpression(node.disabled, ctx));
      const label = display(evaluateViewExpression(node.label, ctx));
      return (
        <Button
          variant={buttonVariant(node.variant)}
          disabled={disabled}
          onClick={() => ctx.dispatch?.(node.events?.onClick)}
        >
          {childrenOf(node).length > 0
            ? renderChildren(childrenOf(node), ctx)
            : label}
        </Button>
      );
    }
    case "stat-group":
      return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {renderChildren(childrenOf(node), ctx)}
        </div>
      );
    case "metric": {
      const label = display(evaluateViewExpression(node.label, ctx));
      const value = display(evaluateViewExpression(node.value ?? node.bind, ctx));
      return (
        <div className="rounded-ds border border-line bg-surface px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {label}
          </div>
          <div className="tnum mt-2 text-2xl font-semibold text-ink">
            {value || "0"}
          </div>
        </div>
      );
    }
    case "divider":
    case "separator":
      return <div className="h-px w-full bg-line-soft" />;
    case "condition": {
      const children = childrenOf(node);
      const chosen =
        children.find(
          (child) =>
            child.type === "case" &&
            Boolean(
              evaluateViewExpression(
                (child as Extract<ViewNode, { type: "case" }>).when,
                ctx,
              ),
            ),
        ) ?? children.find((child) => child.type === "else");
      return chosen ? <ViewRenderer node={chosen} ctx={ctx} /> : null;
    }
    case "case":
      return Boolean(evaluateViewExpression(node.when, ctx)) ? (
        <>{renderChildren(childrenOf(node), ctx)}</>
      ) : null;
    case "else":
      return <>{renderChildren(childrenOf(node), ctx)}</>;
    case "empty-state":
      return (
        <p className="px-5 py-4 text-[13px] text-muted">
          {display(evaluateViewExpression((node as { title?: unknown }).title, ctx))}
        </p>
      );
    case "table":
      return <TableNode node={node} ctx={ctx} />;
    default:
      return (
        <div className="rounded-md border border-orange/30 bg-orange-soft px-3 py-2 text-[12px] text-orange-ink">
          Unsupported view node: <Mono>{node.type}</Mono>
        </div>
      );
  }
}
