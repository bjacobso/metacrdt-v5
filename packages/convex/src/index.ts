export {
  CONVEX_REPLICA_ID,
  convexActorType,
  asCoreValue,
  type ConvexActorType,
  type ConvexTransactionRow,
  type ProtocolEventPatch,
  type FactProjectionRow,
  type ProtocolFactEventKind,
  type ProtocolFactEventRow,
  type ProtocolEventSummary,
  type BitemporalCoord,
  type VisibilityOpts,
} from "./types";
export {
  hlcFromTransaction,
  eventPatch,
  assertEvent,
  retractEvent,
  tombstoneEvent,
  untombstoneEvent,
  protocolEventFromRows,
  summarizeProtocolEvent,
} from "./events";
export {
  foldEventsForFactProjection,
  isFactVisible,
  valueKey,
} from "./visibility";
export {
  CARDINALITY_ONE_SUPERSESSION_REASON,
  reconcileCardinalityOneCandidates,
  type CardinalityOneReconcileResult,
  type ReconcileCandidate,
} from "./reconcile";
export {
  buildAssertFactEvent,
  buildLifecycleFactEvent,
  createProtocolFactEventWriter,
  summarizeProtocolEventRows,
  type AppendedProtocolFactEvent,
  type AppendAssertArgs,
  type AppendLifecycleArgs,
  type BuiltProtocolFactEvent,
  type ProtocolFactEventInsert,
  type ProtocolFactEventInserter,
  type ProtocolFactEventWriter,
  type ProtocolLifecycleKind,
} from "./functions";
export { hlcValidator, protocolMetadataValidators } from "./validators";
export { confectSidecarWarning, type ManualConfectMountDecision } from "./confect";
