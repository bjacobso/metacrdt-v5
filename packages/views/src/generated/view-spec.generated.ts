/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from the hosted ViewSpec envelope protocol descriptors in preludes/viewspec-protocol.lisp.
 * Run: npm run generate --workspace @metacrdt/views
 */

import { Schema } from "effect";
import { type ViewActionOrList, ViewActionOrListSchema } from "./view-action.generated.js";
import { ViewStateDecl } from "./view-state.generated.js";
import { ViewNode } from "./view-node.generated.js";

export interface ViewQueryInlineBinding {
  readonly query: unknown;
  readonly params?: Record<string, unknown> | undefined;
  readonly dependsOn?: readonly string[] | undefined;
}

export interface ViewQueryRefBinding {
  readonly queryRef: string;
  readonly params?: Record<string, unknown> | undefined;
  readonly dependsOn?: readonly string[] | undefined;
}

export interface ViewInputParam {
  readonly type: string;
  readonly description?: string | undefined;
  readonly default?: unknown | undefined;
}

export interface ViewTheme {
  readonly background?: string | undefined;
  readonly foreground?: string | undefined;
  readonly accent?: string | undefined;
  readonly accentForeground?: string | undefined;
  readonly muted?: string | undefined;
  readonly border?: string | undefined;
  readonly fontFamily?: string | undefined;
}

export interface ViewCapabilities {
  readonly toolCall?: boolean | undefined;
  readonly filePicker?: boolean | undefined;
  readonly displayMode?: boolean | undefined;
  readonly fetch?: boolean | undefined;
  readonly sendMessage?: boolean | undefined;
  readonly updateContext?: boolean | undefined;
}

export interface ViewSpecMarker {
  readonly version: "2";
}

export interface ViewSpec {
  readonly $viewSpec?: ViewSpecMarker | undefined;
  readonly description?: string | undefined;
  readonly input?: Record<string, ViewInputParam> | undefined;
  readonly state?: Record<string, ViewStateDecl> | undefined;
  readonly queries?: Record<string, ViewQueryBinding> | undefined;
  readonly defs?: Record<string, ViewNode> | undefined;
  readonly theme?: ViewTheme | undefined;
  readonly capabilities?: ViewCapabilities | undefined;
  readonly onMount?: ViewActionOrList | undefined;
  readonly keyBindings?: Record<string, ViewActionOrList> | undefined;
  readonly root: ViewNode;
}

export type ViewQueryBinding =
  | ViewQueryInlineBinding
  | ViewQueryRefBinding
;

export const ViewQueryInlineBindingSchema = Schema.Struct({
  query: Schema.Unknown,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
}).annotations({
  identifier: "ViewQueryInlineBinding",
}) as unknown as Schema.Schema<ViewQueryInlineBinding>;

export const ViewQueryRefBindingSchema = Schema.Struct({
  queryRef: Schema.String,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
}).annotations({
  identifier: "ViewQueryRefBinding",
}) as unknown as Schema.Schema<ViewQueryRefBinding>;

export const ViewInputParam = Schema.Struct({
  type: Schema.String,
  description: Schema.optional(Schema.String),
  default: Schema.optional(Schema.Unknown),
}).annotations({
  identifier: "ViewInputParam",
}) as unknown as Schema.Schema<ViewInputParam>;

export const ViewTheme = Schema.Struct({
  background: Schema.optional(Schema.String),
  foreground: Schema.optional(Schema.String),
  accent: Schema.optional(Schema.String),
  accentForeground: Schema.optional(Schema.String),
  muted: Schema.optional(Schema.String),
  border: Schema.optional(Schema.String),
  fontFamily: Schema.optional(Schema.String),
}).annotations({
  identifier: "ViewTheme",
}) as unknown as Schema.Schema<ViewTheme>;

export const ViewCapabilities = Schema.Struct({
  toolCall: Schema.optional(Schema.Boolean),
  filePicker: Schema.optional(Schema.Boolean),
  displayMode: Schema.optional(Schema.Boolean),
  fetch: Schema.optional(Schema.Boolean),
  sendMessage: Schema.optional(Schema.Boolean),
  updateContext: Schema.optional(Schema.Boolean),
}).annotations({
  identifier: "ViewCapabilities",
}) as unknown as Schema.Schema<ViewCapabilities>;

export const ViewSpecMarkerSchema = Schema.Struct({
  version: Schema.Literal("2"),
}).annotations({
  identifier: "ViewSpecMarker",
}) as unknown as Schema.Schema<ViewSpecMarker>;

export const ViewSpec = Schema.Struct({
  $viewSpec: Schema.optional(Schema.suspend((): Schema.Schema<ViewSpecMarker> => ViewSpecMarkerSchema).annotations({ identifier: "ViewSpecMarker" })),
  description: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.suspend((): Schema.Schema<ViewInputParam> => ViewInputParam).annotations({ identifier: "ViewInputParam" }) })),
  state: Schema.optional(Schema.Record({ key: Schema.String, value: ViewStateDecl })),
  queries: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.suspend((): Schema.Schema<ViewQueryBinding> => ViewQueryBinding).annotations({ identifier: "ViewQueryBinding" }) })),
  defs: Schema.optional(Schema.Record({ key: Schema.String, value: ViewNode })),
  theme: Schema.optional(Schema.suspend((): Schema.Schema<ViewTheme> => ViewTheme).annotations({ identifier: "ViewTheme" })),
  capabilities: Schema.optional(Schema.suspend((): Schema.Schema<ViewCapabilities> => ViewCapabilities).annotations({ identifier: "ViewCapabilities" })),
  onMount: Schema.optional(ViewActionOrListSchema),
  keyBindings: Schema.optional(Schema.Record({ key: Schema.String, value: ViewActionOrListSchema })),
  root: ViewNode,
}).annotations({
  identifier: "ViewSpec",
}) as unknown as Schema.Schema<ViewSpec>;

export const ViewQueryBinding: Schema.Schema<ViewQueryBinding> = Schema.suspend(
  (): Schema.Schema<ViewQueryBinding> => Schema.Union(ViewQueryInlineBindingSchema, ViewQueryRefBindingSchema),
).annotations({
  identifier: "ViewQueryBinding",
  description: "A ViewSpec query binding backed by an inline query or a named query reference.",
}) as Schema.Schema<ViewQueryBinding>;
