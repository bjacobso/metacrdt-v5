// @metacrdt/core — the pure, deterministic convergence kernel (SPEC §4–5).
//
// No I/O, no ambient clocks, no randomness: every function is a pure fold or
// transform, identical on every V8 target. This is the module every runtime
// embeds so that all replicas agree (SPEC §5; specs/reference/architecture.md).

export { sha256 } from "./sha256.js";
export { base32 } from "./base32.js";
export {
  type Value,
  canonicalString,
  canonicalBytes,
  utf8,
} from "./value.js";
export {
  type Hlc,
  compareHlc,
  tick,
  receive,
  initialClock,
} from "./hlc.js";
export {
  type Event,
  type EventId,
  type EventKind,
  type EventBody,
  type ActorType,
  type AssertInput,
  type TargetInput,
  eventId,
  seal,
  verifyId,
  assert,
  retract,
  tombstone,
  untombstone,
} from "./event.js";
export { precedes, compareEvents, maxByOrder } from "./order.js";
export {
  type Log,
  emptyLog,
  fromEvents,
  add,
  merge,
  events,
  has,
} from "./log.js";
export {
  type Coord,
  type Flags,
  type CardinalityOf,
  visible,
  visibleAsserts,
  value,
  valueOf,
  entity,
} from "./fold.js";
