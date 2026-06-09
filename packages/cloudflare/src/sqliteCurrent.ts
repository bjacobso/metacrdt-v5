import {
  fromEvents,
  type ActorType,
  type CardinalityOf,
  type Coord,
  type Event,
  type Value,
} from "@metacrdt/core";
import type { DerivedRow, ResultPage } from "@metacrdt/query";
import {
  EventStoreService,
  ProjectionStoreService,
  RuntimeClockService,
  DatalogQueryService,
  RuntimeProfileService,
  RuntimeSequencerService,
  TransportService,
  applyOperationEffect,
  projectionDatalogQueryLayer,
  projectionRowsFromLog,
  runtimeServicesLayer,
  type DatalogAggregateArgsType,
  type DatalogDerivedRowsArgsType,
  type DatalogQueryArgsType,
  type DatalogQueryPageArgsType,
  type DatalogQueryResult,
  type EventStoreEffect,
  type Operation,
  type ProjectionRow,
  type RuntimeError,
} from "@metacrdt/runtime";
import {
  resolveVal as resolveWorkflowValue,
  stepFlow,
  type FlowDef,
  type FlowRun,
  type FlowStep,
  type StepIntent,
} from "@metacrdt/workflow";
import { Data, Effect, Layer } from "effect";
import * as Schema from "effect/Schema";
import type {
  DurableObjectSqliteCollection,
  DurableObjectSqliteCollectionTick,
  DurableObjectSqliteCollectionTickPhase,
  DurableObjectSqliteCollectionTickStatus,
  DurableObjectSqliteCollectionStatus,
  DurableObjectSqliteCollectionStore,
  DurableObjectSqliteDagEventInput,
  DurableObjectSqliteDagRun,
  DurableObjectSqliteDagRunStatus,
  DurableObjectSqliteDagStore,
  DurableObjectSqliteFlowDefinition,
  DurableObjectSqliteFlowDefinitionStatus,
  DurableObjectSqliteFlowDefinitionStore,
  DurableObjectSqliteFlowWaitTick,
  DurableObjectSqliteFlowWaitTickStatus,
  DurableObjectSqliteFlowWaitTimerStore,
  DurableObjectSqliteRuntime,
  DurableObjectSqliteTimerStore,
} from "./durableObjectSqlite.js";
import { durableObjectSqliteIndexedHistoricalDatalogQueryService } from "./sqliteQuery.js";

export class DurableObjectSqliteCurrentSurfaceError extends Data.TaggedError(
  "DurableObjectSqliteCurrentSurfaceError",
)<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const DurableObjectSqliteCoordSchema = Schema.Struct({
  txTime: Schema.Number,
  validTime: Schema.Number,
});

export const DurableObjectSqliteCurrentFilterSchema = Schema.Struct({
  e: Schema.optionalWith(Schema.String, { exact: true }),
  a: Schema.optionalWith(Schema.String, { exact: true }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteEventArgsSchema = Schema.Struct({
  id: Schema.String,
});

export const DurableObjectSqliteEventFilterSchema = Schema.Struct({
  e: Schema.optionalWith(Schema.String, { exact: true }),
  a: Schema.optionalWith(Schema.String, { exact: true }),
  ids: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  target: Schema.optionalWith(Schema.String, { exact: true }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteCurrentEntityArgsSchema = Schema.Struct({
  e: Schema.String,
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteCurrentEntitiesArgsSchema = Schema.Struct({
  type: Schema.optionalWith(Schema.String, { exact: true }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteRebuildCurrentArgsSchema = Schema.Struct({
  coord: DurableObjectSqliteCoordSchema,
});

export const DurableObjectSqliteCollectionStatusSchema = Schema.Literal(
  "issued",
  "submitted",
  "expired",
);

export const DurableObjectSqliteCollectionTickPhaseSchema = Schema.Literal(
  "reminder",
  "escalation",
  "expire",
);

export const DurableObjectSqliteCollectionTickStatusSchema = Schema.Literal(
  "pending",
  "fired",
  "skipped",
);

export const DurableObjectSqliteIssueCollectionArgsSchema = Schema.Struct({
  token: Schema.String,
  subject: Schema.String,
  form: Schema.String,
  issuedAt: Schema.optionalWith(Schema.Number, { exact: true }),
  expiresAt: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
    exact: true,
  }),
  runId: Schema.optionalWith(Schema.String, { exact: true }),
  stepId: Schema.optionalWith(Schema.String, { exact: true }),
  scope: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteCollectionByTokenArgsSchema = Schema.Struct({
  token: Schema.String,
});

export const DurableObjectSqliteListCollectionsArgsSchema = Schema.Struct({
  subject: Schema.optionalWith(Schema.String, { exact: true }),
  status: Schema.optionalWith(DurableObjectSqliteCollectionStatusSchema, {
    exact: true,
  }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteSubmitCollectionArgsSchema = Schema.Struct({
  token: Schema.String,
  submittedAt: Schema.optionalWith(Schema.Number, { exact: true }),
  data: Schema.optionalWith(Schema.Any, { exact: true }),
  assertions: Schema.optionalWith(
    Schema.Array(
      Schema.Struct({
        a: Schema.String,
        v: Schema.Any,
        validFrom: Schema.optionalWith(Schema.Number, { exact: true }),
        validTo: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
          exact: true,
        }),
        actor: Schema.String,
        actorType: Schema.optionalWith(
          Schema.Literal("human", "agent", "system", "migration"),
          { exact: true },
        ),
        causalRefs: Schema.optionalWith(Schema.Array(Schema.String), {
          exact: true,
        }),
        reason: Schema.optionalWith(Schema.String, { exact: true }),
      }),
    ),
    { exact: true },
  ),
});

export const DurableObjectSqliteScheduleCollectionTickArgsSchema = Schema.Struct({
  id: Schema.String,
  token: Schema.String,
  phase: DurableObjectSqliteCollectionTickPhaseSchema,
  fireAt: Schema.Number,
  scheduledAt: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteCollectionTickByIdArgsSchema = Schema.Struct({
  id: Schema.String,
});

export const DurableObjectSqliteListCollectionTicksArgsSchema = Schema.Struct({
  token: Schema.optionalWith(Schema.String, { exact: true }),
  phase: Schema.optionalWith(DurableObjectSqliteCollectionTickPhaseSchema, {
    exact: true,
  }),
  status: Schema.optionalWith(DurableObjectSqliteCollectionTickStatusSchema, {
    exact: true,
  }),
  dueAt: Schema.optionalWith(Schema.Number, { exact: true }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteFireCollectionTickArgsSchema = Schema.Struct({
  id: Schema.String,
  firedAt: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteFlowWaitTickStatusSchema = Schema.Literal(
  "pending",
  "fired",
  "skipped",
);

export const DurableObjectSqliteScheduleFlowWaitTickArgsSchema = Schema.Struct({
  id: Schema.String,
  runId: Schema.String,
  stepId: Schema.String,
  eventId: Schema.String,
  fireAt: Schema.Number,
  scheduledAt: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteFlowWaitTickByIdArgsSchema = Schema.Struct({
  id: Schema.String,
});

export const DurableObjectSqliteListFlowWaitTicksArgsSchema = Schema.Struct({
  runId: Schema.optionalWith(Schema.String, { exact: true }),
  stepId: Schema.optionalWith(Schema.String, { exact: true }),
  status: Schema.optionalWith(DurableObjectSqliteFlowWaitTickStatusSchema, {
    exact: true,
  }),
  dueAt: Schema.optionalWith(Schema.Number, { exact: true }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteFireFlowWaitTickArgsSchema = Schema.Struct({
  id: Schema.String,
  firedAt: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteDagRunStatusSchema = Schema.Literal(
  "running",
  "waiting",
  "completed",
  "unsupported",
);

export const DurableObjectSqliteResumeDagRunStatusSchema = Schema.Literal(
  "completed",
  "unsupported",
);

export const DurableObjectSqliteActionFieldSchema = Schema.Struct({
  name: Schema.String,
  label: Schema.optionalWith(Schema.String, { exact: true }),
  type: Schema.Literal("string", "number", "boolean", "select"),
  required: Schema.optionalWith(Schema.Boolean, { exact: true }),
  options: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  defaultValue: Schema.optionalWith(Schema.Any, { exact: true }),
});

export const DurableObjectSqliteRegisteredActionSchema = Schema.Struct({
  name: Schema.String,
  label: Schema.optionalWith(Schema.String, { exact: true }),
  appliesTo: Schema.optionalWith(Schema.String, { exact: true }),
  asserts: Schema.Record({ key: Schema.String, value: Schema.Any }),
  fields: Schema.Array(DurableObjectSqliteActionFieldSchema),
  opensForm: Schema.optionalWith(
    Schema.Struct({
      form: Schema.Any,
      scope: Schema.Any,
    }),
    { exact: true },
  ),
});

export const DurableObjectSqliteActionByNameArgsSchema = Schema.Struct({
  name: Schema.String,
});

export const DurableObjectSqliteActionsForTypeArgsSchema = Schema.Struct({
  type: Schema.String,
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteListActionsArgsSchema = Schema.Struct({
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteExecuteRegisteredActionArgsSchema = Schema.Struct({
  action: Schema.String,
  entity: Schema.String,
  runId: Schema.String,
  eventId: Schema.String,
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  flowDefName: Schema.optionalWith(Schema.String, { exact: true }),
  stepId: Schema.optionalWith(Schema.String, { exact: true }),
  nextStepId: Schema.optionalWith(Schema.String, { exact: true }),
  now: Schema.optionalWith(Schema.Number, { exact: true }),
  args: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Any }),
    { exact: true },
  ),
  collectionToken: Schema.optionalWith(Schema.String, { exact: true }),
  collectionExpiresAt: Schema.optionalWith(
    Schema.Union(Schema.Number, Schema.Null),
    { exact: true },
  ),
  message: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteDagEventInputSchema = Schema.Struct({
  eventId: Schema.String,
  stepId: Schema.String,
  type: Schema.String,
  kind: Schema.String,
  message: Schema.optionalWith(Schema.String, { exact: true }),
});

const DurableObjectSqliteDagStepAssertionSchema = Schema.Struct({
  a: Schema.String,
  v: Schema.Any,
  validFrom: Schema.optionalWith(Schema.Number, { exact: true }),
  validTo: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
    exact: true,
  }),
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  causalRefs: Schema.optionalWith(Schema.Array(Schema.String), {
    exact: true,
  }),
  reason: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteExecuteDagStepKindSchema = Schema.Literal(
  "assert",
  "collect",
  "wait",
  "unsupported",
);

export const DurableObjectSqliteExecuteDagStepArgsSchema = Schema.Struct({
  runId: Schema.String,
  flowDefName: Schema.String,
  subject: Schema.String,
  stepId: Schema.String,
  kind: DurableObjectSqliteExecuteDagStepKindSchema,
  eventId: Schema.String,
  now: Schema.optionalWith(Schema.Number, { exact: true }),
  nextStepId: Schema.optionalWith(Schema.String, { exact: true }),
  context: Schema.optionalWith(Schema.Any, { exact: true }),
  message: Schema.optionalWith(Schema.String, { exact: true }),
  assertions: Schema.optionalWith(
    Schema.Array(DurableObjectSqliteDagStepAssertionSchema),
    { exact: true },
  ),
  collection: Schema.optionalWith(
    Schema.Struct({
      token: Schema.String,
      form: Schema.String,
      expiresAt: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
        exact: true,
      }),
      scope: Schema.optionalWith(Schema.String, { exact: true }),
    }),
    { exact: true },
  ),
  wait: Schema.optionalWith(
    Schema.Struct({
      id: Schema.String,
      eventId: Schema.String,
      fireAt: Schema.Number,
    }),
    { exact: true },
  ),
});

export const DurableObjectSqliteExecuteActionArgsSchema = Schema.Struct({
  runId: Schema.String,
  flowDefName: Schema.String,
  subject: Schema.String,
  actionName: Schema.String,
  eventId: Schema.String,
  now: Schema.optionalWith(Schema.Number, { exact: true }),
  stepId: Schema.optionalWith(Schema.String, { exact: true }),
  nextStepId: Schema.optionalWith(Schema.String, { exact: true }),
  context: Schema.optionalWith(Schema.Any, { exact: true }),
  message: Schema.optionalWith(Schema.String, { exact: true }),
  assertions: Schema.optionalWith(
    Schema.Array(DurableObjectSqliteDagStepAssertionSchema),
    { exact: true },
  ),
  collection: Schema.optionalWith(
    Schema.Struct({
      token: Schema.String,
      form: Schema.String,
      expiresAt: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
        exact: true,
      }),
      scope: Schema.optionalWith(Schema.String, { exact: true }),
    }),
    { exact: true },
  ),
});

export const DurableObjectSqliteFlowStepTypeSchema = Schema.Literal(
  "assert",
  "collect",
  "wait",
  "action",
  "branch",
  "notify",
  "done",
  "unsupported",
);

export const DurableObjectSqliteFlowStepSchema = Schema.Struct({
  id: Schema.String,
  type: DurableObjectSqliteFlowStepTypeSchema,
  next: Schema.optionalWith(Schema.String, { exact: true }),
  config: Schema.optionalWith(Schema.Any, { exact: true }),
});

export const DurableObjectSqliteFlowDefinitionStatusSchema = Schema.Literal(
  "active",
  "disabled",
);

export const DurableObjectSqliteUpsertFlowDefinitionArgsSchema = Schema.Struct({
  name: Schema.String,
  status: Schema.optionalWith(DurableObjectSqliteFlowDefinitionStatusSchema, {
    exact: true,
  }),
  subjectType: Schema.optionalWith(Schema.String, { exact: true }),
  steps: Schema.Array(DurableObjectSqliteFlowStepSchema),
  createdAt: Schema.optionalWith(Schema.Number, { exact: true }),
  updatedAt: Schema.optionalWith(Schema.Number, { exact: true }),
  description: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteFlowDefinitionByNameArgsSchema = Schema.Struct({
  name: Schema.String,
});

export const DurableObjectSqliteListFlowDefinitionsArgsSchema = Schema.Struct({
  subjectType: Schema.optionalWith(Schema.String, { exact: true }),
  status: Schema.optionalWith(DurableObjectSqliteFlowDefinitionStatusSchema, {
    exact: true,
  }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteExecuteFlowArgsSchema = Schema.Struct({
  runId: Schema.String,
  flowDefName: Schema.String,
  subject: Schema.String,
  steps: Schema.Array(DurableObjectSqliteFlowStepSchema),
  startStepId: Schema.optionalWith(Schema.String, { exact: true }),
  subjectType: Schema.optionalWith(Schema.String, { exact: true }),
  eventIdPrefix: Schema.String,
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  now: Schema.optionalWith(Schema.Number, { exact: true }),
  context: Schema.optionalWith(Schema.Any, { exact: true }),
  maxSteps: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteExecuteRegisteredFlowArgsSchema = Schema.Struct({
  name: Schema.String,
  subject: Schema.String,
  runId: Schema.String,
  eventIdPrefix: Schema.String,
  startStepId: Schema.optionalWith(Schema.String, { exact: true }),
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  now: Schema.optionalWith(Schema.Number, { exact: true }),
  context: Schema.optionalWith(Schema.Any, { exact: true }),
  maxSteps: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteRecordDagRunArgsSchema = Schema.Struct({
  runId: Schema.optionalWith(Schema.String, { exact: true }),
  flowDefName: Schema.String,
  subject: Schema.String,
  status: DurableObjectSqliteDagRunStatusSchema,
  currentStepId: Schema.optionalWith(Schema.String, { exact: true }),
  context: Schema.optionalWith(Schema.Any, { exact: true }),
  events: Schema.Array(DurableObjectSqliteDagEventInputSchema),
  now: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteDagRunByIdArgsSchema = Schema.Struct({
  runId: Schema.String,
});

export const DurableObjectSqliteListDagRunsArgsSchema = Schema.Struct({
  subject: Schema.optionalWith(Schema.String, { exact: true }),
  flowDefName: Schema.optionalWith(Schema.String, { exact: true }),
  status: Schema.optionalWith(DurableObjectSqliteDagRunStatusSchema, {
    exact: true,
  }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteResumeDagRunArgsSchema = Schema.Struct({
  runId: Schema.String,
  status: DurableObjectSqliteResumeDagRunStatusSchema,
  currentStepId: Schema.optionalWith(Schema.String, { exact: true }),
  context: Schema.optionalWith(Schema.Any, { exact: true }),
  events: Schema.Array(DurableObjectSqliteDagEventInputSchema),
  now: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteAppendAssertArgsSchema = Schema.Struct({
  e: Schema.String,
  a: Schema.String,
  v: Schema.Any,
  validFrom: Schema.optionalWith(Schema.Number, { exact: true }),
  validTo: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
    exact: true,
  }),
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  causalRefs: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  reason: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteAppendLifecycleArgsSchema = Schema.Struct({
  kind: Schema.Literal("retract", "tombstone", "untombstone"),
  target: Schema.String,
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  causalRefs: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  reason: Schema.optionalWith(Schema.String, { exact: true }),
});

export type DurableObjectSqliteCurrentFilter =
  typeof DurableObjectSqliteCurrentFilterSchema.Type;
export type DurableObjectSqliteEventArgs =
  typeof DurableObjectSqliteEventArgsSchema.Type;
export type DurableObjectSqliteEventFilter =
  typeof DurableObjectSqliteEventFilterSchema.Type;
export type DurableObjectSqliteCurrentEntityArgs =
  typeof DurableObjectSqliteCurrentEntityArgsSchema.Type;
export type DurableObjectSqliteCurrentEntitiesArgs =
  typeof DurableObjectSqliteCurrentEntitiesArgsSchema.Type;
export type DurableObjectSqliteRebuildCurrentArgs =
  typeof DurableObjectSqliteRebuildCurrentArgsSchema.Type;
export type DurableObjectSqliteIssueCollectionArgs =
  typeof DurableObjectSqliteIssueCollectionArgsSchema.Type;
export type DurableObjectSqliteCollectionByTokenArgs =
  typeof DurableObjectSqliteCollectionByTokenArgsSchema.Type;
export type DurableObjectSqliteListCollectionsArgs =
  typeof DurableObjectSqliteListCollectionsArgsSchema.Type;
export type DurableObjectSqliteSubmitCollectionArgs =
  typeof DurableObjectSqliteSubmitCollectionArgsSchema.Type;
export type DurableObjectSqliteScheduleCollectionTickArgs =
  typeof DurableObjectSqliteScheduleCollectionTickArgsSchema.Type;
export type DurableObjectSqliteCollectionTickByIdArgs =
  typeof DurableObjectSqliteCollectionTickByIdArgsSchema.Type;
export type DurableObjectSqliteListCollectionTicksArgs =
  typeof DurableObjectSqliteListCollectionTicksArgsSchema.Type;
export type DurableObjectSqliteFireCollectionTickArgs =
  typeof DurableObjectSqliteFireCollectionTickArgsSchema.Type;
export type DurableObjectSqliteScheduleFlowWaitTickArgs =
  typeof DurableObjectSqliteScheduleFlowWaitTickArgsSchema.Type;
export type DurableObjectSqliteFlowWaitTickByIdArgs =
  typeof DurableObjectSqliteFlowWaitTickByIdArgsSchema.Type;
export type DurableObjectSqliteListFlowWaitTicksArgs =
  typeof DurableObjectSqliteListFlowWaitTicksArgsSchema.Type;
export type DurableObjectSqliteFireFlowWaitTickArgs =
  typeof DurableObjectSqliteFireFlowWaitTickArgsSchema.Type;
export type DurableObjectSqliteActionField =
  typeof DurableObjectSqliteActionFieldSchema.Type;
export type DurableObjectSqliteRegisteredAction =
  typeof DurableObjectSqliteRegisteredActionSchema.Type;
export type DurableObjectSqliteActionByNameArgs =
  typeof DurableObjectSqliteActionByNameArgsSchema.Type;
export type DurableObjectSqliteActionsForTypeArgs =
  typeof DurableObjectSqliteActionsForTypeArgsSchema.Type;
export type DurableObjectSqliteListActionsArgs =
  typeof DurableObjectSqliteListActionsArgsSchema.Type;
export type DurableObjectSqliteExecuteRegisteredActionArgs =
  typeof DurableObjectSqliteExecuteRegisteredActionArgsSchema.Type;
export type DurableObjectSqliteExecuteDagStepArgs =
  typeof DurableObjectSqliteExecuteDagStepArgsSchema.Type;
export type DurableObjectSqliteExecuteActionArgs =
  typeof DurableObjectSqliteExecuteActionArgsSchema.Type;
export type DurableObjectSqliteFlowStep =
  typeof DurableObjectSqliteFlowStepSchema.Type;
export type DurableObjectSqliteUpsertFlowDefinitionArgs =
  typeof DurableObjectSqliteUpsertFlowDefinitionArgsSchema.Type;
export type DurableObjectSqliteFlowDefinitionByNameArgs =
  typeof DurableObjectSqliteFlowDefinitionByNameArgsSchema.Type;
export type DurableObjectSqliteListFlowDefinitionsArgs =
  typeof DurableObjectSqliteListFlowDefinitionsArgsSchema.Type;
export type DurableObjectSqliteExecuteFlowArgs =
  typeof DurableObjectSqliteExecuteFlowArgsSchema.Type;
export type DurableObjectSqliteExecuteRegisteredFlowArgs =
  typeof DurableObjectSqliteExecuteRegisteredFlowArgsSchema.Type;
export type DurableObjectSqliteRecordDagRunArgs =
  typeof DurableObjectSqliteRecordDagRunArgsSchema.Type;
export type DurableObjectSqliteDagRunByIdArgs =
  typeof DurableObjectSqliteDagRunByIdArgsSchema.Type;
export type DurableObjectSqliteListDagRunsArgs =
  typeof DurableObjectSqliteListDagRunsArgsSchema.Type;
export type DurableObjectSqliteResumeDagRunArgs =
  typeof DurableObjectSqliteResumeDagRunArgsSchema.Type;
export type DurableObjectSqliteAppendAssertArgs =
  typeof DurableObjectSqliteAppendAssertArgsSchema.Type;
export type DurableObjectSqliteAppendLifecycleArgs =
  typeof DurableObjectSqliteAppendLifecycleArgsSchema.Type;

export type DurableObjectSqliteCurrentEntity = {
  readonly e: string;
  readonly attributes: Readonly<Record<string, readonly Value[]>>;
  readonly rows: readonly ProjectionRow[];
};

export type DurableObjectSqliteCurrentEntityListItem = {
  readonly e: string;
  readonly type?: string;
  readonly name?: string;
  readonly rows: number;
};

export type DurableObjectSqliteProjectionChange = {
  readonly e: string;
  readonly a: string;
  readonly beforeEventIds: readonly string[];
  readonly afterEventIds: readonly string[];
};

export type DurableObjectSqliteRebuildCurrentResult = {
  readonly events: number;
  readonly rows: number;
  readonly changed: readonly DurableObjectSqliteProjectionChange[];
};

export type DurableObjectSqliteAppendAndRebuildResult = {
  readonly event: Event;
  readonly projection: DurableObjectSqliteRebuildCurrentResult;
};

export type DurableObjectSqliteSubmitCollectionResult = {
  readonly collection: DurableObjectSqliteCollection;
  readonly assertions: readonly DurableObjectSqliteAppendAndRebuildResult[];
};

export type DurableObjectSqliteFireCollectionTickResult = {
  readonly tick: DurableObjectSqliteCollectionTick;
  readonly collection?: DurableObjectSqliteCollection;
};

export type DurableObjectSqliteFireFlowWaitTickResult = {
  readonly tick: DurableObjectSqliteFlowWaitTick;
  readonly run?: DurableObjectSqliteDagRun;
};

export type DurableObjectSqliteExecuteDagStepResult = {
  readonly run: DurableObjectSqliteDagRun;
  readonly assertions: readonly DurableObjectSqliteAppendAndRebuildResult[];
  readonly collection?: DurableObjectSqliteCollection;
  readonly waitTick?: DurableObjectSqliteFlowWaitTick;
};

export type DurableObjectSqliteExecuteActionResult =
  DurableObjectSqliteExecuteDagStepResult & {
    readonly actionName: string;
  };

export type DurableObjectSqliteExecuteRegisteredActionResult = {
  readonly action: DurableObjectSqliteRegisteredAction;
  readonly execution: DurableObjectSqliteExecuteActionResult;
};

export type DurableObjectSqliteExecuteFlowStepSummary = {
  readonly stepId: string;
  readonly type: string;
  readonly kind: string;
  readonly message?: string;
};

export type DurableObjectSqliteExecuteFlowResult = {
  readonly run: DurableObjectSqliteDagRun;
  readonly steps: readonly DurableObjectSqliteExecuteFlowStepSummary[];
  readonly assertions: readonly DurableObjectSqliteAppendAndRebuildResult[];
  readonly collections: readonly DurableObjectSqliteCollection[];
  readonly waitTicks: readonly DurableObjectSqliteFlowWaitTick[];
  readonly actions: readonly DurableObjectSqliteExecuteRegisteredActionResult[];
};

export type DurableObjectSqliteCurrentSurfaceOptions = {
  readonly cardinalityOf: CardinalityOf;
  readonly currentCoord?: () => Coord;
};

export type DurableObjectSqliteCurrentSurface = {
  appendAssert(
    args: DurableObjectSqliteAppendAssertArgs,
  ): Promise<DurableObjectSqliteAppendAndRebuildResult>;
  appendLifecycle(
    args: DurableObjectSqliteAppendLifecycleArgs,
  ): Promise<DurableObjectSqliteAppendAndRebuildResult>;
  getEvent(args: DurableObjectSqliteEventArgs): Promise<Event | undefined>;
  listEvents(args?: DurableObjectSqliteEventFilter): Promise<Event[]>;
  query(args: DatalogQueryArgsType): Promise<DatalogQueryResult>;
  page(
    args: DatalogQueryPageArgsType,
  ): Promise<ResultPage<Record<string, unknown>>>;
  aggregate(args: DatalogAggregateArgsType): Promise<Record<string, unknown>[]>;
  derivedRows(args: DatalogDerivedRowsArgsType): Promise<DerivedRow[]>;
  queryCurrent(args: DatalogQueryArgsType): Promise<DatalogQueryResult>;
  pageCurrent(
    args: DatalogQueryPageArgsType,
  ): Promise<ResultPage<Record<string, unknown>>>;
  aggregateCurrent(
    args: DatalogAggregateArgsType,
  ): Promise<Record<string, unknown>[]>;
  derivedRowsCurrent(args: DatalogDerivedRowsArgsType): Promise<DerivedRow[]>;
  rebuildCurrent(
    args?: DurableObjectSqliteRebuildCurrentArgs,
  ): Promise<DurableObjectSqliteRebuildCurrentResult>;
  issueCollection(
    args: DurableObjectSqliteIssueCollectionArgs,
  ): Promise<DurableObjectSqliteCollection>;
  collectionByToken(
    args: DurableObjectSqliteCollectionByTokenArgs,
  ): Promise<DurableObjectSqliteCollection | undefined>;
  listCollections(
    args?: DurableObjectSqliteListCollectionsArgs,
  ): Promise<DurableObjectSqliteCollection[]>;
  submitCollection(
    args: DurableObjectSqliteSubmitCollectionArgs,
  ): Promise<DurableObjectSqliteSubmitCollectionResult>;
  actionByName(
    args: DurableObjectSqliteActionByNameArgs,
  ): Promise<DurableObjectSqliteRegisteredAction | undefined>;
  listActions(
    args?: DurableObjectSqliteListActionsArgs,
  ): Promise<DurableObjectSqliteRegisteredAction[]>;
  actionsForType(
    args: DurableObjectSqliteActionsForTypeArgs,
  ): Promise<DurableObjectSqliteRegisteredAction[]>;
  upsertFlowDefinition(
    args: DurableObjectSqliteUpsertFlowDefinitionArgs,
  ): Promise<DurableObjectSqliteFlowDefinition>;
  flowDefinitionByName(
    args: DurableObjectSqliteFlowDefinitionByNameArgs,
  ): Promise<DurableObjectSqliteFlowDefinition | undefined>;
  listFlowDefinitions(
    args?: DurableObjectSqliteListFlowDefinitionsArgs,
  ): Promise<DurableObjectSqliteFlowDefinition[]>;
  scheduleCollectionTick(
    args: DurableObjectSqliteScheduleCollectionTickArgs,
  ): Promise<DurableObjectSqliteCollectionTick>;
  collectionTickById(
    args: DurableObjectSqliteCollectionTickByIdArgs,
  ): Promise<DurableObjectSqliteCollectionTick | undefined>;
  listCollectionTicks(
    args?: DurableObjectSqliteListCollectionTicksArgs,
  ): Promise<DurableObjectSqliteCollectionTick[]>;
  fireCollectionTick(
    args: DurableObjectSqliteFireCollectionTickArgs,
  ): Promise<DurableObjectSqliteFireCollectionTickResult>;
  scheduleFlowWaitTick(
    args: DurableObjectSqliteScheduleFlowWaitTickArgs,
  ): Promise<DurableObjectSqliteFlowWaitTick>;
  flowWaitTickById(
    args: DurableObjectSqliteFlowWaitTickByIdArgs,
  ): Promise<DurableObjectSqliteFlowWaitTick | undefined>;
  listFlowWaitTicks(
    args?: DurableObjectSqliteListFlowWaitTicksArgs,
  ): Promise<DurableObjectSqliteFlowWaitTick[]>;
  fireFlowWaitTick(
    args: DurableObjectSqliteFireFlowWaitTickArgs,
  ): Promise<DurableObjectSqliteFireFlowWaitTickResult>;
  executeDagStep(
    args: DurableObjectSqliteExecuteDagStepArgs,
  ): Promise<DurableObjectSqliteExecuteDagStepResult>;
  executeAction(
    args: DurableObjectSqliteExecuteActionArgs,
  ): Promise<DurableObjectSqliteExecuteActionResult>;
  executeFlow(
    args: DurableObjectSqliteExecuteFlowArgs,
  ): Promise<DurableObjectSqliteExecuteFlowResult>;
  executeRegisteredFlow(
    args: DurableObjectSqliteExecuteRegisteredFlowArgs,
  ): Promise<DurableObjectSqliteExecuteFlowResult>;
  executeRegisteredAction(
    args: DurableObjectSqliteExecuteRegisteredActionArgs,
  ): Promise<DurableObjectSqliteExecuteRegisteredActionResult>;
  recordDagRun(
    args: DurableObjectSqliteRecordDagRunArgs,
  ): Promise<DurableObjectSqliteDagRun>;
  getDagRun(
    args: DurableObjectSqliteDagRunByIdArgs,
  ): Promise<DurableObjectSqliteDagRun | undefined>;
  listDagRuns(
    args?: DurableObjectSqliteListDagRunsArgs,
  ): Promise<DurableObjectSqliteDagRun[]>;
  resumeDagRun(
    args: DurableObjectSqliteResumeDagRunArgs,
  ): Promise<DurableObjectSqliteDagRun>;
  listCurrent(
    args?: DurableObjectSqliteCurrentFilter,
  ): Promise<ProjectionRow[]>;
  getCurrentEntity(
    args: DurableObjectSqliteCurrentEntityArgs,
  ): Promise<DurableObjectSqliteCurrentEntity | null>;
  listCurrentEntities(
    args?: DurableObjectSqliteCurrentEntitiesArgs,
  ): Promise<DurableObjectSqliteCurrentEntityListItem[]>;
};

function decode<A, I>(
  operation: string,
  schema: Schema.Schema<A, I>,
  input: unknown,
): Effect.Effect<A, DurableObjectSqliteCurrentSurfaceError> {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(schema)(input),
    catch: (cause) =>
      new DurableObjectSqliteCurrentSurfaceError({
        operation,
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });
}

function surfaceError(
  operation: string,
  cause: unknown,
): DurableObjectSqliteCurrentSurfaceError {
  return new DurableObjectSqliteCurrentSurfaceError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function limit(n: number | undefined, fallback: number, max: number): number {
  const value = Number.isFinite(n) ? n! : fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

function sortRows(rows: readonly ProjectionRow[]): ProjectionRow[] {
  return [...rows].sort((a, b) => {
    const e = a.e.localeCompare(b.e);
    if (e !== 0) return e;
    const attr = a.a.localeCompare(b.a);
    if (attr !== 0) return attr;
    return a.eventId.localeCompare(b.eventId);
  });
}

function projectionCoordKey(row: Pick<ProjectionRow, "e" | "a">): string {
  return `${row.e}\u0000${row.a}`;
}

function sortedEventIds(rows: readonly ProjectionRow[]): string[] {
  return [...new Set(rows.map((row) => row.eventId))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function projectionChangeSummary(
  before: readonly ProjectionRow[],
  after: readonly ProjectionRow[],
): DurableObjectSqliteProjectionChange[] {
  const beforeByCoord = new Map<string, ProjectionRow[]>();
  const afterByCoord = new Map<string, ProjectionRow[]>();
  for (const row of before) {
    const group = beforeByCoord.get(projectionCoordKey(row)) ?? [];
    group.push(row);
    beforeByCoord.set(projectionCoordKey(row), group);
  }
  for (const row of after) {
    const group = afterByCoord.get(projectionCoordKey(row)) ?? [];
    group.push(row);
    afterByCoord.set(projectionCoordKey(row), group);
  }

  const keys = [...new Set([...beforeByCoord.keys(), ...afterByCoord.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );
  const changes: DurableObjectSqliteProjectionChange[] = [];
  for (const key of keys) {
    const beforeRows = beforeByCoord.get(key) ?? [];
    const afterRows = afterByCoord.get(key) ?? [];
    const beforeEventIds = sortedEventIds(beforeRows);
    const afterEventIds = sortedEventIds(afterRows);
    if (beforeEventIds.join("\u0000") === afterEventIds.join("\u0000")) {
      continue;
    }
    const sample = afterRows[0] ?? beforeRows[0];
    if (sample === undefined) continue;
    changes.push({
      e: sample.e,
      a: sample.a,
      beforeEventIds,
      afterEventIds,
    });
  }
  return changes;
}

function sortEvents(events: readonly Event[]): Event[] {
  return [...events].sort((a, b) => a.id.localeCompare(b.id));
}

function entityFromRows(
  e: string,
  rows: readonly ProjectionRow[],
): DurableObjectSqliteCurrentEntity | null {
  if (rows.length === 0) return null;
  const attributes: Record<string, Value[]> = {};
  for (const row of sortRows(rows)) {
    const values = attributes[row.a] ?? [];
    values.push(row.v);
    attributes[row.a] = values;
  }
  return { e, attributes, rows: sortRows(rows) };
}

function actionEntityId(name: string): string {
  return `action:${name}`;
}

function firstAttributeValue(
  entity: DurableObjectSqliteCurrentEntity,
  attribute: string,
): unknown {
  return entity.attributes[attribute]?.[0];
}

function decodeActionDefinitionValue<A, I>(
  operation: string,
  schema: Schema.Schema<A, I>,
  value: unknown,
): Effect.Effect<A, DurableObjectSqliteCurrentSurfaceError> {
  return decode(operation, schema, value);
}

function actionDefinitionFromEntity(
  operation: string,
  name: string,
  entity: DurableObjectSqliteCurrentEntity | null,
): Effect.Effect<
  DurableObjectSqliteRegisteredAction | undefined,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    if (entity === null) return undefined;
    const types = entity.attributes.type ?? [];
    if (!types.some((value) => value === "Action")) return undefined;
    const assertsValue = firstAttributeValue(entity, "asserts") ?? {};
    const fieldsValue = firstAttributeValue(entity, "fields") ?? [];
    const opensFormValue = firstAttributeValue(entity, "opensForm");
    const asserts = yield* decodeActionDefinitionValue(
      operation,
      Schema.Record({ key: Schema.String, value: Schema.Any }),
      assertsValue,
    );
    const fields = yield* decodeActionDefinitionValue(
      operation,
      Schema.Array(DurableObjectSqliteActionFieldSchema),
      fieldsValue,
    );
    const opensForm = opensFormValue === undefined
      ? undefined
      : yield* decodeActionDefinitionValue(
        operation,
        Schema.Struct({ form: Schema.Any, scope: Schema.Any }),
        opensFormValue,
      );
    return yield* decodeActionDefinitionValue(
      operation,
      DurableObjectSqliteRegisteredActionSchema,
      {
        name,
        ...(typeof firstAttributeValue(entity, "label") === "string"
          ? { label: firstAttributeValue(entity, "label") }
          : {}),
        ...(typeof firstAttributeValue(entity, "appliesTo") === "string"
          ? { appliesTo: firstAttributeValue(entity, "appliesTo") }
          : {}),
        asserts,
        fields,
        ...(opensForm === undefined ? {} : { opensForm }),
      },
    );
  });
}

function resolveRegisteredActionValue(
  raw: unknown,
  entity: string,
  fields: readonly DurableObjectSqliteActionField[],
  args: Readonly<Record<string, unknown>>,
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "$entity") return entity;
  if (!raw.startsWith("$arg.")) return raw;
  const name = raw.slice("$arg.".length);
  const field = fields.find((candidate) => candidate.name === name);
  if (field === undefined) {
    throw new Error(`unknown action arg placeholder: ${name}`);
  }
  const value = args[name] ?? field.defaultValue;
  if (value === undefined && field.required !== false) {
    throw new Error(`missing action arg: ${name}`);
  }
  if (value === undefined) return null;
  if (field.type === "select") {
    const allowed = field.options ?? [];
    if (!allowed.includes(String(value))) {
      throw new Error(`invalid action arg ${name}: ${String(value)}`);
    }
  }
  return value;
}

function resolveRegisteredActionString(
  label: string,
  raw: unknown,
  entity: string,
  fields: readonly DurableObjectSqliteActionField[],
  args: Readonly<Record<string, unknown>>,
): string {
  const value = resolveRegisteredActionValue(raw, entity, fields, args);
  if (value === null || value === "") {
    throw new Error(`missing action ${label}`);
  }
  return String(value);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveFlowValue(
  raw: unknown,
  subject: string,
  context: Readonly<Record<string, unknown>>,
): unknown {
  if (raw === "$entity") return subject;
  if (typeof raw === "string" && raw.startsWith("$context.")) {
    return context[raw.slice("$context.".length)];
  }
  return resolveWorkflowValue(raw, { subject, context: { ...context } });
}

function flowEventId(prefix: string, index: number, stepId: string, kind: string): string {
  return `${prefix}:${index}:${stepId}:${kind}`;
}

function flowStepSummary(
  step: DurableObjectSqliteFlowStep,
  kind: string,
  message?: string,
): DurableObjectSqliteExecuteFlowStepSummary {
  return {
    stepId: step.id,
    type: step.type,
    kind,
    ...(message === undefined ? {} : { message }),
  };
}

function flowTimelineEvent(
  prefix: string,
  index: number,
  step: DurableObjectSqliteFlowStep,
  kind: string,
  message?: string,
): DurableObjectSqliteDagEventInput {
  return {
    eventId: flowEventId(prefix, index, step.id, kind),
    stepId: step.id,
    type: step.type,
    kind,
    ...(message === undefined ? {} : { message }),
  };
}

function hasCurrentValue(
  entity: DurableObjectSqliteCurrentEntity | null,
  attribute: string,
  value: unknown,
): boolean {
  return (entity?.attributes[attribute] ?? []).some(
    (candidate) => JSON.stringify(candidate) === JSON.stringify(value),
  );
}

function flowEntityTermMatchesSubject(
  term: unknown,
  subjectVar: string,
  subject: string,
): boolean {
  return term === `?${subjectVar}` || term === "$subject" || term === "$entity" ||
    term === subject;
}

function branchMatchesCurrentEntity(
  entity: DurableObjectSqliteCurrentEntity | null,
  where: unknown,
  subjectVar: string,
  subject: string,
  context: Readonly<Record<string, unknown>>,
): boolean {
  const clauses = Array.isArray(where) ? where : [];
  const patterns = clauses.filter((clause): clause is readonly unknown[] =>
    Array.isArray(clause) && clause.length >= 3
  );
  if (patterns.length === 0) return false;

  for (const [e, a, v] of patterns) {
    if (!flowEntityTermMatchesSubject(e, subjectVar, subject)) return false;
    if (typeof a !== "string") return false;
    if (typeof v === "string" && v.startsWith("?")) return false;
    if (!hasCurrentValue(entity, a, resolveFlowValue(v, subject, context))) {
      return false;
    }
  }
  return true;
}

function listItemFromRows(
  e: string,
  rows: readonly ProjectionRow[],
): DurableObjectSqliteCurrentEntityListItem {
  const type = rows.find((row) => row.a === "type" && typeof row.v === "string")
    ?.v as string | undefined;
  const name = rows.find((row) => row.a === "name" && typeof row.v === "string")
    ?.v as string | undefined;
  return { e, type, name, rows: rows.length };
}

type ProjectionCoord = {
  readonly e: string;
  readonly a: string;
};

function assertCoord(event: Event): ProjectionCoord | undefined {
  return event.kind === "assert" &&
    event.e !== undefined &&
    event.a !== undefined
    ? { e: event.e, a: event.a }
    : undefined;
}

function rowsForCoord(
  rows: readonly ProjectionRow[],
  coord: ProjectionCoord,
): ProjectionRow[] {
  return rows.filter((row) => row.e === coord.e && row.a === coord.a);
}

function uniqueEvents(events: Iterable<Event>): Event[] {
  return [...new Map([...events].map((event) => [event.id, event])).values()];
}

function eventsForCoord(
  store: EventStoreEffect,
  coord: ProjectionCoord,
): Effect.Effect<Event[], RuntimeError> {
  return Effect.gen(function* () {
    const asserts = yield* store.scan(coord);
    const lifecycleGroups = yield* Effect.all(
      asserts.map((event) => store.scan({ target: event.id })),
      { concurrency: "unbounded" },
    );
    return uniqueEvents([...asserts, ...lifecycleGroups.flat()]);
  });
}

export function rebuildDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteRebuildCurrentArgs,
  cardinalityOf: CardinalityOf,
): Effect.Effect<
  DurableObjectSqliteRebuildCurrentResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService | ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "rebuildCurrent",
      DurableObjectSqliteRebuildCurrentArgsSchema,
      args,
    );
    const store = yield* EventStoreService;
    const projection = yield* ProjectionStoreService;
    const beforeRows = yield* projection.scan();
    const events = yield* store.scan();
    const rows = yield* Effect.try({
      try: () => projectionRowsFromLog(fromEvents(events), decoded.coord, cardinalityOf),
      catch: (cause) => surfaceError("rebuildCurrent", cause),
    });
    const replaced = yield* projection.replace(rows);
    return {
      events: events.length,
      rows: replaced.rows,
      changed: projectionChangeSummary(beforeRows, rows),
    };
  });
}

export function reconcileDurableObjectSqliteCurrentEventEffect(
  event: Event,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteRebuildCurrentResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService | ProjectionStoreService
> {
  return Effect.gen(function* () {
    const store = yield* EventStoreService;
    const projection = yield* ProjectionStoreService;
    const targetEvents = event.target === undefined
      ? []
      : yield* store.scan({ ids: [event.target] });
    const target = targetEvents[0];
    const touched = assertCoord(event) ?? (target ? assertCoord(target) : undefined);
    if (touched === undefined) {
      const rows = yield* projection.scan();
      return { events: 0, rows: rows.length, changed: [] };
    }

    const beforeRows = yield* projection.scan(touched);
    const events = yield* eventsForCoord(store, touched);
    const afterRows = yield* Effect.try({
      try: () =>
        rowsForCoord(
          projectionRowsFromLog(fromEvents(events), coord, cardinalityOf),
          touched,
        ),
      catch: (cause) => surfaceError("reconcileCurrent", cause),
    });
    yield* projection.replaceMatching(touched, afterRows);
    const currentRows = yield* projection.scan();
    return {
      events: events.length,
      rows: currentRows.length,
      changed: projectionChangeSummary(beforeRows, afterRows),
    };
  });
}

export function getDurableObjectSqliteEventEffect(
  args: DurableObjectSqliteEventArgs,
): Effect.Effect<
  Event | undefined,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "getEvent",
      DurableObjectSqliteEventArgsSchema,
      args,
    );
    const store = yield* EventStoreService;
    return yield* store.get(decoded.id);
  });
}

export function listDurableObjectSqliteEventsEffect(
  args: DurableObjectSqliteEventFilter = {},
): Effect.Effect<
  Event[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listEvents",
      DurableObjectSqliteEventFilterSchema,
      args,
    );
    const store = yield* EventStoreService;
    const events = yield* store.scan({
      ...(decoded.e === undefined ? {} : { e: decoded.e }),
      ...(decoded.a === undefined ? {} : { a: decoded.a }),
      ...(decoded.ids === undefined ? {} : { ids: decoded.ids }),
      ...(decoded.target === undefined ? {} : { target: decoded.target }),
    });
    return sortEvents(events).slice(0, limit(decoded.limit, 100, 1000));
  });
}

export function issueDurableObjectSqliteCollectionEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteIssueCollectionArgs,
  defaultIssuedAt: number,
): Effect.Effect<
  DurableObjectSqliteCollection,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "issueCollection",
      DurableObjectSqliteIssueCollectionArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        collections.issue({
          token: decoded.token,
          subject: decoded.subject,
          form: decoded.form,
          issuedAt: decoded.issuedAt ?? defaultIssuedAt,
          expiresAt: decoded.expiresAt,
          runId: decoded.runId,
          stepId: decoded.stepId,
          scope: decoded.scope,
        }),
      catch: (cause) => surfaceError("issueCollection", cause),
    });
  });
}

export function getDurableObjectSqliteCollectionByTokenEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteCollectionByTokenArgs,
): Effect.Effect<
  DurableObjectSqliteCollection | undefined,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "collectionByToken",
      DurableObjectSqliteCollectionByTokenArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () => collections.get(decoded.token),
      catch: (cause) => surfaceError("collectionByToken", cause),
    });
  });
}

export function listDurableObjectSqliteCollectionsEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteListCollectionsArgs = {},
): Effect.Effect<
  DurableObjectSqliteCollection[],
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listCollections",
      DurableObjectSqliteListCollectionsArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        collections.list({
          subject: decoded.subject,
          status: decoded.status as DurableObjectSqliteCollectionStatus | undefined,
          limit: limit(decoded.limit, 100, 1000),
        }),
      catch: (cause) => surfaceError("listCollections", cause),
    });
  });
}

export function submitDurableObjectSqliteCollectionEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteSubmitCollectionArgs,
  defaultSubmittedAt: number,
): Effect.Effect<
  DurableObjectSqliteCollection,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "submitCollection",
      DurableObjectSqliteSubmitCollectionArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        collections.submit({
          token: decoded.token,
          submittedAt: decoded.submittedAt ?? defaultSubmittedAt,
          data: decoded.data,
        }),
      catch: (cause) => surfaceError("submitCollection", cause),
    });
  });
}

export function submitAndLowerDurableObjectSqliteCollectionEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteSubmitCollectionArgs,
  defaultSubmittedAt: number,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteSubmitCollectionResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "submitCollection",
      DurableObjectSqliteSubmitCollectionArgsSchema,
      args,
    );
    const collection = yield* Effect.tryPromise({
      try: () =>
        collections.submit({
          token: decoded.token,
          submittedAt: decoded.submittedAt ?? defaultSubmittedAt,
          data: decoded.data,
        }),
      catch: (cause) => surfaceError("submitCollection", cause),
    });
    const assertions: DurableObjectSqliteAppendAndRebuildResult[] = [];
    for (const assertion of decoded.assertions ?? []) {
      const event = yield* applyOperationEffect({
        op: "assert",
        e: collection.subject,
        a: assertion.a,
        v: assertion.v,
        validFrom: assertion.validFrom,
        validTo: assertion.validTo,
        actor: assertion.actor,
        actorType: assertion.actorType as ActorType | undefined,
        causalRefs: assertion.causalRefs,
        reason: assertion.reason,
      });
      const projection = yield* reconcileDurableObjectSqliteCurrentEventEffect(
        event,
        cardinalityOf,
        coord,
      );
      assertions.push({ event, projection });
    }
    return { collection, assertions };
  });
}

export function getDurableObjectSqliteActionByNameEffect(
  args: DurableObjectSqliteActionByNameArgs,
): Effect.Effect<
  DurableObjectSqliteRegisteredAction | undefined,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "actionByName",
      DurableObjectSqliteActionByNameArgsSchema,
      args,
    );
    const entity = yield* getDurableObjectSqliteCurrentEntityEffect({
      e: actionEntityId(decoded.name),
    });
    return yield* actionDefinitionFromEntity("actionByName", decoded.name, entity);
  });
}

export function listDurableObjectSqliteActionsEffect(
  args: DurableObjectSqliteListActionsArgs = {},
): Effect.Effect<
  DurableObjectSqliteRegisteredAction[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listActions",
      DurableObjectSqliteListActionsArgsSchema,
      args,
    );
    const projection = yield* ProjectionStoreService;
    const typeRows = yield* projection.scan({ a: "type" });
    const actionIds = [
      ...new Set(
        typeRows
          .filter((row) => row.v === "Action" && row.e.startsWith("action:"))
          .map((row) => row.e)
          .sort((a, b) => a.localeCompare(b)),
      ),
    ];
    const actions: DurableObjectSqliteRegisteredAction[] = [];
    for (const actionId of actionIds) {
      const entity = yield* getDurableObjectSqliteCurrentEntityEffect({
        e: actionId,
      });
      const action = yield* actionDefinitionFromEntity(
        "listActions",
        actionId.slice("action:".length),
        entity,
      );
      if (action !== undefined) actions.push(action);
    }
    return actions
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit(decoded.limit, 100, 500));
  });
}

export function listDurableObjectSqliteActionsForTypeEffect(
  args: DurableObjectSqliteActionsForTypeArgs,
): Effect.Effect<
  DurableObjectSqliteRegisteredAction[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "actionsForType",
      DurableObjectSqliteActionsForTypeArgsSchema,
      args,
    );
    const actions = yield* listDurableObjectSqliteActionsEffect({
      limit: limit(decoded.limit, 100, 500),
    });
    return actions.filter((action) => action.appliesTo === decoded.type);
  });
}

export function upsertDurableObjectSqliteFlowDefinitionEffect(
  flowDefinitions: DurableObjectSqliteFlowDefinitionStore,
  args: DurableObjectSqliteUpsertFlowDefinitionArgs,
  defaultNow: number,
): Effect.Effect<
  DurableObjectSqliteFlowDefinition,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "upsertFlowDefinition",
      DurableObjectSqliteUpsertFlowDefinitionArgsSchema,
      args,
    );
    const createdAt = decoded.createdAt ?? defaultNow;
    const updatedAt = decoded.updatedAt ?? createdAt;
    return yield* Effect.tryPromise({
      try: () =>
        flowDefinitions.upsert({
          name: decoded.name,
          ...(decoded.status === undefined
            ? {}
            : {
              status: decoded.status as DurableObjectSqliteFlowDefinitionStatus,
            }),
          ...(decoded.subjectType === undefined
            ? {}
            : { subjectType: decoded.subjectType }),
          steps: decoded.steps,
          createdAt,
          updatedAt,
          ...(decoded.description === undefined
            ? {}
            : { description: decoded.description }),
        }),
      catch: (cause) => surfaceError("upsertFlowDefinition", cause),
    });
  });
}

export function getDurableObjectSqliteFlowDefinitionByNameEffect(
  flowDefinitions: DurableObjectSqliteFlowDefinitionStore,
  args: DurableObjectSqliteFlowDefinitionByNameArgs,
): Effect.Effect<
  DurableObjectSqliteFlowDefinition | undefined,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "flowDefinitionByName",
      DurableObjectSqliteFlowDefinitionByNameArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () => flowDefinitions.get(decoded.name),
      catch: (cause) => surfaceError("flowDefinitionByName", cause),
    });
  });
}

export function listDurableObjectSqliteFlowDefinitionsEffect(
  flowDefinitions: DurableObjectSqliteFlowDefinitionStore,
  args: DurableObjectSqliteListFlowDefinitionsArgs = {},
): Effect.Effect<
  DurableObjectSqliteFlowDefinition[],
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listFlowDefinitions",
      DurableObjectSqliteListFlowDefinitionsArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        flowDefinitions.list({
          ...(decoded.subjectType === undefined
            ? {}
            : { subjectType: decoded.subjectType }),
          ...(decoded.status === undefined
            ? {}
            : {
              status: decoded.status as DurableObjectSqliteFlowDefinitionStatus,
            }),
          limit: limit(decoded.limit, 100, 500),
        }),
      catch: (cause) => surfaceError("listFlowDefinitions", cause),
    });
  });
}

export function executeDurableObjectSqliteRegisteredActionEffect(
  dag: DurableObjectSqliteDagStore,
  collections: DurableObjectSqliteCollectionStore,
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteExecuteRegisteredActionArgs,
  defaultNow: number,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteExecuteRegisteredActionResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "executeRegisteredAction",
      DurableObjectSqliteExecuteRegisteredActionArgsSchema,
      args,
    );
    const action = yield* getDurableObjectSqliteActionByNameEffect({
      name: decoded.action,
    });
    if (action === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredAction",
          new Error(`unknown action: ${decoded.action}`),
        ),
      );
    }
    const entity = yield* getDurableObjectSqliteCurrentEntityEffect({
      e: decoded.entity,
    });
    if (entity === null) {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredAction",
          new Error(`entity ${decoded.entity} not found`),
        ),
      );
    }
    const types = entity.attributes.type?.map((value) => String(value)) ?? [];
    if (action.appliesTo !== undefined && !types.includes(action.appliesTo)) {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredAction",
          new Error(
            `action ${decoded.action} applies to ${action.appliesTo}, not ${types.join(", ") || "(untyped)"}`,
          ),
        ),
      );
    }

    const actionArgs = decoded.args ?? {};
    const assertEntries = Object.entries(action.asserts);
    if (assertEntries.length > 0 && action.opensForm !== undefined) {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredAction",
          new Error(
            "executeRegisteredAction supports exactly one registered action effect in this slice",
          ),
        ),
      );
    }
    if (assertEntries.length === 0 && action.opensForm === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredAction",
          new Error("registered action has no supported effect"),
        ),
      );
    }

    if (assertEntries.length > 0) {
      const assertions = yield* Effect.try({
        try: () =>
          assertEntries.map(([attribute, raw]) => ({
            a: attribute,
            v: resolveRegisteredActionValue(
              raw,
              decoded.entity,
              action.fields,
              actionArgs,
            ),
            actor: decoded.actor,
            ...(decoded.actorType === undefined
              ? {}
              : { actorType: decoded.actorType as ActorType }),
            reason: `registered action ${decoded.action} on ${decoded.entity}`,
          })),
        catch: (cause) => surfaceError("executeRegisteredAction", cause),
      });
      const execution = yield* executeDurableObjectSqliteActionEffect(
        dag,
        collections,
        flowWaitTimers,
        {
          runId: decoded.runId,
          flowDefName: decoded.flowDefName ?? `action:${decoded.action}`,
          subject: decoded.entity,
          actionName: decoded.action,
          eventId: decoded.eventId,
          now: decoded.now ?? defaultNow,
          ...(decoded.stepId === undefined ? {} : { stepId: decoded.stepId }),
          ...(decoded.nextStepId === undefined
            ? {}
            : { nextStepId: decoded.nextStepId }),
          ...(decoded.message === undefined ? {} : { message: decoded.message }),
          assertions,
        },
        defaultNow,
        cardinalityOf,
        coord,
      );
      return { action, execution };
    }

    if (decoded.collectionToken === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredAction",
          new Error("registered collection action requires collectionToken"),
        ),
      );
    }
    const collection = yield* Effect.try({
      try: () => {
        const opensForm = action.opensForm!;
        return {
          token: decoded.collectionToken!,
          form: resolveRegisteredActionString(
            "form",
            opensForm.form,
            decoded.entity,
            action.fields,
            actionArgs,
          ),
          ...(decoded.collectionExpiresAt === undefined
            ? {}
            : { expiresAt: decoded.collectionExpiresAt }),
          scope: resolveRegisteredActionString(
            "scope",
            opensForm.scope,
            decoded.entity,
            action.fields,
            actionArgs,
          ),
        };
      },
      catch: (cause) => surfaceError("executeRegisteredAction", cause),
    });
    const execution = yield* executeDurableObjectSqliteActionEffect(
      dag,
      collections,
      flowWaitTimers,
      {
        runId: decoded.runId,
        flowDefName: decoded.flowDefName ?? `action:${decoded.action}`,
        subject: decoded.entity,
        actionName: decoded.action,
        eventId: decoded.eventId,
        now: decoded.now ?? defaultNow,
        ...(decoded.stepId === undefined ? {} : { stepId: decoded.stepId }),
        ...(decoded.nextStepId === undefined
          ? {}
          : { nextStepId: decoded.nextStepId }),
        ...(decoded.message === undefined ? {} : { message: decoded.message }),
        collection,
      },
      defaultNow,
      cardinalityOf,
      coord,
    );
    return { action, execution };
  });
}

export function executeDurableObjectSqliteFlowEffect(
  dag: DurableObjectSqliteDagStore,
  collections: DurableObjectSqliteCollectionStore,
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteExecuteFlowArgs,
  defaultNow: number,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteExecuteFlowResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "executeFlow",
      DurableObjectSqliteExecuteFlowArgsSchema,
      args,
    );
    const now = decoded.now ?? defaultNow;
    const context = recordOrEmpty(decoded.context);
    const maxSteps = limit(decoded.maxSteps, 50, 200);
    if (decoded.steps.length === 0) {
      return yield* Effect.fail(
        surfaceError("executeFlow", new Error("executeFlow requires at least one step")),
      );
    }

    const stepsById = new Map(decoded.steps.map((step) => [step.id, step]));
    let currentStepId = decoded.startStepId ?? decoded.steps[0]!.id;
    let currentEntity = yield* getDurableObjectSqliteCurrentEntityEffect({
      e: decoded.subject,
    });
    if (decoded.subjectType !== undefined) {
      const types = currentEntity?.attributes.type?.map((value) => String(value)) ?? [];
      if (!types.includes(decoded.subjectType)) {
        return yield* Effect.fail(
          surfaceError(
            "executeFlow",
            new Error(
              `flow ${decoded.flowDefName} applies to ${decoded.subjectType}, not ${types.join(", ") || "(untyped)"}`,
            ),
          ),
        );
      }
    }

    const summaries: DurableObjectSqliteExecuteFlowStepSummary[] = [];
    const assertions: DurableObjectSqliteAppendAndRebuildResult[] = [];
    const collectionsOut: DurableObjectSqliteCollection[] = [];
    const waitTicks: DurableObjectSqliteFlowWaitTick[] = [];
    const actions: DurableObjectSqliteExecuteRegisteredActionResult[] = [];

    const recordTimeline = (
      step: DurableObjectSqliteFlowStep,
      index: number,
      status: DurableObjectSqliteDagRunStatus,
      current: string | undefined,
      kind: string,
      message?: string,
    ) =>
      Effect.tryPromise({
        try: () =>
          dag.record({
            runId: decoded.runId,
            flowDefName: decoded.flowDefName,
            subject: decoded.subject,
            status,
            currentStepId: current,
            context,
            events: [
              flowTimelineEvent(
                decoded.eventIdPrefix,
                index,
                step,
                kind,
                message,
              ),
            ],
            now,
          }),
        catch: (cause) => surfaceError("executeFlow", cause),
      });

    const workflowSteps = decoded.steps.map((step) => ({
      id: step.id,
      type: step.type as FlowStep["type"],
      ...(step.next === undefined ? {} : { next: step.next }),
      ...(step.config === undefined ? {} : { config: recordOrEmpty(step.config) }),
    }));
    const flowDef: FlowDef = {
      name: decoded.flowDefName,
      ...(decoded.subjectType === undefined ? {} : { subjectType: decoded.subjectType }),
      startStepId: decoded.startStepId ?? decoded.steps[0]!.id,
      steps: workflowSteps,
    };
    let runState: FlowRun = {
      id: decoded.runId,
      flowName: decoded.flowDefName,
      flowDefName: decoded.flowDefName,
      subject: decoded.subject,
      status: "running",
      currentStepId,
      context,
    };
    const branchResults: Record<string, boolean> = {};

    const unsupported = (
      step: DurableObjectSqliteFlowStep,
      index: number,
      message: string,
    ) =>
      Effect.gen(function* () {
        summaries.push(flowStepSummary(step, "unsupported", message));
        const run = yield* recordTimeline(
          step,
          index,
          "unsupported",
          step.id,
          "unsupported",
          message,
        );
        return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
      });

    for (let index = 0; index < maxSteps; index++) {
      currentStepId = runState.currentStepId ?? flowDef.startStepId;
      const step = stepsById.get(currentStepId);
      if (step === undefined || step.type === "done") {
        const doneStep = step ?? {
          id: currentStepId || "done",
          type: "done" as const,
        };
        summaries.push(flowStepSummary(doneStep, "completed"));
        const run = yield* recordTimeline(
          doneStep,
          index,
          "completed",
          doneStep.id,
          "completed",
        );
        return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
      }

      const cfg = recordOrEmpty(step.config);
      if (step.type === "unsupported") {
        return yield* unsupported(step, index, "unsupported step");
      }
      if (step.type === "assert" && typeof cfg.a !== "string") {
        return yield* unsupported(step, index, "assert missing string attr");
      }
      if (step.type === "collect" && typeof cfg.form !== "string") {
        return yield* unsupported(step, index, "collect missing string form");
      }
      if (step.type === "wait" && (typeof cfg.id !== "string" || typeof cfg.fireAt !== "number")) {
        return yield* unsupported(step, index, "wait missing id or fireAt");
      }
      const actionName = step.type === "action"
        ? typeof cfg.action === "string"
          ? cfg.action
          : typeof cfg.name === "string"
            ? cfg.name
            : undefined
        : undefined;
      if (step.type === "action" && actionName === undefined) {
        return yield* unsupported(step, index, "action missing registered action name");
      }

      if (step.type === "collect") {
        const rawScope = cfg.scope ??
          (typeof cfg.scopeFrom === "string" ? `$ctx.${cfg.scopeFrom}` : undefined);
        const resolvedScope = rawScope === undefined
          ? undefined
          : resolveFlowValue(rawScope, decoded.subject, context);
        const scope = resolvedScope === undefined || resolvedScope === null
          ? undefined
          : String(resolvedScope);
        if (scope !== undefined && hasCurrentValue(currentEntity, `submitted.${cfg.form}`, scope)) {
          const message = `${cfg.form} already submitted for ${scope}`;
          summaries.push(flowStepSummary(step, "collect-satisfied", message));
          const next = step.next;
          const run = yield* recordTimeline(
            step,
            index,
            next === undefined ? "completed" : "running",
            next ?? step.id,
            "collect-satisfied",
            message,
          );
          if (next === undefined) {
            return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
          }
          runState = { ...runState, status: "running", step: next, currentStepId: next };
          continue;
        }
      }

      const result = stepFlow(flowDef, runState, {
        branchResults,
        runId: decoded.runId,
        stopAfterStep: true,
        valueResolver: (raw, run) =>
          resolveFlowValue(raw, run.subject, recordOrEmpty(run.context)),
      });
      let branchIntent: Extract<StepIntent, { kind: "branch" }> | null = null;
      let branchLog: { stepId: string; message?: string } | null = null;
      let targetAdvanced = false;

      for (const intent of result.intents) {
        if (intent.kind === "assert") {
          const sourceStep = stepsById.get(intent.stepId) ?? step;
          const result = yield* executeDurableObjectSqliteDagStepEffect(
            dag,
            collections,
            flowWaitTimers,
            {
              runId: decoded.runId,
              flowDefName: decoded.flowDefName,
              subject: decoded.subject,
              stepId: intent.stepId,
              kind: "assert",
              eventId: flowEventId(decoded.eventIdPrefix, index, intent.stepId, "asserted"),
              now,
              ...(sourceStep.next === undefined ? {} : { nextStepId: sourceStep.next }),
              context,
              assertions: [
                {
                  a: intent.a,
                  v: intent.v,
                  actor: decoded.actor,
                  ...(decoded.actorType === undefined
                    ? {}
                    : { actorType: decoded.actorType as ActorType }),
                  reason: `flow ${decoded.flowDefName} step ${intent.stepId}`,
                },
              ],
              message: `${intent.a} = ${JSON.stringify(intent.v)}`,
            },
            defaultNow,
            cardinalityOf,
            coord,
          );
          assertions.push(...result.assertions);
          summaries.push(flowStepSummary(sourceStep, "asserted", `${intent.a}`));
          currentEntity = yield* getDurableObjectSqliteCurrentEntityEffect({
            e: decoded.subject,
          });
          if (result.run.status !== "running" || sourceStep.next === undefined) {
            return { run: result.run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
          }
        } else if (intent.kind === "log") {
          const sourceStep = stepsById.get(intent.stepId) ?? step;
          if (intent.event === "notify") {
            summaries.push(flowStepSummary(sourceStep, "notify", intent.message));
            const run = yield* recordTimeline(
              sourceStep,
              index,
              sourceStep.next === undefined ? "completed" : "running",
              sourceStep.next ?? sourceStep.id,
              "notify",
              intent.message,
            );
            if (sourceStep.next === undefined) {
              return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
            }
          } else if (intent.event === "branch") {
            branchLog = { stepId: intent.stepId, message: intent.message };
          }
        } else if (intent.kind === "branch") {
          currentEntity = yield* getDurableObjectSqliteCurrentEntityEffect({
            e: decoded.subject,
          });
          branchResults[intent.stepId] = branchMatchesCurrentEntity(
            currentEntity,
            intent.where,
            intent.subjectVar,
            decoded.subject,
            context,
          );
          branchIntent = intent;
          break;
        } else if (intent.kind === "jump") {
          if (branchLog !== null) {
            const branchStep = stepsById.get(branchLog.stepId) ?? step;
            summaries.push(flowStepSummary(branchStep, "branch", branchLog.message));
            yield* recordTimeline(
              branchStep,
              index,
              "running",
              intent.stepId,
              "branch",
              branchLog.message,
            );
          }
        } else if (intent.kind === "park") {
          if (intent.reason === "collect") {
            const token = typeof cfg.token === "string"
              ? cfg.token
              : typeof cfg.collectionToken === "string"
                ? cfg.collectionToken
                : undefined;
            if (token === undefined) {
              return yield* unsupported(step, index, "collect missing caller-provided token");
            }
            const scope = result.run.scope === "" ? undefined : result.run.scope;
            const stepResult = yield* executeDurableObjectSqliteDagStepEffect(
              dag,
              collections,
              flowWaitTimers,
              {
                runId: decoded.runId,
                flowDefName: decoded.flowDefName,
                subject: decoded.subject,
                stepId: intent.stepId,
                kind: "collect",
                eventId: flowEventId(decoded.eventIdPrefix, index, intent.stepId, "collect-issued"),
                now,
                ...(step.next === undefined ? {} : { nextStepId: step.next }),
                context,
                collection: {
                  token,
                  form: String(cfg.form),
                  ...(cfg.expiresAt === undefined
                    ? {}
                    : { expiresAt: cfg.expiresAt as number | null }),
                  ...(scope === undefined ? {} : { scope }),
                },
                ...(scope === undefined ? {} : { message: `${cfg.form} for ${scope}` }),
              },
              defaultNow,
              cardinalityOf,
              coord,
            );
            if (stepResult.collection !== undefined) collectionsOut.push(stepResult.collection);
            summaries.push(flowStepSummary(step, "collect-issued", String(cfg.form)));
            return { run: stepResult.run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
          }
          if (intent.reason === "wait") {
            const result = yield* executeDurableObjectSqliteDagStepEffect(
              dag,
              collections,
              flowWaitTimers,
              {
                runId: decoded.runId,
                flowDefName: decoded.flowDefName,
                subject: decoded.subject,
                stepId: intent.stepId,
                kind: "wait",
                eventId: flowEventId(decoded.eventIdPrefix, index, intent.stepId, "wait"),
                now,
                ...(step.next === undefined ? {} : { nextStepId: step.next }),
                context,
                wait: {
                  id: String(cfg.id),
                  eventId: typeof cfg.eventId === "string"
                    ? cfg.eventId
                    : flowEventId(decoded.eventIdPrefix, index, intent.stepId, "fired"),
                  fireAt: Number(cfg.fireAt),
                },
                message: `${cfg.fireAt}`,
              },
              defaultNow,
              cardinalityOf,
              coord,
            );
            if (result.waitTick !== undefined) waitTicks.push(result.waitTick);
            summaries.push(flowStepSummary(step, "wait", String(cfg.fireAt)));
            return { run: result.run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
          }
          if (intent.reason === "action") {
            const actionArgs = Object.fromEntries(
              Object.entries(recordOrEmpty(cfg.args)).map(([key, value]) => [
                key,
                resolveFlowValue(value, decoded.subject, context),
              ]),
            );
            const result = yield* executeDurableObjectSqliteRegisteredActionEffect(
              dag,
              collections,
              flowWaitTimers,
              {
                action: actionName!,
                entity: decoded.subject,
                runId: decoded.runId,
                flowDefName: decoded.flowDefName,
                stepId: intent.stepId,
                ...(step.next === undefined ? {} : { nextStepId: step.next }),
                eventId: flowEventId(decoded.eventIdPrefix, index, intent.stepId, "action"),
                actor: decoded.actor,
                ...(decoded.actorType === undefined
                  ? {}
                  : { actorType: decoded.actorType as ActorType }),
                now,
                args: actionArgs,
                ...(typeof cfg.collectionToken === "string"
                  ? { collectionToken: cfg.collectionToken }
                  : {}),
                ...(cfg.collectionExpiresAt === undefined
                  ? {}
                  : { collectionExpiresAt: cfg.collectionExpiresAt as number | null }),
              },
              defaultNow,
              cardinalityOf,
              coord,
            );
            actions.push(result);
            assertions.push(...result.execution.assertions);
            if (result.execution.collection !== undefined) {
              collectionsOut.push(result.execution.collection);
            }
            summaries.push(flowStepSummary(step, "action", actionName!));
            currentEntity = yield* getDurableObjectSqliteCurrentEntityEffect({
              e: decoded.subject,
            });
            if (result.execution.run.status !== "running" || step.next === undefined) {
              return { run: result.execution.run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
            }
            runState = { ...runState, status: "running", step: step.next, currentStepId: step.next };
            targetAdvanced = true;
          }
        } else if (intent.kind === "complete") {
          if (branchLog !== null) {
            const branchStep = stepsById.get(branchLog.stepId) ?? step;
            summaries.push(flowStepSummary(branchStep, "branch", branchLog.message));
            const run = yield* recordTimeline(
              branchStep,
              index,
              "completed",
              intent.stepId,
              "branch",
              branchLog.message,
            );
            return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
          }
          const doneStep = stepsById.get(intent.stepId) ?? {
            id: intent.stepId || "done",
            type: "done" as const,
          };
          summaries.push(flowStepSummary(doneStep, "completed"));
          const run = yield* recordTimeline(
            doneStep,
            index,
            "completed",
            doneStep.id,
            "completed",
          );
          return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
        }
      }

      if (branchIntent !== null) {
        runState = result.run;
        continue;
      }
      if (targetAdvanced) {
        continue;
      }
      if (runState.currentStepId !== result.run.currentStepId || runState.status !== result.run.status) {
        runState = result.run;
      }
      if (runState.status !== "running") {
        const run = yield* recordTimeline(
          step,
          index,
          runState.status as DurableObjectSqliteDagRunStatus,
          runState.currentStepId,
          runState.status,
        );
        return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
      }
    }

    const loopStep = { id: currentStepId, type: "unsupported" as const };
    const message = `flow exceeded ${maxSteps} steps`;
    summaries.push(flowStepSummary(loopStep, "unsupported", message));
    const run = yield* recordTimeline(
      loopStep,
      maxSteps,
      "unsupported",
      currentStepId,
      "unsupported",
      message,
    );
    return { run, steps: summaries, assertions, collections: collectionsOut, waitTicks, actions };
  });
}

export function executeDurableObjectSqliteRegisteredFlowEffect(
  flowDefinitions: DurableObjectSqliteFlowDefinitionStore,
  dag: DurableObjectSqliteDagStore,
  collections: DurableObjectSqliteCollectionStore,
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteExecuteRegisteredFlowArgs,
  defaultNow: number,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteExecuteFlowResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "executeRegisteredFlow",
      DurableObjectSqliteExecuteRegisteredFlowArgsSchema,
      args,
    );
    const flow = yield* getDurableObjectSqliteFlowDefinitionByNameEffect(
      flowDefinitions,
      { name: decoded.name },
    );
    if (flow === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredFlow",
          new Error(`unknown flow definition: ${decoded.name}`),
        ),
      );
    }
    if (flow.status !== "active") {
      return yield* Effect.fail(
        surfaceError(
          "executeRegisteredFlow",
          new Error(`flow definition is ${flow.status}: ${decoded.name}`),
        ),
      );
    }
    return yield* executeDurableObjectSqliteFlowEffect(
      dag,
      collections,
      flowWaitTimers,
      {
        runId: decoded.runId,
        flowDefName: flow.name,
        subject: decoded.subject,
        steps: flow.steps.map((step) => ({
          id: step.id,
          type: step.type as DurableObjectSqliteFlowStep["type"],
          ...(step.next === undefined ? {} : { next: step.next }),
          ...(step.config === undefined ? {} : { config: step.config }),
        })),
        ...(decoded.startStepId === undefined
          ? {}
          : { startStepId: decoded.startStepId }),
        ...(flow.subjectType === undefined
          ? {}
          : { subjectType: flow.subjectType }),
        eventIdPrefix: decoded.eventIdPrefix,
        actor: decoded.actor,
        ...(decoded.actorType === undefined
          ? {}
          : { actorType: decoded.actorType as ActorType }),
        ...(decoded.now === undefined ? {} : { now: decoded.now }),
        ...(decoded.context === undefined ? {} : { context: decoded.context }),
        ...(decoded.maxSteps === undefined ? {} : { maxSteps: decoded.maxSteps }),
      },
      defaultNow,
      cardinalityOf,
      coord,
    );
  });
}

export function scheduleDurableObjectSqliteCollectionTickEffect(
  collections: DurableObjectSqliteCollectionStore,
  timers: DurableObjectSqliteTimerStore,
  args: DurableObjectSqliteScheduleCollectionTickArgs,
  defaultScheduledAt: number,
): Effect.Effect<
  DurableObjectSqliteCollectionTick,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "scheduleCollectionTick",
      DurableObjectSqliteScheduleCollectionTickArgsSchema,
      args,
    );
    const collection = yield* Effect.tryPromise({
      try: () => collections.get(decoded.token),
      catch: (cause) => surfaceError("scheduleCollectionTick", cause),
    });
    if (collection === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "scheduleCollectionTick",
          new Error(`unknown collection token: ${decoded.token}`),
        ),
      );
    }
    return yield* Effect.tryPromise({
      try: () =>
        timers.schedule({
          id: decoded.id,
          token: decoded.token,
          phase: decoded.phase as DurableObjectSqliteCollectionTickPhase,
          fireAt: decoded.fireAt,
          scheduledAt: decoded.scheduledAt ?? defaultScheduledAt,
        }),
      catch: (cause) => surfaceError("scheduleCollectionTick", cause),
    });
  });
}

export function getDurableObjectSqliteCollectionTickByIdEffect(
  timers: DurableObjectSqliteTimerStore,
  args: DurableObjectSqliteCollectionTickByIdArgs,
): Effect.Effect<
  DurableObjectSqliteCollectionTick | undefined,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "collectionTickById",
      DurableObjectSqliteCollectionTickByIdArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () => timers.get(decoded.id),
      catch: (cause) => surfaceError("collectionTickById", cause),
    });
  });
}

export function listDurableObjectSqliteCollectionTicksEffect(
  timers: DurableObjectSqliteTimerStore,
  args: DurableObjectSqliteListCollectionTicksArgs = {},
): Effect.Effect<
  DurableObjectSqliteCollectionTick[],
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listCollectionTicks",
      DurableObjectSqliteListCollectionTicksArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        timers.list({
          token: decoded.token,
          phase: decoded.phase as DurableObjectSqliteCollectionTickPhase | undefined,
          status: decoded.status as
            | DurableObjectSqliteCollectionTickStatus
            | undefined,
          dueAt: decoded.dueAt,
          limit: limit(decoded.limit, 100, 1000),
        }),
      catch: (cause) => surfaceError("listCollectionTicks", cause),
    });
  });
}

export function fireDurableObjectSqliteCollectionTickEffect(
  collections: DurableObjectSqliteCollectionStore,
  timers: DurableObjectSqliteTimerStore,
  args: DurableObjectSqliteFireCollectionTickArgs,
  defaultFiredAt: number,
): Effect.Effect<
  DurableObjectSqliteFireCollectionTickResult,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "fireCollectionTick",
      DurableObjectSqliteFireCollectionTickArgsSchema,
      args,
    );
    const firedAt = decoded.firedAt ?? defaultFiredAt;
    const tick = yield* Effect.tryPromise({
      try: () => timers.get(decoded.id),
      catch: (cause) => surfaceError("fireCollectionTick", cause),
    });
    if (tick === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "fireCollectionTick",
          new Error(`unknown collection tick: ${decoded.id}`),
        ),
      );
    }
    const collection = yield* Effect.tryPromise({
      try: () => collections.get(tick.token),
      catch: (cause) => surfaceError("fireCollectionTick", cause),
    });
    if (tick.status !== "pending") {
      return {
        tick,
        ...(collection === undefined ? {} : { collection }),
      };
    }
    if (collection === undefined) {
      const skipped = yield* Effect.tryPromise({
        try: () => timers.mark(tick.id, "skipped", firedAt, "unknown collection"),
        catch: (cause) => surfaceError("fireCollectionTick", cause),
      });
      return { tick: skipped };
    }
    if (collection.status !== "issued") {
      const skipped = yield* Effect.tryPromise({
        try: () =>
          timers.mark(
            tick.id,
            "skipped",
            firedAt,
            `collection ${collection.status}`,
          ),
        catch: (cause) => surfaceError("fireCollectionTick", cause),
      });
      return { tick: skipped, collection };
    }

    const updatedCollection = yield* Effect.tryPromise({
      try: async () => {
        if (tick.phase === "reminder") {
          return await collections.remind(tick.token, firedAt);
        }
        if (tick.phase === "escalation") {
          return await collections.escalate(tick.token, firedAt);
        }
        return await collections.expire(tick.token, firedAt);
      },
      catch: (cause) => surfaceError("fireCollectionTick", cause),
    });
    const fired = yield* Effect.tryPromise({
      try: () => timers.mark(tick.id, "fired", firedAt),
      catch: (cause) => surfaceError("fireCollectionTick", cause),
    });
    return {
      tick: fired,
      ...(updatedCollection === undefined ? {} : { collection: updatedCollection }),
    };
  });
}

export function scheduleDurableObjectSqliteFlowWaitTickEffect(
  dag: DurableObjectSqliteDagStore,
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteScheduleFlowWaitTickArgs,
  defaultScheduledAt: number,
): Effect.Effect<
  DurableObjectSqliteFlowWaitTick,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "scheduleFlowWaitTick",
      DurableObjectSqliteScheduleFlowWaitTickArgsSchema,
      args,
    );
    const run = yield* Effect.tryPromise({
      try: () => dag.get(decoded.runId),
      catch: (cause) => surfaceError("scheduleFlowWaitTick", cause),
    });
    if (run === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "scheduleFlowWaitTick",
          new Error(`unknown DAG run: ${decoded.runId}`),
        ),
      );
    }
    return yield* Effect.tryPromise({
      try: () =>
        flowWaitTimers.schedule({
          id: decoded.id,
          runId: decoded.runId,
          stepId: decoded.stepId,
          eventId: decoded.eventId,
          fireAt: decoded.fireAt,
          scheduledAt: decoded.scheduledAt ?? defaultScheduledAt,
        }),
      catch: (cause) => surfaceError("scheduleFlowWaitTick", cause),
    });
  });
}

export function getDurableObjectSqliteFlowWaitTickByIdEffect(
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteFlowWaitTickByIdArgs,
): Effect.Effect<
  DurableObjectSqliteFlowWaitTick | undefined,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "flowWaitTickById",
      DurableObjectSqliteFlowWaitTickByIdArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () => flowWaitTimers.get(decoded.id),
      catch: (cause) => surfaceError("flowWaitTickById", cause),
    });
  });
}

export function listDurableObjectSqliteFlowWaitTicksEffect(
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteListFlowWaitTicksArgs = {},
): Effect.Effect<
  DurableObjectSqliteFlowWaitTick[],
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listFlowWaitTicks",
      DurableObjectSqliteListFlowWaitTicksArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        flowWaitTimers.list({
          runId: decoded.runId,
          stepId: decoded.stepId,
          status: decoded.status as DurableObjectSqliteFlowWaitTickStatus | undefined,
          dueAt: decoded.dueAt,
          limit: limit(decoded.limit, 100, 1000),
        }),
      catch: (cause) => surfaceError("listFlowWaitTicks", cause),
    });
  });
}

export function fireDurableObjectSqliteFlowWaitTickEffect(
  dag: DurableObjectSqliteDagStore,
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteFireFlowWaitTickArgs,
  defaultFiredAt: number,
): Effect.Effect<
  DurableObjectSqliteFireFlowWaitTickResult,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "fireFlowWaitTick",
      DurableObjectSqliteFireFlowWaitTickArgsSchema,
      args,
    );
    const firedAt = decoded.firedAt ?? defaultFiredAt;
    const tick = yield* Effect.tryPromise({
      try: () => flowWaitTimers.get(decoded.id),
      catch: (cause) => surfaceError("fireFlowWaitTick", cause),
    });
    if (tick === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "fireFlowWaitTick",
          new Error(`unknown flow wait tick: ${decoded.id}`),
        ),
      );
    }
    const run = yield* Effect.tryPromise({
      try: () => dag.get(tick.runId),
      catch: (cause) => surfaceError("fireFlowWaitTick", cause),
    });
    if (tick.status !== "pending") {
      return {
        tick,
        ...(run === undefined ? {} : { run }),
      };
    }
    if (run === undefined) {
      const skipped = yield* Effect.tryPromise({
        try: () => flowWaitTimers.mark(tick.id, "skipped", firedAt, "unknown DAG run"),
        catch: (cause) => surfaceError("fireFlowWaitTick", cause),
      });
      return { tick: skipped };
    }
    if (run.status !== "waiting") {
      const skipped = yield* Effect.tryPromise({
        try: () =>
          flowWaitTimers.mark(tick.id, "skipped", firedAt, `DAG run ${run.status}`),
        catch: (cause) => surfaceError("fireFlowWaitTick", cause),
      });
      return { tick: skipped, run };
    }
    const fired = yield* Effect.tryPromise({
      try: () => flowWaitTimers.mark(tick.id, "fired", firedAt),
      catch: (cause) => surfaceError("fireFlowWaitTick", cause),
    });
    const updatedRun = yield* Effect.tryPromise({
      try: () =>
        dag.record({
          runId: run.runId,
          flowDefName: run.flowDefName,
          subject: run.subject,
          status: "running",
          currentStepId: tick.stepId,
          context: run.context,
          events: [
            {
              eventId: tick.eventId,
              stepId: tick.stepId,
              type: "timer",
              kind: "flow-wait",
              message: `flow wait timer ${tick.id} fired`,
            },
          ],
          now: firedAt,
        }),
      catch: (cause) => surfaceError("fireFlowWaitTick", cause),
    });
    return { tick: fired, run: updatedRun };
  });
}

function requireDagStepField<A>(
  operation: string,
  value: A | undefined,
  message: string,
): Effect.Effect<A, DurableObjectSqliteCurrentSurfaceError> {
  return value === undefined
    ? Effect.fail(surfaceError(operation, new Error(message)))
    : Effect.succeed(value);
}

function dagStepTimelineEvent(
  decoded: DurableObjectSqliteExecuteDagStepArgs,
  type: string,
  kind: string,
): DurableObjectSqliteDagEventInput {
  return {
    eventId: decoded.eventId,
    stepId: decoded.stepId,
    type,
    kind,
    ...(decoded.message === undefined ? {} : { message: decoded.message }),
  };
}

export function executeDurableObjectSqliteDagStepEffect(
  dag: DurableObjectSqliteDagStore,
  collections: DurableObjectSqliteCollectionStore,
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteExecuteDagStepArgs,
  defaultNow: number,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteExecuteDagStepResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "executeDagStep",
      DurableObjectSqliteExecuteDagStepArgsSchema,
      args,
    );
    const now = decoded.now ?? defaultNow;
    const assertions: DurableObjectSqliteAppendAndRebuildResult[] = [];

    if (decoded.kind === "assert") {
      const stepAssertions = yield* requireDagStepField(
        "executeDagStep",
        decoded.assertions,
        "assert DAG step requires assertions",
      );
      if (stepAssertions.length === 0) {
        return yield* Effect.fail(
          surfaceError(
            "executeDagStep",
            new Error("assert DAG step requires at least one assertion"),
          ),
        );
      }
      for (const assertion of stepAssertions) {
        const event = yield* applyOperationEffect({
          op: "assert",
          e: decoded.subject,
          a: assertion.a,
          v: assertion.v,
          validFrom: assertion.validFrom,
          validTo: assertion.validTo,
          actor: assertion.actor,
          actorType: assertion.actorType as ActorType | undefined,
          causalRefs: assertion.causalRefs,
          reason: assertion.reason,
        });
        const projection = yield* reconcileDurableObjectSqliteCurrentEventEffect(
          event,
          cardinalityOf,
          coord,
        );
        assertions.push({ event, projection });
      }
      const run = yield* Effect.tryPromise({
        try: () =>
          dag.record({
            runId: decoded.runId,
            flowDefName: decoded.flowDefName,
            subject: decoded.subject,
            status: decoded.nextStepId === undefined ? "completed" : "running",
            currentStepId: decoded.nextStepId ?? decoded.stepId,
            context: decoded.context,
            events: [dagStepTimelineEvent(decoded, "action", "asserted")],
            now,
          }),
        catch: (cause) => surfaceError("executeDagStep", cause),
      });
      return { run, assertions };
    }

    if (decoded.kind === "collect") {
      const collectionInput = yield* requireDagStepField(
        "executeDagStep",
        decoded.collection,
        "collect DAG step requires collection input",
      );
      const collection = yield* Effect.tryPromise({
        try: () =>
          collections.issue({
            token: collectionInput.token,
            subject: decoded.subject,
            form: collectionInput.form,
            issuedAt: now,
            expiresAt: collectionInput.expiresAt,
            runId: decoded.runId,
            stepId: decoded.stepId,
            scope: collectionInput.scope,
          }),
        catch: (cause) => surfaceError("executeDagStep", cause),
      });
      const run = yield* Effect.tryPromise({
        try: () =>
          dag.record({
            runId: decoded.runId,
            flowDefName: decoded.flowDefName,
            subject: decoded.subject,
            status: "waiting",
            currentStepId: decoded.stepId,
            context: decoded.context,
            events: [dagStepTimelineEvent(decoded, "collect", "collect-issued")],
            now,
          }),
        catch: (cause) => surfaceError("executeDagStep", cause),
      });
      return { run, assertions, collection };
    }

    if (decoded.kind === "wait") {
      const waitInput = yield* requireDagStepField(
        "executeDagStep",
        decoded.wait,
        "wait DAG step requires wait input",
      );
      const run = yield* Effect.tryPromise({
        try: () =>
          dag.record({
            runId: decoded.runId,
            flowDefName: decoded.flowDefName,
            subject: decoded.subject,
            status: "waiting",
            currentStepId: decoded.stepId,
            context: decoded.context,
            events: [dagStepTimelineEvent(decoded, "timer", "flow-wait-scheduled")],
            now,
          }),
        catch: (cause) => surfaceError("executeDagStep", cause),
      });
      const waitTick = yield* Effect.tryPromise({
        try: () =>
          flowWaitTimers.schedule({
            id: waitInput.id,
            runId: decoded.runId,
            stepId: decoded.stepId,
            eventId: waitInput.eventId,
            fireAt: waitInput.fireAt,
            scheduledAt: now,
          }),
        catch: (cause) => surfaceError("executeDagStep", cause),
      });
      return { run, assertions, waitTick };
    }

    const run = yield* Effect.tryPromise({
      try: () =>
        dag.record({
          runId: decoded.runId,
          flowDefName: decoded.flowDefName,
          subject: decoded.subject,
          status: "unsupported",
          currentStepId: decoded.stepId,
          context: decoded.context,
          events: [dagStepTimelineEvent(decoded, "unsupported", "unsupported")],
          now,
        }),
      catch: (cause) => surfaceError("executeDagStep", cause),
    });
    return { run, assertions };
  });
}

export function executeDurableObjectSqliteActionEffect(
  dag: DurableObjectSqliteDagStore,
  collections: DurableObjectSqliteCollectionStore,
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore,
  args: DurableObjectSqliteExecuteActionArgs,
  defaultNow: number,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteExecuteActionResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "executeAction",
      DurableObjectSqliteExecuteActionArgsSchema,
      args,
    );
    const hasAssertions = decoded.assertions !== undefined;
    const hasCollection = decoded.collection !== undefined;
    if ((hasAssertions ? 1 : 0) + (hasCollection ? 1 : 0) !== 1) {
      return yield* Effect.fail(
        surfaceError(
          "executeAction",
          new Error(
            "executeAction requires exactly one supported action effect: assertions or collection",
          ),
        ),
      );
    }

    const stepResult = yield* executeDurableObjectSqliteDagStepEffect(
      dag,
      collections,
      flowWaitTimers,
      {
        runId: decoded.runId,
        flowDefName: decoded.flowDefName,
        subject: decoded.subject,
        stepId: decoded.stepId ?? decoded.actionName,
        kind: hasAssertions ? "assert" : "collect",
        eventId: decoded.eventId,
        now: decoded.now ?? defaultNow,
        ...(decoded.nextStepId === undefined
          ? {}
          : { nextStepId: decoded.nextStepId }),
        ...(decoded.context === undefined ? {} : { context: decoded.context }),
        ...(decoded.message === undefined ? {} : { message: decoded.message }),
        ...(decoded.assertions === undefined
          ? {}
          : { assertions: decoded.assertions }),
        ...(decoded.collection === undefined
          ? {}
          : { collection: decoded.collection }),
      },
      defaultNow,
      cardinalityOf,
      coord,
    );
    return { actionName: decoded.actionName, ...stepResult };
  });
}

export function recordDurableObjectSqliteDagRunEffect(
  dag: DurableObjectSqliteDagStore,
  args: DurableObjectSqliteRecordDagRunArgs,
  defaultNow: number,
): Effect.Effect<DurableObjectSqliteDagRun, DurableObjectSqliteCurrentSurfaceError> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "recordDagRun",
      DurableObjectSqliteRecordDagRunArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        dag.record({
          runId: decoded.runId,
          flowDefName: decoded.flowDefName,
          subject: decoded.subject,
          status: decoded.status as DurableObjectSqliteDagRunStatus,
          currentStepId: decoded.currentStepId,
          context: decoded.context,
          events: decoded.events,
          now: decoded.now ?? defaultNow,
        }),
      catch: (cause) => surfaceError("recordDagRun", cause),
    });
  });
}

export function getDurableObjectSqliteDagRunEffect(
  dag: DurableObjectSqliteDagStore,
  args: DurableObjectSqliteDagRunByIdArgs,
): Effect.Effect<
  DurableObjectSqliteDagRun | undefined,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "getDagRun",
      DurableObjectSqliteDagRunByIdArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () => dag.get(decoded.runId),
      catch: (cause) => surfaceError("getDagRun", cause),
    });
  });
}

export function listDurableObjectSqliteDagRunsEffect(
  dag: DurableObjectSqliteDagStore,
  args: DurableObjectSqliteListDagRunsArgs = {},
): Effect.Effect<
  DurableObjectSqliteDagRun[],
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listDagRuns",
      DurableObjectSqliteListDagRunsArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        dag.list({
          subject: decoded.subject,
          flowDefName: decoded.flowDefName,
          status: decoded.status as DurableObjectSqliteDagRunStatus | undefined,
          limit: limit(decoded.limit, 20, 100),
        }),
      catch: (cause) => surfaceError("listDagRuns", cause),
    });
  });
}

export function resumeDurableObjectSqliteDagRunEffect(
  dag: DurableObjectSqliteDagStore,
  args: DurableObjectSqliteResumeDagRunArgs,
  defaultNow: number,
): Effect.Effect<DurableObjectSqliteDagRun, DurableObjectSqliteCurrentSurfaceError> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "resumeDagRun",
      DurableObjectSqliteResumeDagRunArgsSchema,
      args,
    );
    const now = decoded.now ?? defaultNow;
    const run = yield* Effect.tryPromise({
      try: () => dag.get(decoded.runId),
      catch: (cause) => surfaceError("resumeDagRun", cause),
    });
    if (run === undefined) {
      return yield* Effect.fail(
        surfaceError(
          "resumeDagRun",
          new Error(`unknown DAG run: ${decoded.runId}`),
        ),
      );
    }
    if (run.status !== "running") {
      return yield* Effect.fail(
        surfaceError(
          "resumeDagRun",
          new Error(`DAG run ${decoded.runId} is ${run.status}, not running`),
        ),
      );
    }
    return yield* Effect.tryPromise({
      try: () =>
        dag.record({
          runId: run.runId,
          flowDefName: run.flowDefName,
          subject: run.subject,
          status: decoded.status as DurableObjectSqliteDagRunStatus,
          currentStepId: decoded.currentStepId ?? run.currentStepId,
          context: decoded.context === undefined ? run.context : decoded.context,
          events: decoded.events,
          now,
        }),
      catch: (cause) => surfaceError("resumeDagRun", cause),
    });
  });
}

export function queryDurableObjectSqliteEffect(
  args: DatalogQueryArgsType,
): Effect.Effect<DatalogQueryResult, RuntimeError, DatalogQueryService> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.query(args);
  });
}

export function pageDurableObjectSqliteEffect(
  args: DatalogQueryPageArgsType,
): Effect.Effect<
  ResultPage<Record<string, unknown>>,
  RuntimeError,
  DatalogQueryService
> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.page(args);
  });
}

export function aggregateDurableObjectSqliteEffect(
  args: DatalogAggregateArgsType,
): Effect.Effect<Record<string, unknown>[], RuntimeError, DatalogQueryService> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.aggregate(args);
  });
}

export function derivedRowsDurableObjectSqliteEffect(
  args: DatalogDerivedRowsArgsType,
): Effect.Effect<DerivedRow[], RuntimeError, DatalogQueryService> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.derivedRows(args);
  });
}

export function queryDurableObjectSqliteCurrentEffect(
  args: DatalogQueryArgsType,
): Effect.Effect<DatalogQueryResult, RuntimeError, DatalogQueryService> {
  return queryDurableObjectSqliteEffect(args);
}

export function pageDurableObjectSqliteCurrentEffect(
  args: DatalogQueryPageArgsType,
): Effect.Effect<
  ResultPage<Record<string, unknown>>,
  RuntimeError,
  DatalogQueryService
> {
  return pageDurableObjectSqliteEffect(args);
}

export function aggregateDurableObjectSqliteCurrentEffect(
  args: DatalogAggregateArgsType,
): Effect.Effect<Record<string, unknown>[], RuntimeError, DatalogQueryService> {
  return aggregateDurableObjectSqliteEffect(args);
}

export function derivedRowsDurableObjectSqliteCurrentEffect(
  args: DatalogDerivedRowsArgsType,
): Effect.Effect<DerivedRow[], RuntimeError, DatalogQueryService> {
  return derivedRowsDurableObjectSqliteEffect(args);
}

export function listDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteCurrentFilter = {},
): Effect.Effect<
  ProjectionRow[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listCurrent",
      DurableObjectSqliteCurrentFilterSchema,
      args,
    );
    const projection = yield* ProjectionStoreService;
    const rows = yield* projection.scan({
      ...(decoded.e === undefined ? {} : { e: decoded.e }),
      ...(decoded.a === undefined ? {} : { a: decoded.a }),
    });
    return sortRows(rows).slice(0, limit(decoded.limit, 50, 500));
  });
}

export function getDurableObjectSqliteCurrentEntityEffect(
  args: DurableObjectSqliteCurrentEntityArgs,
): Effect.Effect<
  DurableObjectSqliteCurrentEntity | null,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "getCurrentEntity",
      DurableObjectSqliteCurrentEntityArgsSchema,
      args,
    );
    const rows = yield* listDurableObjectSqliteCurrentEffect({
      e: decoded.e,
      limit: limit(decoded.limit, 200, 500),
    });
    return entityFromRows(decoded.e, rows);
  });
}

export function listDurableObjectSqliteCurrentEntitiesEffect(
  args: DurableObjectSqliteCurrentEntitiesArgs = {},
): Effect.Effect<
  DurableObjectSqliteCurrentEntityListItem[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listCurrentEntities",
      DurableObjectSqliteCurrentEntitiesArgsSchema,
      args,
    );
    const projection = yield* ProjectionStoreService;
    const typeRows = yield* projection.scan({ a: "type" });
    const entityIds = [
      ...new Set(
        typeRows
          .filter(
            (row) =>
              decoded.type === undefined ||
              (typeof row.v === "string" && row.v === decoded.type),
          )
          .sort((a, b) => a.e.localeCompare(b.e))
          .map((row) => row.e),
      ),
    ].slice(0, limit(decoded.limit, 50, 200));

    const out: DurableObjectSqliteCurrentEntityListItem[] = [];
    for (const e of entityIds) {
      const rows = yield* projection.scan({ e });
      out.push(listItemFromRows(e, rows));
    }
    return out.sort((a, b) => a.e.localeCompare(b.e));
  });
}

function assertOperationFromArgs(
  args: DurableObjectSqliteAppendAssertArgs,
): Operation {
  return {
    op: "assert",
    e: args.e,
    a: args.a,
    v: args.v,
    validFrom: args.validFrom,
    validTo: args.validTo,
    actor: args.actor,
    actorType: args.actorType as ActorType | undefined,
    causalRefs: args.causalRefs,
    reason: args.reason,
  };
}

function lifecycleOperationFromArgs(
  args: DurableObjectSqliteAppendLifecycleArgs,
): Operation {
  return {
    op: args.kind,
    target: args.target,
    actor: args.actor,
    actorType: args.actorType as ActorType | undefined,
    causalRefs: args.causalRefs,
    reason: args.reason,
  };
}

export function appendAssertAndRebuildDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteAppendAssertArgs,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteAppendAndRebuildResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "appendAssert",
      DurableObjectSqliteAppendAssertArgsSchema,
      args,
    );
    const event = yield* applyOperationEffect(assertOperationFromArgs(decoded));
    const projection = yield* reconcileDurableObjectSqliteCurrentEventEffect(
      event,
      cardinalityOf,
      coord,
    );
    return { event, projection };
  });
}

export function appendLifecycleAndRebuildDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteAppendLifecycleArgs,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteAppendAndRebuildResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "appendLifecycle",
      DurableObjectSqliteAppendLifecycleArgsSchema,
      args,
    );
    const event = yield* applyOperationEffect(lifecycleOperationFromArgs(decoded));
    const projection = yield* reconcileDurableObjectSqliteCurrentEventEffect(
      event,
      cardinalityOf,
      coord,
    );
    return { event, projection };
  });
}

function runtimeLayer(runtime: DurableObjectSqliteRuntime) {
  const services = runtimeServicesLayer({
    profile: runtime.profile,
    store: runtime.store,
    projection: runtime.projection,
    clock: runtime.clock,
    sequencer: runtime.sequencer,
    scheduler: runtime.scheduler,
    transport: runtime.transport,
  });
  return Layer.provideMerge(services)(
    Layer.effect(
      DatalogQueryService,
      Effect.map(
        EventStoreService,
        durableObjectSqliteIndexedHistoricalDatalogQueryService,
      ),
    ),
  );
}

function currentQueryRuntimeLayer(runtime: DurableObjectSqliteRuntime) {
  const services = runtimeServicesLayer({
    profile: runtime.profile,
    store: runtime.store,
    projection: runtime.projection,
    clock: runtime.clock,
    sequencer: runtime.sequencer,
    scheduler: runtime.scheduler,
    transport: runtime.transport,
  });
  return Layer.provideMerge(services)(projectionDatalogQueryLayer());
}

export function createDurableObjectSqliteCurrentSurface(
  runtime: DurableObjectSqliteRuntime,
  options: DurableObjectSqliteCurrentSurfaceOptions,
): DurableObjectSqliteCurrentSurface {
  const coord = () => options.currentCoord?.() ?? {
    txTime: runtime.clock.current().pt,
    validTime: runtime.clock.current().pt,
  };
  const run = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(
      Effect.provide(effect, runtimeLayer(runtime)) as Effect.Effect<A, E, never>,
    );
  const runCurrentQuery = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(
      Effect.provide(effect, currentQueryRuntimeLayer(runtime)) as Effect.Effect<
        A,
        E,
        never
      >,
    );
  const runCollection = <A, E>(effect: Effect.Effect<A, E, never>) =>
    Effect.runPromise(effect);
  return {
    appendAssert: (args) =>
      run(
        appendAssertAndRebuildDurableObjectSqliteCurrentEffect(
          args,
          options.cardinalityOf,
          coord(),
        ),
      ),
    appendLifecycle: (args) =>
      run(
        appendLifecycleAndRebuildDurableObjectSqliteCurrentEffect(
          args,
          options.cardinalityOf,
          coord(),
        ),
      ),
    getEvent: (args) => run(getDurableObjectSqliteEventEffect(args)),
    listEvents: (args = {}) => run(listDurableObjectSqliteEventsEffect(args)),
    query: (args) => run(queryDurableObjectSqliteEffect(args)),
    page: (args) => run(pageDurableObjectSqliteEffect(args)),
    aggregate: (args) => run(aggregateDurableObjectSqliteEffect(args)),
    derivedRows: (args) => run(derivedRowsDurableObjectSqliteEffect(args)),
    queryCurrent: (args) =>
      runCurrentQuery(queryDurableObjectSqliteCurrentEffect(args)),
    pageCurrent: (args) =>
      runCurrentQuery(pageDurableObjectSqliteCurrentEffect(args)),
    aggregateCurrent: (args) =>
      runCurrentQuery(aggregateDurableObjectSqliteCurrentEffect(args)),
    derivedRowsCurrent: (args) =>
      runCurrentQuery(derivedRowsDurableObjectSqliteCurrentEffect(args)),
    rebuildCurrent: (args) =>
      run(
        rebuildDurableObjectSqliteCurrentEffect(
          args ?? { coord: coord() },
          options.cardinalityOf,
        ),
      ),
    issueCollection: (args) =>
      runCollection(
        issueDurableObjectSqliteCollectionEffect(
          runtime.collections,
          args,
          coord().txTime,
        ),
      ),
    collectionByToken: (args) =>
      runCollection(
        getDurableObjectSqliteCollectionByTokenEffect(runtime.collections, args),
      ),
    listCollections: (args = {}) =>
      runCollection(
        listDurableObjectSqliteCollectionsEffect(runtime.collections, args),
      ),
    submitCollection: (args) =>
      run(
        submitAndLowerDurableObjectSqliteCollectionEffect(
          runtime.collections,
          args,
          coord().txTime,
          options.cardinalityOf,
          coord(),
        ),
      ),
    actionByName: (args) =>
      run(getDurableObjectSqliteActionByNameEffect(args)),
    listActions: (args = {}) =>
      run(listDurableObjectSqliteActionsEffect(args)),
    actionsForType: (args) =>
      run(listDurableObjectSqliteActionsForTypeEffect(args)),
    upsertFlowDefinition: (args) =>
      runCollection(
        upsertDurableObjectSqliteFlowDefinitionEffect(
          runtime.flowDefinitions,
          args,
          coord().txTime,
        ),
      ),
    flowDefinitionByName: (args) =>
      runCollection(
        getDurableObjectSqliteFlowDefinitionByNameEffect(
          runtime.flowDefinitions,
          args,
        ),
      ),
    listFlowDefinitions: (args = {}) =>
      runCollection(
        listDurableObjectSqliteFlowDefinitionsEffect(
          runtime.flowDefinitions,
          args,
        ),
      ),
    scheduleCollectionTick: (args) =>
      runCollection(
        scheduleDurableObjectSqliteCollectionTickEffect(
          runtime.collections,
          runtime.timers,
          args,
          coord().txTime,
        ),
      ),
    collectionTickById: (args) =>
      runCollection(
        getDurableObjectSqliteCollectionTickByIdEffect(runtime.timers, args),
      ),
    listCollectionTicks: (args = {}) =>
      runCollection(
        listDurableObjectSqliteCollectionTicksEffect(runtime.timers, args),
      ),
    fireCollectionTick: (args) =>
      runCollection(
        fireDurableObjectSqliteCollectionTickEffect(
          runtime.collections,
          runtime.timers,
          args,
          coord().txTime,
        ),
      ),
    scheduleFlowWaitTick: (args) =>
      runCollection(
        scheduleDurableObjectSqliteFlowWaitTickEffect(
          runtime.dag,
          runtime.flowWaitTimers,
          args,
          coord().txTime,
        ),
      ),
    flowWaitTickById: (args) =>
      runCollection(
        getDurableObjectSqliteFlowWaitTickByIdEffect(
          runtime.flowWaitTimers,
          args,
        ),
      ),
    listFlowWaitTicks: (args = {}) =>
      runCollection(
        listDurableObjectSqliteFlowWaitTicksEffect(
          runtime.flowWaitTimers,
          args,
        ),
      ),
    fireFlowWaitTick: (args) =>
      runCollection(
        fireDurableObjectSqliteFlowWaitTickEffect(
          runtime.dag,
          runtime.flowWaitTimers,
          args,
          coord().txTime,
        ),
      ),
    executeDagStep: (args) =>
      run(
        executeDurableObjectSqliteDagStepEffect(
          runtime.dag,
          runtime.collections,
          runtime.flowWaitTimers,
          args,
          coord().txTime,
          options.cardinalityOf,
          coord(),
        ),
      ),
    executeAction: (args) =>
      run(
        executeDurableObjectSqliteActionEffect(
          runtime.dag,
          runtime.collections,
          runtime.flowWaitTimers,
          args,
          coord().txTime,
          options.cardinalityOf,
          coord(),
        ),
      ),
    executeFlow: (args) =>
      run(
        executeDurableObjectSqliteFlowEffect(
          runtime.dag,
          runtime.collections,
          runtime.flowWaitTimers,
          args,
          coord().txTime,
          options.cardinalityOf,
          coord(),
        ),
      ),
    executeRegisteredFlow: (args) =>
      run(
        executeDurableObjectSqliteRegisteredFlowEffect(
          runtime.flowDefinitions,
          runtime.dag,
          runtime.collections,
          runtime.flowWaitTimers,
          args,
          coord().txTime,
          options.cardinalityOf,
          coord(),
        ),
      ),
    executeRegisteredAction: (args) =>
      run(
        executeDurableObjectSqliteRegisteredActionEffect(
          runtime.dag,
          runtime.collections,
          runtime.flowWaitTimers,
          args,
          coord().txTime,
          options.cardinalityOf,
          coord(),
        ),
      ),
    recordDagRun: (args) =>
      runCollection(
        recordDurableObjectSqliteDagRunEffect(runtime.dag, args, coord().txTime),
      ),
    getDagRun: (args) =>
      runCollection(getDurableObjectSqliteDagRunEffect(runtime.dag, args)),
    listDagRuns: (args = {}) =>
      runCollection(listDurableObjectSqliteDagRunsEffect(runtime.dag, args)),
    resumeDagRun: (args) =>
      runCollection(
        resumeDurableObjectSqliteDagRunEffect(runtime.dag, args, coord().txTime),
      ),
    listCurrent: (args = {}) => run(listDurableObjectSqliteCurrentEffect(args)),
    getCurrentEntity: (args) =>
      run(getDurableObjectSqliteCurrentEntityEffect(args)),
    listCurrentEntities: (args = {}) =>
      run(listDurableObjectSqliteCurrentEntitiesEffect(args)),
  };
}
