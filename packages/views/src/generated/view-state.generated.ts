/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from the hosted ViewSpec protocol descriptors in preludes/viewspec-protocol.lisp.
 * Run: npm run generate --workspace @metacrdt/views
 */

import { Schema } from "effect";
import { ViewNode } from "./view-node.generated.js";

export interface ViewScalarStateDecl {
  readonly kind: "string" | "number" | "boolean" | "null";
  readonly initial?: unknown | undefined;
}

export interface ViewListStateDecl {
  readonly kind: "list";
  readonly item?: ViewStateDecl | undefined;
  readonly initial?: readonly unknown[] | undefined;
}

export interface ViewObjectStateDecl {
  readonly kind: "object";
  readonly fields?: Record<string, ViewStateDecl> | undefined;
  readonly initial?: Record<string, unknown> | undefined;
}

export interface ViewJsonStateDecl {
  readonly kind: "json";
  readonly initial?: unknown | undefined;
}

export interface ViewComponentStateDecl {
  readonly kind: "component";
  readonly initial?: ViewNode | null | undefined;
}

export type ViewStateDecl =
  | ViewScalarStateDecl
  | ViewListStateDecl
  | ViewObjectStateDecl
  | ViewJsonStateDecl
  | ViewComponentStateDecl
;

export const ViewScalarStateDeclSchema = Schema.Struct({
  kind: Schema.Literal("string", "number", "boolean", "null"),
  initial: Schema.optional(Schema.Unknown),
}).annotations({
  identifier: "ViewScalarStateDecl",
}) as unknown as Schema.Schema<ViewScalarStateDecl>;

export const ViewListStateDeclSchema = Schema.Struct({
  kind: Schema.Literal("list"),
  item: Schema.optional(Schema.suspend((): Schema.Schema<ViewStateDecl> => ViewStateDeclSchema).annotations({ identifier: "ViewStateDecl" })),
  initial: Schema.optional(Schema.Array(Schema.Unknown)),
}).annotations({
  identifier: "ViewListStateDecl",
}) as unknown as Schema.Schema<ViewListStateDecl>;

export const ViewObjectStateDeclSchema = Schema.Struct({
  kind: Schema.Literal("object"),
  fields: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.suspend((): Schema.Schema<ViewStateDecl> => ViewStateDeclSchema).annotations({ identifier: "ViewStateDecl" }) })),
  initial: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}).annotations({
  identifier: "ViewObjectStateDecl",
}) as unknown as Schema.Schema<ViewObjectStateDecl>;

export const ViewJsonStateDeclSchema = Schema.Struct({
  kind: Schema.Literal("json"),
  initial: Schema.optional(Schema.Unknown),
}).annotations({
  identifier: "ViewJsonStateDecl",
}) as unknown as Schema.Schema<ViewJsonStateDecl>;

export const ViewComponentStateDeclSchema = Schema.Struct({
  kind: Schema.Literal("component"),
  initial: Schema.optional(Schema.Union(ViewNode, Schema.Null)),
}).annotations({
  identifier: "ViewComponentStateDecl",
}) as unknown as Schema.Schema<ViewComponentStateDecl>;

export const ViewStateDeclSchema: Schema.Schema<ViewStateDecl> = Schema.suspend(
  (): Schema.Schema<ViewStateDecl> => Schema.Union(ViewScalarStateDeclSchema, ViewListStateDeclSchema, ViewObjectStateDeclSchema, ViewJsonStateDeclSchema, ViewComponentStateDeclSchema),
).annotations({
  identifier: "ViewStateDecl",
  description: "Typed state declaration for ViewSpec.",
}) as Schema.Schema<ViewStateDecl>;

export const ViewStateDecl = ViewStateDeclSchema;

export const ViewState = ViewStateDecl;
