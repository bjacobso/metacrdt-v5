/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from the hosted ViewSpec expression protocol descriptors in preludes/viewspec-protocol.lisp.
 * Run: pnpm --filter @metacrdt/views generate
 */

import { Schema } from "effect";

export const ViewExprSource = Schema.Literal("state", "query", "input", "row", "db", "item", "index", "event", "result", "error", "host").annotations({
  identifier: "ViewExprSource",
  description: "ViewSpec expression root source.",
});
export type ViewExprSource = typeof ViewExprSource.Type;

export interface ViewExprLiteral {
  readonly kind: "literal";
  readonly value: unknown;
}

export interface ViewExprVar {
  readonly kind: "var";
  readonly source: ViewExprSource;
  readonly path?: readonly string[] | undefined;
}

export interface ViewExprBinary {
  readonly kind: "binary";
  readonly op: "===" | "!==" | ">" | ">=" | "<" | "<=" | "+" | "-" | "*" | "/" | "&&" | "||";
  readonly left: ViewExpr;
  readonly right: ViewExpr;
}

export interface ViewExprUnary {
  readonly kind: "unary";
  readonly op: "!" | "-";
  readonly value: ViewExpr;
}

export interface ViewExprConditional {
  readonly kind: "conditional";
  readonly condition: ViewExpr;
  readonly then: ViewExpr;
  readonly else: ViewExpr;
}

export interface ViewExprPipe {
  readonly kind: "pipe";
  readonly name: string;
  readonly value: ViewExpr;
  readonly args?: readonly ViewExpr[] | undefined;
}

export type ViewExpr =
  | ViewExprLiteral
  | ViewExprVar
  | ViewExprBinary
  | ViewExprUnary
  | ViewExprConditional
  | ViewExprPipe
;

export type ViewExprNode = ViewExpr;

export const ViewExprNodeSchema: Schema.Schema<ViewExprNode> = Schema.suspend(
  (): Schema.Schema<ViewExprNode> => Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
).annotations({
  identifier: "ViewExprNode",
}) as Schema.Schema<ViewExprNode>;

export const ViewExprLiteralSchema = Schema.Struct({
  kind: Schema.Literal("literal"),
  value: Schema.Unknown,
}).annotations({
  identifier: "ViewExprLiteral",
}) as unknown as Schema.Schema<ViewExprLiteral>;

export const ViewExprVarSchema = Schema.Struct({
  kind: Schema.Literal("var"),
  source: ViewExprSource,
  path: Schema.optional(Schema.Array(Schema.String)),
}).annotations({
  identifier: "ViewExprVar",
}) as unknown as Schema.Schema<ViewExprVar>;

export const ViewExprBinarySchema = Schema.Struct({
  kind: Schema.Literal("binary"),
  op: Schema.Literal("===", "!==", ">", ">=", "<", "<=", "+", "-", "*", "/", "&&", "||"),
  left: Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
  right: Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
}).annotations({
  identifier: "ViewExprBinary",
}) as unknown as Schema.Schema<ViewExprBinary>;

export const ViewExprUnarySchema = Schema.Struct({
  kind: Schema.Literal("unary"),
  op: Schema.Literal("!", "-"),
  value: Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
}).annotations({
  identifier: "ViewExprUnary",
}) as unknown as Schema.Schema<ViewExprUnary>;

export const ViewExprConditionalSchema = Schema.Struct({
  kind: Schema.Literal("conditional"),
  condition: Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
  then: Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
  else: Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
}).annotations({
  identifier: "ViewExprConditional",
}) as unknown as Schema.Schema<ViewExprConditional>;

export const ViewExprPipeSchema = Schema.Struct({
  kind: Schema.Literal("pipe"),
  name: Schema.String,
  value: Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }),
  args: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewExpr> => ViewExpression).annotations({ identifier: "ViewExpr" }))),
}).annotations({
  identifier: "ViewExprPipe",
}) as unknown as Schema.Schema<ViewExprPipe>;

export const ViewExpression: Schema.Schema<ViewExpr> = Schema.suspend(
  (): Schema.Schema<ViewExpr> => Schema.Union(ViewExprLiteralSchema, ViewExprVarSchema, ViewExprBinarySchema, ViewExprUnarySchema, ViewExprConditionalSchema, ViewExprPipeSchema),
).annotations({
  identifier: "ViewExpr",
  description: "A structured ViewSpec expression AST node.",
}) as Schema.Schema<ViewExpr>;
