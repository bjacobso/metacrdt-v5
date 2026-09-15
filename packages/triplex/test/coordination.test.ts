import { describe, expect, test } from "vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { EntityId, Triples, WriteError, type TriplesService } from "@bjacobso/triplex";
import { ConfigStore } from "@bjacobso/triplex/config";
import * as Derivation from "@bjacobso/triplex/derivation";
import { ConsumerCheckpoint } from "@bjacobso/triplex/operational";
import { Coordination, createCoordinator, previewSubmission } from "../src/index.js";
import { consumer, day, fixture, layer, site, worker } from "./fixture.js";

const run = <A, E>(program: Effect.Effect<A, E, Triples | ConfigStore.ConfigStore>) =>
  Effect.runPromise(program.pipe(Effect.provide(layer)));

describe("Triplex coordination", () => {
  test("opens, previews, resolves and reopens after expiry on a restarted worker", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    yield* f.coordinator.poll(day);
    const initial = yield* f.coordinator.requirements();
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ status: "open", occurrence: 1, configSnapshot: f.release.snapshot.id });

    const beforePreview = yield* f.triples.currentPosition();
    const preview = yield* previewSubmission(f.triples, f.definition, f.release.snapshot, "safety", {
      id: "preview", subject: worker, scope: site, validAt: day * 2, values: { certificate: "CERT-123" },
    });
    expect(preview.candidates).toHaveLength(0);
    expect(preview.nextTemporalBoundary).toBe(day * 3);
    expect(yield* f.triples.currentPosition()).toBe(beforePreview);
    expect((yield* f.coordinator.requirements())[0]?.status).toBe("open");

    yield* f.submit();
    const resolved = yield* f.coordinator.poll(day * 2);
    expect(resolved.nextWakeupAt).toBe(day * 3);
    expect((yield* f.coordinator.requirements())[0]).toMatchObject({ status: "resolved", resolvedAt: day * 2 });

    const restarted = createCoordinator(f.triples, { consumer, definition: f.definition });
    yield* restarted.poll(day * 3 - 1);
    const position = yield* f.triples.currentPosition();
    yield* restarted.poll(day * 3);
    const occurrences = [...yield* restarted.requirements()].sort((a, b) => a.occurrence - b.occurrence);
    expect(occurrences.map((r) => [r.occurrence, r.status])).toEqual([[1, "resolved"], [2, "open"]]);
    expect(occurrences[0]?.id).toBe(initial[0]?.id);
    expect(occurrences[0]?.candidateId).toBe(occurrences[1]?.candidateId);
    expect((yield* restarted.state())?.nextWakeupAt).toBeNull();
    const writes = yield* f.triples.transactions({ after: position });
    expect(writes.transactions.every((tx) => tx.actor === "triplex/derivation-materializer" || tx.actor === "metacrdt/coordinator")).toBe(true);
    const work = yield* f.triples.query({
      find: ["?requirement", "?status"],
      where: [["?requirement", Coordination.status, "?status"]],
    });
    expect(work.results).toHaveLength(2);
  })));

  test("recovers an opening after materialization committed but reconciliation failed", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    const broken: TriplesService = {
      ...f.triples,
      transact: (operations, meta) => meta?.actor === "metacrdt/coordinator"
        ? Effect.fail(new WriteError({ message: "injected before coordination commit" }))
        : f.triples.transact(operations, meta),
    };
    expect(Exit.isFailure(yield* Effect.exit(createCoordinator(broken, { consumer, definition: f.definition }).poll(day)))).toBe(true);
    expect((yield* f.coordinator.requirements())).toHaveLength(0);
    expect(yield* f.coordinator.state()).toBeNull();
    expect(yield* ConsumerCheckpoint.get(f.triples, `metacrdt:${consumer}`)).toBeNull();
    // Retrying materialization now reports unchanged candidates. Work must still open.
    yield* f.coordinator.poll(day);
    expect((yield* f.coordinator.requirements())).toHaveLength(1);
  })));

  test("recovers a removal after materialization and preserves its durable timer", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    yield* f.coordinator.poll(day);
    yield* f.submit();
    const broken: TriplesService = {
      ...f.triples,
      transact: (operations, meta) => meta?.actor === "metacrdt/coordinator"
        ? Effect.fail(new WriteError({ message: "injected removal failure" }))
        : f.triples.transact(operations, meta),
    };
    yield* Effect.exit(createCoordinator(broken, { consumer, definition: f.definition }).poll(day * 2));
    expect((yield* f.coordinator.requirements())[0]?.status).toBe("open");
    expect((yield* f.coordinator.state())?.nextWakeupAt).toBeNull();
    yield* f.coordinator.poll(day * 2);
    expect((yield* f.coordinator.requirements())[0]?.status).toBe("resolved");
    expect((yield* f.coordinator.state())?.nextWakeupAt).toBe(day * 3);
  })));

  test("lost acknowledgement and repeated delivery do not duplicate work", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    const lostAck: TriplesService = {
      ...f.triples,
      transact: (operations, meta) => f.triples.transact(operations, meta).pipe(Effect.flatMap((receipt) =>
        meta?.actor === "metacrdt/coordinator"
          ? Effect.fail(new WriteError({ message: "injected lost acknowledgement" }))
          : Effect.succeed(receipt))),
    };
    yield* Effect.exit(createCoordinator(lostAck, { consumer, definition: f.definition }).poll(day));
    yield* f.coordinator.poll(day);
    const after = yield* f.triples.currentPosition();
    yield* f.coordinator.poll(day);
    yield* f.coordinator.reconcileNow(day);
    expect(yield* f.triples.currentPosition()).toBe(after);
    expect((yield* f.coordinator.requirements())).toHaveLength(1);
  })));

  test("competing initial workers create only one occurrence", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    const workers = [f.coordinator, createCoordinator(f.triples, { consumer, definition: f.definition })];
    const exits = yield* Effect.all(workers.map((worker) => Effect.exit(worker.reconcileNow(day))), { concurrency: "unbounded" });
    expect(exits.some(Exit.isSuccess)).toBe(true);
    yield* f.coordinator.poll(day);
    expect((yield* f.coordinator.requirements()).filter((r) => r.status === "open")).toHaveLength(1);
  })));

  test("a paused stale worker cannot overwrite newer work or its wakeup", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    yield* f.coordinator.poll(day);
    const ready = yield* Deferred.make<void>();
    const resume = yield* Deferred.make<void>();
    const paused: TriplesService = {
      ...f.triples,
      transact: (operations, meta) => meta?.actor === "metacrdt/coordinator"
        ? Effect.gen(function* () {
          yield* Deferred.succeed(ready, undefined);
          yield* Deferred.await(resume);
          return yield* f.triples.transact(operations, meta);
        })
        : f.triples.transact(operations, meta),
    };
    const stale = createCoordinator(paused, { consumer, definition: f.definition });
    const fiber = yield* Effect.forkChild(Effect.exit(stale.reconcileNow(day + 1)));
    yield* Deferred.await(ready);
    yield* f.submit();
    const fresh = yield* f.coordinator.poll(day * 2);
    yield* Deferred.succeed(resume, undefined);
    expect(Exit.isFailure(yield* Fiber.join(fiber))).toBe(true);
    expect((yield* f.coordinator.state())?.runId).toBe(fresh.runId);
    expect((yield* f.coordinator.state())?.nextWakeupAt).toBe(day * 3);
    expect((yield* f.coordinator.requirements())[0]?.status).toBe("resolved");
  })));

  test("independent consumers never resolve each other's requirements", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    const other = createCoordinator(f.triples, { consumer: "another-consumer", definition: f.definition });
    yield* f.coordinator.poll(day);
    yield* other.poll(day);
    expect((yield* other.requirements())[0]?.id).not.toBe((yield* f.coordinator.requirements())[0]?.id);
    yield* f.submit();
    yield* other.poll(day * 2);
    expect((yield* other.requirements())[0]?.status).toBe("resolved");
    expect((yield* f.coordinator.requirements())[0]?.status).toBe("open");
    yield* f.coordinator.poll(day * 2);
    expect((yield* f.coordinator.requirements())[0]?.status).toBe("resolved");
  })));

  test("provenance changes revise an open occurrence without replacing its identity", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    yield* f.coordinator.poll(day);
    const original = (yield* f.coordinator.requirements())[0]!;
    yield* f.place("placement:two");
    yield* f.coordinator.poll(day + 1);
    const revised = (yield* f.coordinator.requirements())[0]!;
    expect(revised.id).toBe(original.id);
    expect(revised.occurrence).toBe(1);
    expect(revised.revision).not.toBe(original.revision);
    expect(revised.materializationRun).not.toBe(original.materializationRun);
  })));

  test("future-effective facts schedule an opening even when there are no candidates", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place("placement:future", day * 2);
    const state = yield* f.coordinator.poll(day);
    expect(yield* f.coordinator.requirements()).toHaveLength(0);
    expect(state.nextWakeupAt).toBe(day * 2);
    yield* f.coordinator.poll(day * 2);
    expect(yield* f.coordinator.requirements()).toHaveLength(1);
  })));

  test("release switches and historical coordinates cannot silently rewrite live work", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    yield* f.coordinator.poll(day);
    const next = yield* Derivation.make({ ...f.definition, configSnapshot: "different-release" });
    const upgraded = createCoordinator(f.triples, { consumer, definition: next });
    expect(Exit.isFailure(yield* Effect.exit(upgraded.poll(day)))).toBe(true);
    expect(Exit.isFailure(yield* Effect.exit(f.coordinator.reconcileNow(day - 1)))).toBe(true);
    expect((yield* f.coordinator.requirements())[0]?.configSnapshot).toBe(f.release.snapshot.id);
  })));

  test("unrelated transactions advance the feed without rematerialization", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    const initial = yield* f.coordinator.poll(day);
    const unrelated = yield* f.triples.transact([{
      op: "assert", entityId: EntityId.make("note:one"), attribute: ":note/body",
      value: { type: "string", value: "unrelated" },
    }]);
    expect((yield* f.coordinator.poll(day + 1)).runId).toBe(initial.runId);
    expect((yield* ConsumerCheckpoint.get(f.triples, `metacrdt:${consumer}`))?.position).toBe(unrelated.position);
  })));

  test("a population limit fails before any requirement or timer is committed", () => run(Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.place();
    const limited = createCoordinator(f.triples, { consumer, definition: f.definition, maxOccurrences: 1 });
    yield* limited.poll(day);
    yield* f.submit();
    yield* limited.poll(day * 2);
    expect(Exit.isFailure(yield* Effect.exit(limited.poll(day * 3)))).toBe(true);
    expect((yield* limited.state())?.nextWakeupAt).toBe(day * 3);
    expect((yield* limited.requirements()).map((r) => r.status)).toEqual(["resolved"]);
    yield* f.coordinator.poll(day * 3);
    expect(yield* f.coordinator.requirements()).toHaveLength(2);
  })));
});
