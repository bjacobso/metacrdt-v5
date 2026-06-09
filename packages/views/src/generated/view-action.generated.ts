/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from the hosted ViewSpec protocol descriptors in preludes/viewspec-protocol.lisp.
 * Run: pnpm --filter @metacrdt/views generate
 */

import { Schema } from "effect";
import { type ViewExpr, ViewExpression } from "./view-expression.generated.js";

export interface ViewSetStateAction {
  readonly action: "setState";
  readonly key: string;
  readonly value: unknown;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewPatchStateAction {
  readonly action: "patchState";
  readonly key: string;
  readonly value: unknown;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewToggleStateAction {
  readonly action: "toggleState";
  readonly key: string;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewRunQueryAction {
  readonly action: "runQuery";
  readonly query: string;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewRunQueriesAction {
  readonly action: "runQueries";
  readonly queries: readonly string[];
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewNavigateAction {
  readonly action: "navigate";
  readonly path: ViewExpr;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewShowToastAction {
  readonly action: "showToast";
  readonly message: ViewExpr;
  readonly description?: ViewExpr | undefined;
  readonly variant?: "default" | "success" | "error" | "warning" | "info" | undefined;
  readonly duration?: number | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewOpenDialogAction {
  readonly action: "openDialog";
  readonly dialogId: string;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewCloseDialogAction {
  readonly action: "closeDialog";
  readonly dialogId?: string | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewEmitAction {
  readonly action: "emit";
  readonly event: string;
  readonly payload?: unknown | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewExecuteActionAction {
  readonly action: "executeAction";
  readonly actionRef: string;
  readonly entityId?: ViewExpr | undefined;
  readonly parameters?: Record<string, unknown> | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewFetchAction {
  readonly action: "fetch";
  readonly url: ViewExpr;
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | undefined;
  readonly headers?: Record<string, unknown> | undefined;
  readonly body?: unknown | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewToolCallAction {
  readonly action: "toolCall";
  readonly tool: ViewExpr;
  readonly arguments?: Record<string, unknown> | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewRequestDisplayModeAction {
  readonly action: "requestDisplayMode";
  readonly mode: "inline" | "fullscreen" | "pip";
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewUpdateContextAction {
  readonly action: "updateContext";
  readonly content?: ViewExpr | undefined;
  readonly structuredContent?: Record<string, unknown> | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewSendMessageAction {
  readonly action: "sendMessage";
  readonly content: ViewExpr;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export interface ViewOpenFilePickerAction {
  readonly action: "openFilePicker";
  readonly accept?: string | undefined;
  readonly multiple?: boolean | undefined;
  readonly maxSize?: number | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onError?: ViewActionOrList | undefined;
  readonly onFinally?: ViewActionOrList | undefined;
}

export type ViewAction =
  | ViewSetStateAction
  | ViewPatchStateAction
  | ViewToggleStateAction
  | ViewRunQueryAction
  | ViewRunQueriesAction
  | ViewNavigateAction
  | ViewShowToastAction
  | ViewOpenDialogAction
  | ViewCloseDialogAction
  | ViewEmitAction
  | ViewExecuteActionAction
  | ViewFetchAction
  | ViewToolCallAction
  | ViewRequestDisplayModeAction
  | ViewUpdateContextAction
  | ViewSendMessageAction
  | ViewOpenFilePickerAction
;

export type ViewActionOrList = ViewAction | readonly ViewAction[];

export const ViewActionOrListSchema: Schema.Schema<ViewActionOrList> = Schema.suspend(
  (): Schema.Schema<ViewActionOrList> => Schema.Union(Schema.suspend((): Schema.Schema<ViewAction> => ViewActionSchema).annotations({ identifier: "ViewAction" }), Schema.Array(Schema.suspend((): Schema.Schema<ViewAction> => ViewActionSchema).annotations({ identifier: "ViewAction" }))),
).annotations({
  identifier: "ViewActionOrList",
  description: "A single action or an ordered list of actions.",
}) as Schema.Schema<ViewActionOrList>;

export const ViewSetStateActionSchema = Schema.Struct({
  action: Schema.Literal("setState"),
  key: Schema.String,
  value: Schema.Unknown,
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewSetStateAction",
}) as unknown as Schema.Schema<ViewSetStateAction>;

export const ViewPatchStateActionSchema = Schema.Struct({
  action: Schema.Literal("patchState"),
  key: Schema.String,
  value: Schema.Unknown,
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewPatchStateAction",
}) as unknown as Schema.Schema<ViewPatchStateAction>;

export const ViewToggleStateActionSchema = Schema.Struct({
  action: Schema.Literal("toggleState"),
  key: Schema.String,
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewToggleStateAction",
}) as unknown as Schema.Schema<ViewToggleStateAction>;

export const ViewRunQueryActionSchema = Schema.Struct({
  action: Schema.Literal("runQuery"),
  query: Schema.String,
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewRunQueryAction",
}) as unknown as Schema.Schema<ViewRunQueryAction>;

export const ViewRunQueriesActionSchema = Schema.Struct({
  action: Schema.Literal("runQueries"),
  queries: Schema.Array(Schema.String),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewRunQueriesAction",
}) as unknown as Schema.Schema<ViewRunQueriesAction>;

export const ViewNavigateActionSchema = Schema.Struct({
  action: Schema.Literal("navigate"),
  path: ViewExpression,
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewNavigateAction",
}) as unknown as Schema.Schema<ViewNavigateAction>;

export const ViewShowToastActionSchema = Schema.Struct({
  action: Schema.Literal("showToast"),
  message: ViewExpression,
  description: Schema.optional(ViewExpression),
  variant: Schema.optional(Schema.Literal("default", "success", "error", "warning", "info")),
  duration: Schema.optional(Schema.Number),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewShowToastAction",
}) as unknown as Schema.Schema<ViewShowToastAction>;

export const ViewOpenDialogActionSchema = Schema.Struct({
  action: Schema.Literal("openDialog"),
  dialogId: Schema.String,
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewOpenDialogAction",
}) as unknown as Schema.Schema<ViewOpenDialogAction>;

export const ViewCloseDialogActionSchema = Schema.Struct({
  action: Schema.Literal("closeDialog"),
  dialogId: Schema.optional(Schema.String),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewCloseDialogAction",
}) as unknown as Schema.Schema<ViewCloseDialogAction>;

export const ViewEmitActionSchema = Schema.Struct({
  action: Schema.Literal("emit"),
  event: Schema.String,
  payload: Schema.optional(Schema.Unknown),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewEmitAction",
}) as unknown as Schema.Schema<ViewEmitAction>;

export const ViewExecuteActionActionSchema = Schema.Struct({
  action: Schema.Literal("executeAction"),
  actionRef: Schema.String,
  entityId: Schema.optional(ViewExpression),
  parameters: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewExecuteActionAction",
}) as unknown as Schema.Schema<ViewExecuteActionAction>;

export const ViewFetchActionSchema = Schema.Struct({
  action: Schema.Literal("fetch"),
  url: ViewExpression,
  method: Schema.optional(Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE")),
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  body: Schema.optional(Schema.Unknown),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewFetchAction",
}) as unknown as Schema.Schema<ViewFetchAction>;

export const ViewToolCallActionSchema = Schema.Struct({
  action: Schema.Literal("toolCall"),
  tool: ViewExpression,
  arguments: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewToolCallAction",
}) as unknown as Schema.Schema<ViewToolCallAction>;

export const ViewRequestDisplayModeActionSchema = Schema.Struct({
  action: Schema.Literal("requestDisplayMode"),
  mode: Schema.Literal("inline", "fullscreen", "pip"),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewRequestDisplayModeAction",
}) as unknown as Schema.Schema<ViewRequestDisplayModeAction>;

export const ViewUpdateContextActionSchema = Schema.Struct({
  action: Schema.Literal("updateContext"),
  content: Schema.optional(ViewExpression),
  structuredContent: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewUpdateContextAction",
}) as unknown as Schema.Schema<ViewUpdateContextAction>;

export const ViewSendMessageActionSchema = Schema.Struct({
  action: Schema.Literal("sendMessage"),
  content: ViewExpression,
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewSendMessageAction",
}) as unknown as Schema.Schema<ViewSendMessageAction>;

export const ViewOpenFilePickerActionSchema = Schema.Struct({
  action: Schema.Literal("openFilePicker"),
  accept: Schema.optional(Schema.String),
  multiple: Schema.optional(Schema.Boolean),
  maxSize: Schema.optional(Schema.Number),
  onSuccess: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onError: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
  onFinally: Schema.optional(Schema.suspend((): Schema.Schema<ViewActionOrList> => ViewActionOrListSchema).annotations({ identifier: "ViewActionOrList" })),
}).annotations({
  identifier: "ViewOpenFilePickerAction",
}) as unknown as Schema.Schema<ViewOpenFilePickerAction>;

export const ViewActionSchema: Schema.Schema<ViewAction> = Schema.suspend(
  (): Schema.Schema<ViewAction> => Schema.Union(ViewSetStateActionSchema, ViewPatchStateActionSchema, ViewToggleStateActionSchema, ViewRunQueryActionSchema, ViewRunQueriesActionSchema, ViewNavigateActionSchema, ViewShowToastActionSchema, ViewOpenDialogActionSchema, ViewCloseDialogActionSchema, ViewEmitActionSchema, ViewExecuteActionActionSchema, ViewFetchActionSchema, ViewToolCallActionSchema, ViewRequestDisplayModeActionSchema, ViewUpdateContextActionSchema, ViewSendMessageActionSchema, ViewOpenFilePickerActionSchema),
).annotations({
  identifier: "ViewAction",
  description: "A declarative view action with optional success/error/finally callbacks.",
}) as Schema.Schema<ViewAction>;

export const ViewAction = ViewActionSchema;

export const ViewActionSpec = ViewAction;
