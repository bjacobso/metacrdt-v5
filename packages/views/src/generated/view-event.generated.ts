/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from the hosted ViewSpec protocol descriptors in preludes/viewspec-protocol.lisp.
 * Run: npm run generate --workspace @metacrdt/views
 */

import { Schema } from "effect";
import { type ViewActionOrList, ViewActionOrListSchema } from "./view-action.generated.js";

export interface ViewClickEventMap {
  readonly onClick?: ViewActionOrList | undefined;
}

export interface ViewActionButtonEventMap {
  readonly onClick?: ViewActionOrList | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
}

export interface ViewRowClickEventMap {
  readonly onRowClick?: ViewActionOrList | undefined;
}

export interface ViewNodeClickEventMap {
  readonly onNodeClick?: ViewActionOrList | undefined;
}

export interface ViewChangeEventMap {
  readonly onChange?: ViewActionOrList | undefined;
}

export interface ViewSubmitEventMap {
  readonly onSubmit?: ViewActionOrList | undefined;
}

export interface ViewOpenChangeEventMap {
  readonly onOpenChange?: ViewActionOrList | undefined;
}

export interface ViewEventMap {
  readonly onClick?: ViewActionOrList | undefined;
  readonly onSuccess?: ViewActionOrList | undefined;
  readonly onRowClick?: ViewActionOrList | undefined;
  readonly onNodeClick?: ViewActionOrList | undefined;
  readonly onChange?: ViewActionOrList | undefined;
  readonly onSubmit?: ViewActionOrList | undefined;
  readonly onOpenChange?: ViewActionOrList | undefined;
}

const ViewEventMapSchema = Schema.Struct({
  onClick: Schema.optional(ViewActionOrListSchema),
  onSuccess: Schema.optional(ViewActionOrListSchema),
  onRowClick: Schema.optional(ViewActionOrListSchema),
  onNodeClick: Schema.optional(ViewActionOrListSchema),
  onChange: Schema.optional(ViewActionOrListSchema),
  onSubmit: Schema.optional(ViewActionOrListSchema),
  onOpenChange: Schema.optional(ViewActionOrListSchema),
}).annotations({
  identifier: "ViewEventMap",
}) as unknown as Schema.Schema<ViewEventMap>;

export const ViewEventMap = ViewEventMapSchema.annotations({
  identifier: "ViewEventMap",
  description: "ViewSpec event callback map.",
});
