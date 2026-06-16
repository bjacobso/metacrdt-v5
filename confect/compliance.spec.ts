import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export class UnknownWorker extends Schema.TaggedError<UnknownWorker>()(
  "UnknownWorker",
  { worker: Schema.String },
) {}

export class InvalidPlacement extends Schema.TaggedError<InvalidPlacement>()(
  "InvalidPlacement",
  { reason: Schema.String },
) {}

export class UnsupportedRequirement extends Schema.TaggedError<UnsupportedRequirement>()(
  "UnsupportedRequirement",
  {
    rule: Schema.String,
    reason: Schema.String,
  },
) {}

export class TenantAccessDenied extends Schema.TaggedError<TenantAccessDenied>()(
  "TenantAccessDenied",
  { tenantSlug: Schema.String },
) {}

export const PlacementInput = Schema.Struct({
  employer: Schema.optionalWith(Schema.String, { exact: true }),
  client: Schema.optionalWith(Schema.String, { exact: true }),
  job: Schema.optionalWith(Schema.String, { exact: true }),
  venue: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DryRunDecision = Schema.Literal("reuse", "collect");

export const DryRunItem = Schema.Struct({
  form: Schema.String,
  scope: Schema.String,
  decision: DryRunDecision,
  source: Schema.Literal("existing", "hypothetical"),
  placements: Schema.Array(Schema.String),
  reason: Schema.String,
});

export const DryRunSummary = Schema.Struct({
  reuse: Schema.Number,
  collect: Schema.Number,
  total: Schema.Number,
});

export const DryRunComplianceResult = Schema.Struct({
  worker: Schema.String,
  items: Schema.Array(DryRunItem),
  summary: DryRunSummary,
});

export const compliance = GroupSpec.make("compliance").addFunction(
  FunctionSpec.publicQuery({
    name: "dryRunWorkerCompliance",
    args: Schema.Struct({
      worker: Schema.String,
      tenantSlug: Schema.optionalWith(Schema.String, { exact: true }),
      placement: Schema.optionalWith(PlacementInput, { exact: true }),
    }),
    returns: DryRunComplianceResult,
    error: Schema.Union(
      UnknownWorker,
      InvalidPlacement,
      UnsupportedRequirement,
      TenantAccessDenied,
    ),
  }),
);
