import { Data, Effect, Schema } from "effect";
import {
  EntityId, type ReadError, type TransactOp, type Triple, type TriplesService,
} from "@bjacobso/triplex";
import { ContentId } from "@bjacobso/triplex/content";
import * as Derivation from "@bjacobso/triplex/derivation";
import { ConsumerCheckpoint } from "@bjacobso/triplex/operational";

/** Application vocabulary, deliberately outside Triplex's reserved namespace. */
export const Coordination = {
  requirementType: "metacrdt.requirement",
  headType: "metacrdt.coordinator",
  consumer: ":metacrdt/consumer",
  requirement: ":metacrdt/requirement",
  status: ":metacrdt/requirement-status",
  candidate: ":metacrdt/requirement-candidate",
  head: ":metacrdt/coordinator-head",
} as const;

const Natural = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const Time = Schema.Number.check(Schema.isFinite());

export const RequirementSchema = Schema.Struct({
  id: Schema.String,
  consumer: Schema.String,
  candidateId: Schema.String,
  occurrence: Natural,
  status: Schema.Literals(["open", "resolved"]),
  revision: Schema.String,
  definitionId: Schema.String,
  configSnapshot: Schema.String,
  materializationRun: Schema.String,
  sourcePosition: Natural,
  openedAt: Time,
  updatedAt: Time,
  resolvedAt: Schema.NullOr(Time),
});
export type Requirement = typeof RequirementSchema.Type;

export const CoordinatorStateSchema = Schema.Struct({
  consumer: Schema.String,
  definitionId: Schema.String,
  configSnapshot: Schema.String,
  runId: Schema.String,
  sourcePosition: Natural,
  validAt: Time,
  nextWakeupAt: Schema.NullOr(Time),
});
export type CoordinatorState = typeof CoordinatorStateSchema.Type;

export class CoordinationError extends Data.TaggedError("CoordinationError")<{
  readonly message: string;
}> {}

export interface CoordinatorOptions {
  /** Stable within an already authorized Triplex database. Pins one definition/release. */
  readonly consumer: string;
  readonly definition: Derivation.Definition;
  readonly actor?: string;
  /** This first implementation reconciles a bounded population in one transaction. */
  readonly maxOccurrences?: number;
}

export type CoordinatorReadError = CoordinationError | ReadError | Schema.SchemaError;
export type CoordinatorError = CoordinatorReadError |
  Derivation.Materialization.MaterializationError | ConsumerCheckpoint.ConsumerCheckpointError;

export interface Coordinator {
  readonly poll: (validAt: number) => Effect.Effect<CoordinatorState, CoordinatorError>;
  readonly reconcileNow: (validAt: number) => Effect.Effect<CoordinatorState, CoordinatorError>;
  readonly state: () => Effect.Effect<CoordinatorState | null, CoordinatorReadError>;
  readonly requirements: () => Effect.Effect<readonly Requirement[], CoordinatorReadError>;
}

const key = (parts: readonly string[]) =>
  ContentId.hash("metacrdt/coordination/v1", JSON.stringify(parts));

const assert = (entityId: string, entityType: string, attribute: string, value: unknown): TransactOp => ({
  op: "assert", entityId: EntityId.make(entityId), entityType, attribute,
  value: { type: "json", value },
  // These are operational records. Their business-time instants are explicit fields;
  // Triplex's recorded history retains every revision of the record.
  validFrom: 0,
});

const textFact = (entityId: string, entityType: string, attribute: string, value: string): TransactOp => ({
  op: "assert", entityId: EntityId.make(entityId), entityType, attribute,
  value: { type: "string", value }, validFrom: 0,
});

/**
 * No scheduler or database is created here. Hosts supply a scoped Triples service
 * and call poll on feed wakeups, at nextWakeupAt, and on worker restart.
 */
export function createCoordinator(triples: TriplesService, options: CoordinatorOptions): Coordinator {
  const { consumer, definition } = options;
  const actor = options.actor ?? "metacrdt/coordinator";
  const headId = EntityId.make(`metacrdt:coordinator:${key([consumer])}`);
  const checkpointName = `metacrdt:${consumer}`;
  const maxOccurrences = options.maxOccurrences ?? 1_000;

  const readHead = () => Effect.gen(function* () {
    const rows = yield* triples.match({ entityId: headId, attribute: Coordination.head });
    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (rows.length !== 1 || row.value.type !== "json") {
      return yield* new CoordinationError({ message: `Invalid coordinator head for ${consumer}` });
    }
    const state = yield* Schema.decodeUnknownEffect(CoordinatorStateSchema)(row.value.value);
    if (state.consumer !== consumer) {
      return yield* new CoordinationError({ message: "Coordinator identity does not match its stored head" });
    }
    return { row, state };
  });

  const loadRequirements = () => Effect.gen(function* () {
    const owners = yield* triples.match({
      entityType: Coordination.requirementType, attribute: Coordination.consumer,
      value: { type: "string", value: consumer },
    });
    const ids = [...new Set(owners.map((row) => row.entityId))];
    if (ids.length > maxOccurrences) {
      return yield* new CoordinationError({ message: `Requirement population exceeds ${maxOccurrences}` });
    }
    const entities = yield* triples.entities(ids);
    const records: { requirement: Requirement; rows: readonly Triple[] }[] = [];
    for (const [index, rows] of entities.entries()) {
      const bodies = rows.filter((row) => row.attribute === Coordination.requirement);
      const body = bodies[0];
      if (bodies.length !== 1 || body?.value.type !== "json") {
        return yield* new CoordinationError({ message: `Invalid requirement body for ${ids[index]}` });
      }
      const requirement = yield* Schema.decodeUnknownEffect(RequirementSchema)(body.value.value);
      const statuses = rows.filter((row) => row.attribute === Coordination.status);
      const candidates = rows.filter((row) => row.attribute === Coordination.candidate);
      if (requirement.id !== ids[index] || requirement.consumer !== consumer ||
          statuses.length !== 1 || statuses[0]?.value.type !== "string" ||
          statuses[0].value.value !== requirement.status || candidates.length !== 1 ||
          candidates[0]?.value.type !== "string" || candidates[0].value.value !== requirement.candidateId) {
        return yield* new CoordinationError({ message: `Inconsistent requirement ${ids[index]}` });
      }
      records.push({ requirement, rows });
    }
    return records;
  });

  const validate = (validAt: number, state: CoordinatorState | null) => Effect.gen(function* () {
    if (!consumer || consumer.length > 512 || !Number.isFinite(validAt) || validAt < 0 ||
        !Number.isSafeInteger(maxOccurrences) || maxOccurrences < 1) {
      return yield* new CoordinationError({ message: "Invalid consumer, business time, or population limit" });
    }
    if (definition.dependencies.hasDynamicAttributes ||
        definition.dependencies.attributes.some((attribute) => attribute.startsWith(":metacrdt/"))) {
      return yield* new CoordinationError({ message: "Coordination requires fixed source attributes outside :metacrdt/" });
    }
    if (state && (state.definitionId !== definition.id || state.configSnapshot !== definition.configSnapshot)) {
      return yield* new CoordinationError({ message: "This consumer is pinned to another definition/release; migrate its work explicitly" });
    }
    if (state && validAt < state.validAt) {
      return yield* new CoordinationError({ message: "Historical evaluation cannot mutate current work; use a Triplex overlay" });
    }
  });

  const reconcileNow = (validAt: number) => Effect.gen(function* () {
    // Read the fence BEFORE evaluation. A concurrent reconciliation invalidates
    // this observation, including when its source position happens to be equal.
    const head = yield* readHead();
    yield* validate(validAt, head?.state ?? null);
    const run = yield* Derivation.Materialization.materialize(triples, definition, { basis: { validAt } });
    if (head?.state.runId === run.id) return head.state;
    if (head && run.sourcePosition < head.state.sourcePosition) {
      return yield* new CoordinationError({ message: "A stale materialization cannot replace current work" });
    }
    const records = yield* loadRequirements();
    const desired = new Map(run.candidates.map((candidate) => [candidate.id as string, candidate]));
    const open = new Map<string, typeof records[number]>();
    for (const record of records) {
      if (record.requirement.status !== "open") continue;
      if (open.has(record.requirement.candidateId)) {
        return yield* new CoordinationError({ message: "Multiple open occurrences for one candidate" });
      }
      open.set(record.requirement.candidateId, record);
    }
    const operations: TransactOp[] = [];
    const replace = (requirement: Requirement, previous?: typeof records[number]) => {
      if (previous) {
        for (const row of previous.rows) {
          if (row.attribute === Coordination.requirement || row.attribute === Coordination.status) {
            operations.push({ op: "retract", id: row.id });
          }
        }
      } else {
        operations.push(
          textFact(requirement.id, Coordination.requirementType, Coordination.consumer, consumer),
          textFact(requirement.id, Coordination.requirementType, Coordination.candidate, requirement.candidateId),
        );
      }
      operations.push(
        assert(requirement.id, Coordination.requirementType, Coordination.requirement, requirement),
        textFact(requirement.id, Coordination.requirementType, Coordination.status, requirement.status),
      );
    };
    let population = records.length;
    for (const candidate of run.candidates) {
      const previous = open.get(candidate.id);
      if (previous?.requirement.revision === candidate.revision) continue;
      const occurrence = previous?.requirement.occurrence ??
        Math.max(0, ...records.filter((record) => record.requirement.candidateId === candidate.id)
          .map((record) => record.requirement.occurrence)) + 1;
      if (!previous && ++population > maxOccurrences) {
        return yield* new CoordinationError({ message: `Requirement population exceeds ${maxOccurrences}` });
      }
      replace({
        id: previous?.requirement.id ?? `metacrdt:requirement:${key([consumer, candidate.id, String(occurrence)])}`,
        consumer, candidateId: candidate.id, occurrence, status: "open",
        revision: candidate.revision, definitionId: definition.id,
        configSnapshot: definition.configSnapshot, materializationRun: run.id,
        sourcePosition: run.sourcePosition, openedAt: previous?.requirement.openedAt ?? validAt,
        updatedAt: validAt, resolvedAt: null,
      }, previous);
    }
    for (const [candidateId, previous] of open) {
      if (desired.has(candidateId)) continue;
      replace({
        ...previous.requirement, status: "resolved", resolvedAt: validAt,
        updatedAt: validAt, materializationRun: run.id, sourcePosition: run.sourcePosition,
      }, previous);
    }
    const state: CoordinatorState = {
      consumer, definitionId: definition.id, configSnapshot: definition.configSnapshot,
      runId: run.id, sourcePosition: run.sourcePosition, validAt,
      nextWakeupAt: run.nextTemporalBoundary ?? null,
    };
    if (head) operations.push({ op: "retract", id: head.row.id });
    operations.push(assert(headId, Coordination.headType, Coordination.head, state));
    // First writer wins through the atomically unique initialization receipt;
    // later writers compare-and-retract the observed head. Requirements and
    // the durable wakeup commit or roll back together. Retry conflicts via poll.
    yield* triples.transact(operations, {
      actor, configSnapshot: definition.configSnapshot, correlationId: run.id,
      commandId: `metacrdt:reconcile:${key([consumer, head?.row.id ?? "init", ...(head ? [run.id] : [])])}`,
      ...(head ? { preconditions: [{ _tag: "TripleLive" as const, id: head.row.id }] } : {}),
    });
    return state;
  });

  const poll = (validAt: number) => Effect.gen(function* () {
    const head = yield* readHead();
    yield* validate(validAt, head?.state ?? null);
    const checkpoint = yield* ConsumerCheckpoint.get(triples, checkpointName);
    const start = checkpoint?.position ?? 0;
    // Bound the drain so continuous source traffic cannot starve reconciliation.
    const until = yield* triples.currentPosition();
    let after = start;
    let relevant = false;
    while (after < until) {
      const page = yield* triples.transactions({ after, limit: 100 });
      const transactions = page.transactions.filter((transaction) => transaction.position <= until);
      if (transactions.length === 0) break;
      relevant ||= transactions.some((transaction) => transaction.changes.some((change) =>
        definition.dependencies.attributes.includes(change.attribute)));
      after = transactions[transactions.length - 1]!.position;
    }
    const due = head?.state.nextWakeupAt != null && head.state.nextWakeupAt <= validAt;
    const state = !head || relevant || due ? yield* reconcileNow(validAt) : head.state;
    // A crash here only causes replay: reconciliation compares the full desired
    // set, never the last materialization diff, and the wakeup is already durable.
    if (after > start) {
      yield* ConsumerCheckpoint.advance(triples, {
        consumer: checkpointName, expectedPosition: start, nextPosition: after, meta: { actor },
      });
    }
    return state;
  });

  return {
    poll, reconcileNow,
    state: () => readHead().pipe(Effect.map((head) => head?.state ?? null)),
    requirements: () => loadRequirements().pipe(Effect.map((records) => records.map((record) => record.requirement))),
  };
}
